import { authenticateRequest } from "./_lib/auth.js";
import { loadOwnAiSettings, normalizeServerAiSettings } from "./_lib/aiSettings.js";
import { createDeepSeekClient, DeepSeekError } from "./_lib/deepseek.js";
import { buildAiEditMessages } from "./_lib/editPrompt.js";
import { loadOwnPerformersForEdit, loadOwnProjectForEdit, loadOwnSelectedKnowledge } from "./_lib/editProject.js";
import { hasExplicitPerformerLibraryIntent, needsClarificationForBareInput, resolveExplicitPerformers } from "./_lib/performerResolver.js";
import { resolveExecutorCreationTask, resolveProjectTarget, resolveTaskCreationStage } from "./_lib/projectTargetResolver.js";
import { createRequestBudget, RequestDeadlineError } from "./_lib/requestBudget.js";
import { validateAiEditRequest } from "../src/ai/editSchema.js";
import { attachTrustedAiEditMetadata, diagnoseAiEditSemanticResponse, parseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { AiEditSemanticCompileError, compileAiEditSemanticCommand, compileAiEditSemanticPlan } from "../src/ai/editSemanticCompiler.js";
import { AiEditSemanticPlanError, materializeResolvedSemanticPlan, resolveAiEditSemanticDraft } from "../src/ai/editSemanticPlan.js";
import { signAiEditContinuation, verifyAiEditContinuation } from "./_lib/semanticContinuation.js";
import { indexProject } from "../src/ai/editOperations.js";
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
  if (request.continuation) return await continueSemanticPlan({ request, project, auth });
  if (needsClarificationForBareInput(request.instruction)) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, question: "Что именно нужно изменить в смете?" } };
  const multiIntent = looksLikeMultiIntent(request.instruction);
  const projectTarget = multiIntent ? { target: null, clarification: null } : resolveProjectTarget(request.instruction, project, request.confirmed.projectEntityId, request.scope);
  if (projectTarget.clarification) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, ...projectTarget.clarification } };
  const taskCreationStage = multiIntent ? { stage: null, clarification: null } : resolveTaskCreationStage(request.instruction, project, request.confirmed.projectEntityId, request.scope);
  if (taskCreationStage.clarification) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, ...taskCreationStage.clarification } };
  const creationTask = multiIntent ? { task: null, clarification: null } : resolveExecutorCreationTask(request.instruction, project, request.confirmed.projectEntityId, request.scope);
  if (creationTask.clarification) return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, ...creationTask.clarification } };

  let settings = normalizeServerAiSettings();
  try { settings = await loadOwnAiSettings(auth.client, auth.user.id); } catch (error) { console.error("AI edit settings loading failed", { name: error?.name || "Error" }); }

  const explicitPerformerIntent = hasExplicitPerformerLibraryIntent(request.instruction, request.knowledge.selectedSources, request.confirmed);
  const needsPerformers = explicitPerformerIntent;
  const ownPerformers = needsPerformers ? await loadOwnPerformersForEdit(auth.client, auth.user.id) : [];
  const selectedPerformerIds = [...new Set([...request.knowledge.selectedSources.filter((item) => item.kind === "performer").map((item) => item.id), ...(request.confirmed.performerId ? [request.confirmed.performerId] : [])])];
  const severalNamedPerformers = namedPerformerCount(request.instruction, ownPerformers) > 1;
  const resolved = severalNamedPerformers ? { performers: ownPerformers, targetExecutorId: null, clarification: null }
    : resolveExplicitPerformers(request.instruction, ownPerformers, selectedPerformerIds.map((id) => ({ kind: "performer", id })), project, projectTarget.target);
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
  const trustedRaw = withTrustedCreationTask(raw, creationTask.task?.id);
  const semantic = parseAiEditSemanticResponse(trustedRaw);
  if (!semantic) return { status: 502, body: { error: "Модель вернула некорректную semantic command", code: diagnoseAiEditSemanticResponse(raw) } };
  if (semantic.kind === "commands") {
    try {
      const resolvedPlan = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, performers: ownPerformers, instruction: request.instruction });
      if (resolvedPlan.unresolvedSlots.length) return clarificationResponse(request, resolvedPlan);
      const diff = compileAiEditSemanticPlan({ semantic: materializeResolvedSemanticPlan(resolvedPlan), request, project, confirmedTargets: resolvedPlan.confirmedTargets, performer: resolved.performers.length === 1 ? resolved.performers[0] : null, performers: ownPerformers });
      return { status: 200, body: diff };
    } catch (error) {
      if (error instanceof AiEditSemanticPlanError || error instanceof AiEditSemanticCompileError) return { status: 422, body: { error: error.message, code: error.code } };
      throw error;
    }
  }
  if (semantic.kind !== "command") return { status: 200, body: attachTrustedAiEditMetadata(semantic, request) };
  const performer = request.confirmed.performerId ? ownPerformers.find((item) => item.id === request.confirmed.performerId) : resolved.performers.length === 1 ? resolved.performers[0] : null;
  try {
    const diff = compileAiEditSemanticCommand({ semantic, request, project, resolvedTarget: taskCreationStage.stage || projectTarget.target, resolvedTask: creationTask.task, performer, performers: ownPerformers, performerExplicit: explicitPerformerIntent });
    return { status: 200, body: diff };
  } catch (error) {
    if (error instanceof AiEditSemanticCompileError) return { status: 422, body: { error: error.message, code: error.code } };
    throw error;
  }
}

function looksLikeMultiIntent(instruction) {
  const actions = instruction.match(/(?:добав|созда|переимен|удал|замен|установ|измен|дела|модел|визуализ|налог)\p{L}*/giu) || [];
  return actions.length > 1;
}

function clarificationResponse(request, resolvedPlan) {
  const slot = resolvedPlan.unresolvedSlots[0];
  const continuationToken = signAiEditContinuation({ projectId: request.projectId, baseRevision: request.baseRevision, scope: request.scope,
    semantic: resolvedPlan.semantic, unresolvedSlots: resolvedPlan.unresolvedSlots, confirmedTargets: resolvedPlan.confirmedTargets, slotValues: resolvedPlan.slotValues });
  return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope,
    question: slot.question, ...(slot.choices?.length ? { choices: slot.choices } : {}), continuationToken } };
}

function confirmedTargetsExist(project, confirmedTargets) {
  const ids = indexProject(project).allIds;
  return Object.values(confirmedTargets || {}).every((entry) => Object.values(entry || {}).every((target) => target?.id && ids.has(target.id)));
}

async function continueSemanticPlan({ request, project, auth }) {
  const pending = verifyAiEditContinuation(request.continuation.token);
  if (!pending || pending.projectId !== request.projectId || pending.baseRevision !== request.baseRevision || JSON.stringify(pending.scope) !== JSON.stringify(request.scope)) return { status: 400, body: { error: "Уточнение недействительно или устарело", code: "ai_continuation_invalid" } };
  const semantic = parseAiEditSemanticResponse(pending.semantic);
  if (!semantic || semantic.kind !== "commands" || !confirmedTargetsExist(project, pending.confirmedTargets)) return { status: 409, body: { error: "Подтверждённые сущности больше не существуют", code: "stale_revision" } };
  try {
    const needsPerformers = semantic.commands.some((command) => command.type === "executor.createFromPerformer");
    const performers = needsPerformers ? await loadOwnPerformersForEdit(auth.client, auth.user.id) : [];
    const resolvedPlan = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, performers, instruction: request.instruction, prior: pending,
      answer: request.continuation.answer, selectedSource: request.continuation.source });
    if (resolvedPlan.unresolvedSlots.length) return clarificationResponse(request, resolvedPlan);
    const diff = compileAiEditSemanticPlan({ semantic: materializeResolvedSemanticPlan(resolvedPlan), request, project, confirmedTargets: resolvedPlan.confirmedTargets, performers });
    return { status: 200, body: diff };
  } catch (error) {
    if (error instanceof AiEditSemanticPlanError || error instanceof AiEditSemanticCompileError) return { status: 422, body: { error: error.message, code: error.code } };
    throw error;
  }
}

function withTrustedCreationTask(raw, taskId) {
  let value; try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : structuredClone(raw); } catch { return raw; }
  if (taskId && value?.kind === "command" && ["executor.createAnonymous", "executor.createFromPerformer"].includes(value.command?.type)) value.command.taskId = taskId;
  return value;
}

function namedPerformerCount(instruction, performers) {
  const query = String(instruction || "").normalize("NFKC").toLocaleLowerCase("ru-RU");
  return new Set((performers || []).filter((item) => {
    const first = String(item.firstName || "").normalize("NFKC").toLocaleLowerCase("ru-RU");
    return first.length >= 2 && query.includes(first.slice(0, Math.max(2, first.length - 1)));
  }).map((item) => String(item.firstName).toLocaleLowerCase("ru-RU"))).size;
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
