import { parseEstimate } from "./estimateSchema.js";
import { applyAiEditOperations, AiEditValidationError } from "../../src/ai/editOperations.js";
import { generatedPaymentSemantics } from "../../src/ai/generatedPayment.js";

export const parseGeneratedStructure = parseEstimate;
const displayName = (performer) => [performer.firstName, performer.lastName].filter(Boolean).join(" ").trim();
const normalized = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function resolveGeneratedStructure({ draft, performers, prior = null, answer = "", selectedSource = null }) {
  const slotValues = { ...(prior?.slotValues || {}) };
  if (prior?.unresolvedSlots?.length && (answer || selectedSource)) slotValues[prior.unresolvedSlots[0].id] = selectedSource?.id || String(answer).trim();
  const unresolvedSlots = [], bindings = [];
  draft.stages.forEach((stage, stageIndex) => stage.tasks.forEach((task, taskIndex) => task.executors.forEach((executor, executorIndex) => {
    if (executor.type !== "performer_binding") return;
    const id = `binding-${stageIndex}-${taskIndex}-${executorIndex}`, selected = slotValues[id], query = normalized(executor.performerName);
    const matches = executor.performerId ? performers.filter((item) => item.id === executor.performerId) : selected ? performers.filter((item) => item.id === selected) : performers.filter((item) => {
      const full = normalized(displayName(item)), first = normalized(item.firstName);
      return query === full || query === first || full.startsWith(`${query} `);
    });
    if (matches.length === 1) { slotValues[id] = matches[0].id; bindings.push({ key: executor.key, performerId: matches[0].id, stageIndex, taskIndex, executorIndex }); }
    else unresolvedSlots.push({ id, question: matches.length ? `Какого Performer «${executor.performerName}» выбрать?` : `Performer «${executor.performerName}» не найден. Кого выбрать?`, choices: matches.slice(0, 10).map((item) => ({ id: `performer:${item.id}`, label: displayName(item) || item.id, source: { kind: "performer", id: item.id } })) });
  })));
  return { draft, slotValues, bindings, unresolvedSlots };
}

const money = (value) => String(Math.round(Number(String(value).replace(/\s/g, ""))));
export function compileGeneratedStructure({ resolved, request, project, performers, pricingPolicy = {} }) {
  const operations = [], used = { stages: 0, tasks: 0, executors: 0, tags: 0 };
  const take = (kind) => { const value = request.idPool[kind]?.[used[kind]++]; if (!value) throw new AiEditValidationError("id_pool_exhausted", `Недостаточно ${kind} id`); return value; };
  const takeExplicitTag = () => { const pool = request.idPool.tags || [], value = pool[pool.length - 1 - used.tags++]; if (!value) throw new AiEditValidationError("id_pool_exhausted", "Недостаточно tags id"); return value; };
  const add = (type, targetId, value, reason, source = { kind: "current_request" }) => operations.push({ id: `generated-${operations.length + 1}`, type, targetId, ...(value === undefined ? {} : { value }), reason, source });
  const addTag = (executorId, key, value) => add("executor.tag.add", executorId, { tagId: takeExplicitTag(), key, value: String(value) }, `Установить ${key} Executor`);
  const stageIds = new Map();
  if (request.scope.kind === "project") resolved.draft.stages.forEach((stage, index) => { const id = take("stages"); stageIds.set(index, id); add("stage.add", project.id, { stageId: id, name: stage.name, presetKey: "custom", beforeStageId: null }, "Добавить сгенерированный Stage"); });
  else stageIds.set("context", request.scope.stageId);
  resolved.draft.stages.forEach((stage, stageIndex) => stage.tasks.forEach((task, taskIndex) => {
    const stageId = request.scope.kind === "project" ? stageIds.get(stageIndex) : stageIds.get("context"), taskId = take("tasks");
    add("task.add", stageId, { taskId, name: task.name, beforeTaskId: null }, "Добавить сгенерированную Task");
    task.executors.forEach((draft, executorIndex) => {
      if (draft.type === "performer_binding") {
        const binding = resolved.bindings.find((item) => item.stageIndex === stageIndex && item.taskIndex === taskIndex && item.executorIndex === executorIndex);
        if (!binding) throw new AiEditValidationError("performer_unresolved", "Performer binding не разрешён");
        add("executor.addFromPerformer", taskId, { executorId: take("executors"), performerId: binding.performerId, ...(pricingPolicy.performerRateMode === "leave_blank" ? { inheritFinancials: false } : {}) }, "Добавить подтверждённого Performer", { kind: "performer", id: binding.performerId, name: displayName(performers.find((item) => item.id === binding.performerId)) });
        return;
      }
      const executorId = take("executors"), roleTagId = takeExplicitTag();
      add("executor.addAnonymous", taskId, { executorId, roleTagId }, "Создать Executor");
      if (draft.name) addTag(executorId, "name", draft.name);
      if (draft.role) add("executor.tag.update", roleTagId, { executorId, value: draft.role }, "Установить роль Executor");
      if (draft.tax !== undefined) addTag(executorId, "tax", Number(draft.tax));
      const { type: paymentType, quantityField } = generatedPaymentSemantics(draft);
      if (paymentType) add("executor.payment.setType", executorId, { type: paymentType }, "Установить тип оплаты");
      if (draft.compensation !== undefined) add(paymentType === "fix_total" ? "executor.amount.set" : "executor.payment.setRate", executorId, { value: money(draft.compensation) }, "Установить оплату");
      if (draft.quantity !== undefined && quantityField) add("executor.payment.setQuantity", executorId, { field: quantityField, value: money(draft.quantity) }, "Установить количество");
    });
  }));
  const diff = { schemaVersion: 1, kind: "diff", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, summary: "Добавить сгенерированную структуру", operations, warnings: resolved.draft.warnings };
  applyAiEditOperations(project, diff, { performers, idPool: request.idPool, instruction: request.instruction, selectedSources: request.knowledge.selectedSources });
  return diff;
}
