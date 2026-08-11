import { authenticateRequest } from "./_lib/auth.js";
import { loadOwnAiSettings, normalizeServerAiSettings } from "./_lib/aiSettings.js";
import { createDeepSeekClient, DeepSeekError } from "./_lib/deepseek.js";
import { buildAiEditMessages } from "./_lib/editPrompt.js";
import { loadOwnPerformersForEdit, loadOwnProjectForEdit, loadOwnSelectedKnowledge } from "./_lib/editProject.js";
import { hasExplicitPerformerLibraryIntent, needsClarificationForBareInput, resolveExplicitPerformers } from "./_lib/performerResolver.js";
import { resolveExecutorCreationTask, resolveProjectTarget } from "./_lib/projectTargetResolver.js";
import { createRequestBudget, RequestDeadlineError } from "./_lib/requestBudget.js";
import { validateAiEditRequest } from "../src/ai/editSchema.js";
import { attachTrustedAiEditMetadata, diagnoseAiEditSemanticResponse, parseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { AiEditSemanticCompileError, compileAiEditSemanticCommand } from "../src/ai/editSemanticCompiler.js";
import { projectRevision } from "../src/ai/projectRevision.js";
import { loadOwnKnowledge } from "./_lib/knowledgeRepository.js";
import { projectKnowledge } from "./_lib/knowledgeProjection.js";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const budget = createRequestBudget();
  try {
    const response = await budget.run(executeEdit(req, budget));
    return res.status(response.status).json(response.body);
  } catch (error) {
    console.error("edit-estimate error", { name: error?.name || "Error", code: error?.code || "unknown" });
    const deadline = error instanceof RequestDeadlineError || error?.code === "request_deadline";
    const status = deadline ? 504 : error instanceof DeepSeekError ? error.status : 500;
    return res.status(status).json({ error: deadline ? "AI-редактирование не успело завершиться. Попробуйте снова." : error instanceof DeepSeekError ? error.message : "Не удалось подготовить предложение изменений" });
  }
}

async function executeEdit(req, budget) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const parsedRequest = validateAiEditRequest(req.body);
  if (!parsedRequest.ok) return { status: parsedRequest.status, body: { error: parsedRequest.error } };
  const request = parsedRequest.value;
  const project = await loadOwnProjectForEdit(auth.client, auth.user.id, request.projectId);
  if (!project) return { status: 404, body: { error: "Смета не найдена" } };
  if (!scopeExists(project, request.scope)) return { status: 400, body: { error: "Выбранный контекст не найден в смете" } };
  const serverRevision = await projectRevision(project);
  if (serverRevision !== request.baseRevision) return { status: 409, body: { error: "Смета изменилась. Сначала сохраните её и повторите запрос.", code: "stale_revision" } };
  if (needsClarificationForBareInput(request.instruction)) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, question: "Что именно нужно изменить в смете?" } };
  const projectTarget = resolveProjectTarget(request.instruction, project, request.confirmed.projectEntityId);
  if (projectTarget.clarification) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, ...projectTarget.clarification } };
  const creationTask = resolveExecutorCreationTask(request.instruction, project, request.confirmed.projectEntityId);
  if (creationTask.clarification) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, ...creationTask.clarification } };

  let settings = normalizeServerAiSettings();
  try { settings = await loadOwnAiSettings(auth.client, auth.user.id); } catch (error) { console.error("AI edit settings loading failed", { name: error?.name || "Error" }); }

  const explicitPerformerIntent = hasExplicitPerformerLibraryIntent(request.instruction, request.knowledge.selectedSources, request.confirmed);
  const needsPerformers = explicitPerformerIntent;
  const ownPerformers = needsPerformers ? await loadOwnPerformersForEdit(auth.client, auth.user.id) : [];
  const resolved = resolveExplicitPerformers(request.instruction, ownPerformers, request.knowledge.selectedSources, project, projectTarget.target);
  const selectedPerformerIds = [...new Set([...request.knowledge.selectedSources.filter((item) => item.kind === "performer").map((item) => item.id), ...(request.confirmed.performerId ? [request.confirmed.performerId] : [])])];
  if (selectedPerformerIds.some((id) => !ownPerformers.some((item) => item.id === id))) return { status: 404, body: { error: "Performer не найден или недоступен" } };
  if (resolved.clarification) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, ...resolved.clarification } };

  const selectedKnowledgeSources = request.knowledge.selectedSources.filter((item) => item.kind !== "performer");
  let knowledge = [];
  if (selectedKnowledgeSources.length) {
    knowledge = await loadOwnSelectedKnowledge(auth.client, auth.user.id, selectedKnowledgeSources);
    if (knowledge.length !== selectedKnowledgeSources.length) return { status: 404, body: { error: "Выбранный источник знаний не найден или недоступен" } };
  } else if (request.knowledge.useStudioKnowledge) {
    knowledge = projectKnowledge(await loadOwnKnowledge(auth.client, auth.user.id, { includeHistory: false }));
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { status: 500, body: { error: "DEEPSEEK_API_KEY не задан в переменных окружения Vercel" } };
  const requestModel = createDeepSeekClient({ apiKey: key, url: DEEPSEEK_URL, model: MODEL, budget });
  const raw = await requestModel(buildAiEditMessages({ request, project, personalization: settings.personalization, performers: resolved.performers, knowledge, resolvedProjectTarget: projectTarget.target, resolvedTask: creationTask.task }), { maxTokens: 2500, retries: 1, stage: "ai_edit" });
  const semantic = parseAiEditSemanticResponse(raw);
  if (!semantic) return { status: 502, body: { error: "Модель вернула некорректную semantic command", code: diagnoseAiEditSemanticResponse(raw) } };
  if (semantic.kind !== "command") return { status: 200, body: attachTrustedAiEditMetadata(semantic, request) };
  const performer = request.confirmed.performerId ? ownPerformers.find((item) => item.id === request.confirmed.performerId) : resolved.performers.length === 1 ? resolved.performers[0] : null;
  try {
    const diff = compileAiEditSemanticCommand({ semantic, request, project, resolvedTarget: projectTarget.target, resolvedTask: creationTask.task, performer, performers: ownPerformers });
    return { status: 200, body: diff };
  } catch (error) {
    if (error instanceof AiEditSemanticCompileError) return { status: 422, body: { error: error.message, code: error.code } };
    throw error;
  }
}

function scopeExists(project, scope) {
  if (scope.kind === "project") return scope.projectId === project.id;
  const stage = (project.stages || []).find((item) => item.id === scope.stageId);
  if (!stage) return false;
  if (scope.kind === "stage") return true;
  const task = (stage.tasks || []).find((item) => item.id === scope.taskId);
  if (!task) return false;
  if (scope.kind === "task") return true;
  return (task.executors || []).some((item) => item.id === scope.executorId);
}
