import { authenticateRequest } from "./_lib/auth.js";
import { loadOwnAiSettings, normalizeServerAiSettings } from "./_lib/aiSettings.js";
import { createDeepSeekClient, DeepSeekError } from "./_lib/deepseek.js";
import { createUsageRecorder, UsageLimitError } from "./_lib/aiUsage.js";
import { buildAiEditMessages } from "./_lib/editPrompt.js";
import { loadOwnPerformersForEdit, loadOwnProjectForEdit, loadOwnSelectedKnowledge } from "./_lib/editProject.js";
import { hasExplicitPerformerLibraryIntent, needsClarificationForBareInput } from "./_lib/performerResolver.js";
import { createRequestBudget, RequestDeadlineError } from "./_lib/requestBudget.js";
import { validateAiEditRequest } from "../src/ai/editSchema.js";
import { attachTrustedAiEditMetadata, diagnoseAiEditSemanticResponse, diagnoseAiEditSemanticStructure, normalizeAiEditSemanticPlan, parseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { AiEditSemanticCompileError, compileAiEditSemanticPlan } from "../src/ai/editSemanticCompiler.js";
import { AiEditSemanticPlanError, materializeResolvedSemanticPlan, resolveAiEditSemanticDraft } from "../src/ai/editSemanticPlan.js";
import { signAiEditContinuation, verifyAiEditContinuation } from "./_lib/semanticContinuation.js";
import { indexProject } from "../src/ai/editOperations.js";
import { projectRevision } from "../src/ai/projectRevision.js";
import { loadOwnKnowledge } from "./_lib/knowledgeRepository.js";
import { projectKnowledge } from "./_lib/knowledgeProjection.js";
import { routeAiIntent } from "./_lib/aiIntentRouter.js";
import { compileGeneratedStructure, parseGeneratedStructure, resolveGeneratedStructure } from "./_lib/generatedStructure.js";
import { runEstimateGeneration } from "./_lib/generationOrchestrator.js";

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
    const usageLimit = error instanceof UsageLimitError;
    const deadline = error instanceof RequestDeadlineError || error?.code === "request_deadline";
    const status = usageLimit ? 429 : deadline ? 504 : error instanceof DeepSeekError ? error.status : 500;
    return res.status(status).json({ error: usageLimit ? error.message : deadline ? "AI-редактирование не успело завершиться. Попробуйте снова." : error instanceof DeepSeekError ? error.message : "Не удалось подготовить предложение изменений" });
  }
}

async function executeEdit(req, budget) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const usage = createUsageRecorder({ client: auth.client, userId: auth.user.id });
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
  let settings = normalizeServerAiSettings();
  try { settings = await loadOwnAiSettings(auth.client, auth.user.id); } catch (error) { console.error("AI edit settings loading failed", { name: error?.name || "Error" }); }

  const explicitPerformerIntent = hasExplicitPerformerLibraryIntent(request.instruction, request.knowledge.selectedSources, request.confirmed);
  const needsPerformers = explicitPerformerIntent;
  const ownPerformers = needsPerformers ? await loadOwnPerformersForEdit(auth.client, auth.user.id) : [];
  const selectedPerformerIds = [...new Set([...request.knowledge.selectedSources.filter((item) => item.kind === "performer").map((item) => item.id), ...(request.confirmed.performerId ? [request.confirmed.performerId] : [])])];
  if (selectedPerformerIds.some((id) => !ownPerformers.some((item) => item.id === id))) return { status: 404, body: { error: "Performer не найден или недоступен" } };

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
  const requestModel = createDeepSeekClient({ apiKey: key, url: DEEPSEEK_URL, model: MODEL, budget, usageGate: usage });
  const route = await routeAiIntent({ instruction: request.instruction, requestModel });
  if (!route) return { status: 502, body: { error: "Модель вернула некорректный маршрут AI-запроса", code: "ai_route_invalid_schema" } };
  if (route.kind === "clarification") return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, question: route.question } };
  if (route.kind === "unsupported") return { status: 200, body: { schemaVersion: 1, kind: "error", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, code: route.code, message: "Запрос не поддерживается" } };
  if (route.kind === "generate_structure") return generateStructurePlan({ request, project, auth, settings, requestModel });
  const raw = await requestModel(buildAiEditMessages({ request, project, personalization: settings.personalization, performers: ownPerformers, knowledge }), { maxTokens: 2500, retries: 1, stage: "ai_edit" });
  const semantic = normalizeAiEditSemanticPlan(parseAiEditSemanticResponse(raw));
  if (!semantic) {
    try {
      const schemaDiagnostic = diagnoseAiEditSemanticStructure(raw);
      console.warn("AI semantic schema rejected", schemaDiagnostic);
    } catch {}
    return { status: 502, body: { error: "Модель вернула некорректную semantic command", code: diagnoseAiEditSemanticResponse(raw) } };
  }
  if (semantic.kind === "commands") {
    try {
      const resolvedPlan = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, performers: ownPerformers, instruction: request.instruction, confirmedPerformerIds: selectedPerformerIds });
      if (resolvedPlan.unresolvedSlots.length) return clarificationResponse(request, resolvedPlan);
      const diff = compileAiEditSemanticPlan({ semantic: materializeResolvedSemanticPlan(resolvedPlan), request, project, confirmedTargets: resolvedPlan.confirmedTargets, performers: ownPerformers });
      return { status: 200, body: diff };
    } catch (error) {
      if (error instanceof AiEditSemanticPlanError || error instanceof AiEditSemanticCompileError) return { status: 422, body: { error: error.message, code: error.code } };
      throw error;
    }
  }
  return { status: 200, body: attachTrustedAiEditMetadata(semantic, request) };
}

async function generateStructurePlan({ request, project, auth, settings, requestModel }) {
  const performers = await loadOwnPerformersForEdit(auth.client, auth.user.id);
  const symbolicPrompt = `Generate one strict Kubiki GeneratedStructure v2 fragment. Return JSON only: {"schemaVersion":2,"kind":"generated_structure","generationScope":"fragment","projectName":"...","stages":[{"name":"...","tasks":[{"name":"...","executors":[{"type":"anonymous_named","name":"...","role":"...","paymentType":"fix_total|fix_task|hourly|shift","compensation":0,"quantity":0},{"type":"anonymous_unnamed","role":"...","paymentType":"fix_total","compensation":0},{"type":"performer_binding","key":"unique-symbolic-key","performerName":"..."}]}]}],"warnings":[]}. Every Task has executors. Use anonymous_named only for a person, team or company explicitly named in the user instruction; otherwise use anonymous_unnamed without name. For every anonymous Executor, infer a professional role from its Task when reasonably possible. A missing name is not a reason to omit role; omit role only when it is genuinely ambiguous. Never copy role or profession into name. Tax is optional: return tax only when explicitly supplied by the user or trusted generation policy, otherwise omit it. Preserve explicitly supplied 0% and other numeric tax rates. Only explicit database/library intent is performer_binding. Multiple people are separate drafts; count/copies 1..10 is allowed. Never encode people, roles, payment or tax in Task.name. Never return task.cost, performerId, snapshot, tags, trusted IDs or low-level operations.`;
  const result = await runEstimateGeneration({ brief: request.instruction, systemPrompt: symbolicPrompt, requestModel,
    getGenerationContext: async () => ({ shortlist: { projectTemplates: [], stageTemplates: [], taskTemplates: [], performers: [], historicalProjects: [] }, personalization: settings.personalization }), allowPerformerBindings: true, requestId: request.requestId });
  const draft = parseGeneratedStructure(result.estimate);
  if (!draft) { console.info({ event: "generation_response_validation", requestId: request.requestId, success: false, diagnostic: { reason: "normalized_structure_rejected" } }); return { status: 502, body: { error: "Модель вернула некорректную структуру сметы", code: "ai_semantic_invalid_schema" } }; }
  const resolved = resolveGeneratedStructure({ draft, performers });
  console.info({ event: "generation_performer_resolution", requestId: request.requestId, success: !resolved.unresolvedSlots.length, diagnostic: { reason: resolved.unresolvedSlots.length ? "unresolved_slots" : "resolved", unresolvedCount: resolved.unresolvedSlots.length } });
  if (resolved.unresolvedSlots.length) return generatedClarificationResponse(request, resolved, result.profile);
  try { const body = compileGeneratedStructure({ resolved, request, project, performers, pricingPolicy: result.profile }); console.info({ event: "generation_compile", requestId: request.requestId, success: true, diagnostic: { reason: "compiled" } }); console.info({ event: "generation_response_validation", requestId: request.requestId, success: true, diagnostic: { reason: "diff_validated" } }); return { status: 200, body }; }
  catch (error) { console.info({ event: "generation_compile", requestId: request.requestId, success: false, diagnostic: { reason: "compile_failed", code: typeof error?.code === "string" ? error.code : "unknown" } }); if (error instanceof AiEditSemanticCompileError || error instanceof AiEditSemanticPlanError || error instanceof Error && error.code) return { status: 422, body: { error: error.message, code: error.code || "ai_compile_invalid_generated_structure" } }; throw error; }
}

function generatedClarificationResponse(request, resolved, pricingPolicy = {}) {
  const slot = resolved.unresolvedSlots[0];
  const continuationToken = signAiEditContinuation({ kind: "generated_structure", projectId: request.projectId, baseRevision: request.baseRevision, scope: request.scope,
    generatedDraft: resolved.draft, unresolvedSlots: resolved.unresolvedSlots, slotValues: resolved.slotValues, pricingPolicy });
  return { status: 200, body: { schemaVersion: 1, kind: "clarification", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope,
    question: slot.question, ...(slot.choices?.length ? { choices: slot.choices } : {}), continuationToken } };
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
  if (pending.kind === "generated_structure") {
    const draft = parseGeneratedStructure(pending.generatedDraft);
    if (!draft) return { status: 400, body: { error: "Уточнение недействительно или устарело", code: "ai_continuation_invalid" } };
    try {
      const performers = await loadOwnPerformersForEdit(auth.client, auth.user.id);
      const resolved = resolveGeneratedStructure({ draft, performers, prior: pending, answer: request.continuation.answer, selectedSource: request.continuation.source });
      if (resolved.unresolvedSlots.length) return generatedClarificationResponse(request, resolved, pending.pricingPolicy);
      return { status: 200, body: compileGeneratedStructure({ resolved, request, project, performers, pricingPolicy: pending.pricingPolicy }) };
    } catch (error) {
      if (error instanceof Error && error.code) return { status: 422, body: { error: error.message, code: error.code } };
      throw error;
    }
  }
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
