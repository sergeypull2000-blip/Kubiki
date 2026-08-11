import { authenticateRequest } from "./_lib/auth.js";
import { loadOwnAiSettings, normalizeServerAiSettings } from "./_lib/aiSettings.js";
import { createDeepSeekClient, DeepSeekError } from "./_lib/deepseek.js";
import { buildAiEditMessages } from "./_lib/editPrompt.js";
import { loadOwnPerformersForEdit, loadOwnProjectForEdit, loadOwnSelectedKnowledge } from "./_lib/editProject.js";
import { resolveExplicitPerformers } from "./_lib/performerResolver.js";
import { createRequestBudget, RequestDeadlineError } from "./_lib/requestBudget.js";
import { parseAiEditResponse, validateAiEditRequest } from "../src/ai/editSchema.js";
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

  let settings = normalizeServerAiSettings();
  try { settings = await loadOwnAiSettings(auth.client, auth.user.id); } catch (error) { console.error("AI edit settings loading failed", { name: error?.name || "Error" }); }

  const needsPerformers = request.knowledge.selectedSources.some((item) => item.kind === "performer") || /(?:назнач\p{L}*|добав\p{L}*|постав\p{L}*|замен\p{L}*|исполнител\p{L}*)/iu.test(request.instruction);
  const ownPerformers = needsPerformers ? await loadOwnPerformersForEdit(auth.client, auth.user.id) : [];
  const resolved = resolveExplicitPerformers(request.instruction, ownPerformers, request.knowledge.selectedSources);
  const selectedPerformerIds = request.knowledge.selectedSources.filter((item) => item.kind === "performer").map((item) => item.id);
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
  const raw = await requestModel(buildAiEditMessages({ request, project, personalization: settings.personalization, performers: resolved.performers, knowledge }), { maxTokens: 5000, retries: 1, stage: "ai_edit" });
  const response = parseAiEditResponse(raw, request);
  if (!response) return { status: 502, body: { error: "Модель вернула небезопасный или некорректный diff" } };
  if (response.kind === "diff") {
    const allowedPerformerIds = new Set(resolved.performers.map((item) => item.id));
    const unsafePerformer = response.operations.some((operation) => ["executor.addFromPerformer", "executor.replacePerformer"].includes(operation.type) && (!allowedPerformerIds.has(operation.value.performerId) || operation.source.kind !== "performer" || operation.source.id !== operation.value.performerId));
    if (unsafePerformer) return { status: 502, body: { error: "Модель сослалась на неподтверждённого Performer" } };
  }
  return { status: 200, body: response };
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
