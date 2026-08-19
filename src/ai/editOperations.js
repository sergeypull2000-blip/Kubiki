import { PAYMENT_OPTIONS, SPECIALIZATION_OPTIONS, GRADE_OPTIONS, SOFTWARE_OPTIONS, STAGE_PRESETS } from "../constants.js";
import { buildExecutorFromPerformer, performerSnapshot } from "../performerLibrary.js";
import { makeExecutor, makeStage, makeTag, makeTask, normalizeProject, setSheetStages } from "../store.js";
import { activeSheetId, sheetProject } from "../sheets.js";
import { projectSum } from "../calculations.js";
import { numVal, roundMoney } from "../utils.js";

export const AI_EDIT_MAX_MONEY = 1_000_000_000;
const PAYMENT_TYPES = new Set(PAYMENT_OPTIONS.map((item) => item.key));
const TAG_RULES = {
  // Executor roles are bounded user text. ROLE_OPTIONS drives suggestions and
  // semantic-model normalization, but imported/generated roles may be custom.
  role: null,
  name: null,
  spec: new Set(SPECIALIZATION_OPTIONS),
  grade: new Set(GRADE_OPTIONS),
  soft: new Set(SOFTWARE_OPTIONS),
  tax: "tax",
};
const CORE_TAG_KEYS = new Set(["role", "name", "payment", "tax"]);
const PRESET_KEYS = new Set([...STAGE_PRESETS.map((item) => item.key), "custom"]);

export class AiEditValidationError extends Error {
  constructor(code, message, operationId = null) { super(message); this.name = "AiEditValidationError"; this.code = code; this.operationId = operationId; }
}

const fail = (code, message, operation) => { throw new AiEditValidationError(code, message, operation?.id || null); };
const clone = (value) => structuredClone(value);
const moneyString = (value, operation) => {
  if (typeof value !== "string" && typeof value !== "number") fail("invalid_financial_value", "Финансовое значение имеет неверный тип", operation);
  const source = String(value).trim();
  if (!source || !/^\d+(?:[.,]\d{1,2})?$/.test(source)) fail("invalid_financial_value", "Финансовое значение должно быть неотрицательным числом", operation);
  const number = Number(source.replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || number > AI_EDIT_MAX_MONEY) fail("invalid_financial_value", `Финансовое значение должно быть от 0 до ${AI_EDIT_MAX_MONEY}`, operation);
  return source.replace(",", ".");
};
const quantityString = (value, operation) => moneyString(value, operation);

export function indexProject(project) {
  const stages = new Map(), tasks = new Map(), executors = new Map(), tags = new Map(), allIds = new Set();
  const add = (map, id, value, kind) => {
    if (typeof id !== "string" || !id || allIds.has(id)) throw new AiEditValidationError("duplicate_or_invalid_id", `Некорректный или повторяющийся ${kind} id`);
    allIds.add(id); map.set(id, value);
  };
  for (const stage of project?.stages || []) {
    add(stages, stage.id, { stage }, "Stage");
    for (const task of stage.tasks || []) {
      add(tasks, task.id, { stage, task }, "Task");
      for (const executor of task.executors || []) {
        add(executors, executor.id, { stage, task, executor }, "Executor");
        const tagKeys = new Set();
        for (const tag of executor.tags || []) {
          add(tags, tag.id, { stage, task, executor, tag }, "tag");
          if (tagKeys.has(tag.key)) throw new AiEditValidationError("duplicate_tag", `У Executor ${executor.id} повторяется тег ${tag.key}`);
          tagKeys.add(tag.key);
        }
      }
    }
  }
  return { stages, tasks, executors, tags, allIds };
}

function scopeAllows(scope, located, targetKind) {
  if (scope.kind === "project") return true;
  if (scope.kind === "stage") return located.stage?.id === scope.stageId || targetKind === "stage" && located.stage?.id === scope.stageId;
  if (scope.kind === "task") return located.task?.id === scope.taskId || targetKind === "task" && located.task?.id === scope.taskId;
  return located.executor?.id === scope.executorId || targetKind === "executor" && located.executor?.id === scope.executorId || targetKind === "tag" && located.executor?.id === scope.executorId;
}

function requireTarget(index, kind, targetId, scope, operation) {
  const located = index[`${kind}s`]?.get(targetId);
  if (!located) fail("target_not_found", `${kind} ${targetId} не найден`, operation);
  if (!scopeAllows(scope, located, kind)) fail("target_out_of_scope", `${kind} ${targetId} находится вне выбранного контекста`, operation);
  return located;
}

function requireNewId(idPool, poolName, value, used, index, operation) {
  if (!idPool?.[poolName]?.includes(value)) fail("id_not_in_pool", `Новый id ${value} не был выдан Kubiki`, operation);
  if (used.has(value) || index.allIds.has(value)) fail("duplicate_id", `Id ${value} уже используется`, operation);
  used.add(value);
}

function contextualCreationAllows(index, scope, operation) {
  if (scope.kind === "project") return true;
  if (operation.type === "stage.add") return scope.kind === "stage" && operation.targetId === scope.projectId && index.stages.has(scope.stageId);
  if (operation.type === "task.add") {
    if (!scope.stageId || operation.targetId !== scope.stageId || !index.stages.has(scope.stageId)) return false;
    if (scope.kind === "task") return index.tasks.get(scope.taskId)?.stage.id === scope.stageId;
    return scope.kind === "stage";
  }
  if (["executor.addAnonymous", "executor.addFromPerformer"].includes(operation.type)) {
    const located = index.tasks.get(operation.targetId);
    if (!located || located.stage.id !== scope.stageId) return false;
    // A Stage-scoped semantic request may create in a Task that the compiler
    // resolved as the sole/clarified contextual parent. This is still bounded
    // by the hard Stage; existing-entity edits continue through scopeAllows.
    if (scope.kind === "stage") return true;
    if (!scope.taskId || operation.targetId !== scope.taskId) return false;
    if (scope.kind === "executor") return index.executors.get(scope.executorId)?.task.id === scope.taskId;
    return scope.kind === "task";
  }
  return false;
}

function performerById(performers, id, operation) {
  const performer = (performers || []).find((item) => item.id === id);
  if (!performer) fail("performer_not_found", "Performer не найден или не принадлежит пользователю", operation);
  if (performer.active === false) fail("performer_inactive", "Неактивного Performer нельзя назначить", operation);
  return performer;
}

function performerWasExplicitlyRequested(performer, instruction, selectedSources, source = null) {
  if ((selectedSources || []).some((item) => item.kind === "performer" && item.id === performer.id)) return true;
  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  const query = normalize(instruction), provenanceName = normalize(source?.kind === "performer" && source.id === performer.id ? source.name : ""), provenanceStem = provenanceName.split(/\s+/)[0]?.slice(0, Math.max(3, provenanceName.split(/\s+/)[0]?.length - 1));
  if (/(?:из\s+базы|performer|библиотек\p{L}*)/iu.test(instruction || "") && provenanceStem?.length >= 3 && query.split(/\s+/).some((word) => word.startsWith(provenanceStem))) return true;
  if (!/(?:назнач\p{L}*|добав\p{L}*|постав\p{L}*|замен\p{L}*|исполнител\p{L}*)/iu.test(instruction || "")) return false;
  const fullName = normalize([performer.firstName, performer.lastName].filter(Boolean).join(" ")), firstName = normalize(performer.firstName), firstStem = firstName.slice(0, Math.max(3, firstName.length - 1));
  return Boolean(fullName && query.includes(fullName) || firstStem.length >= 3 && query.split(/\s+/).some((word) => word.startsWith(firstStem)));
}

function replaceAt(items, id, updater) { return items.map((item) => item.id === id ? updater(item) : item); }
function removeAt(items, id) { return items.filter((item) => item.id !== id); }
function insertBefore(items, item, beforeId) { const next = [...items], at = beforeId === null ? next.length : next.findIndex((entry) => entry.id === beforeId); if (at < 0) return null; next.splice(at, 0, item); return next; }

function updateExecutor(project, located, updater) {
  return { ...project, stages: replaceAt(project.stages, located.stage.id, (stage) => ({ ...stage, tasks: replaceAt(stage.tasks, located.task.id, (task) => ({ ...task, executors: replaceAt(task.executors, located.executor.id, updater) })) })) };
}

function paymentTag(executor, operation) {
  const tag = (executor.tags || []).find((item) => item.key === "payment");
  if (!tag) fail("payment_tag_missing", "У Executor нет тега оплаты", operation);
  return tag;
}

function validateTagValue(key, value, operation) {
  if (!Object.hasOwn(TAG_RULES, key)) fail("unknown_tag", `Тег ${key} не поддерживается`, operation);
  if (key === "tax") {
    const normalized = moneyString(value, operation), number = Number(normalized);
    if (number >= 100) fail("invalid_tax", "Налог Executor должен быть меньше 100%", operation);
    return normalized;
  }
  const normalized = String(value).normalize("NFKC").trim();
  if (!normalized || normalized.length > 160) fail("invalid_tag_value", `Некорректное значение тега ${key}`, operation);
  const options = TAG_RULES[key];
  if (options && !options.has(normalized)) fail("invalid_tag_value", `Значение не поддерживается тегом ${key}`, operation);
  return normalized;
}

function scaleMoneyValue(value, factor) {
  return String(roundMoney(numVal(value) * factor));
}

/* Deterministic proportional scaling of every scalable monetary input in the
   (already sheet-scoped) project: fixed amounts, per-unit/hour/shift rates and
   task directCost. Quantities, markup, tax, VAT and structure stay untouched. */
function scaleSheetMonetaryInputs(project, factor) {
  return { ...project, stages: (project.stages || []).map((stage) => ({
    ...stage,
    tasks: (stage.tasks || []).map((task) => {
      const executors = (task.executors || []).map((executor) => {
        const payTag = (executor.tags || []).find((tag) => tag.key === "payment");
        const type = payTag?.payment?.type;
        if (type === "fix_total" && String(executor.amount || "").trim() !== "") {
          return { ...executor, amount: scaleMoneyValue(executor.amount, factor) };
        }
        if (["fix_task", "hourly", "shift"].includes(type) && String(payTag.payment.rate || "").trim() !== "") {
          return { ...executor, tags: executor.tags.map((tag) => tag.id === payTag.id ? { ...tag, payment: { ...tag.payment, rate: scaleMoneyValue(tag.payment.rate, factor) } } : tag) };
        }
        return executor;
      });
      const directCost = executors.length === 0 && task.directCost != null && String(task.directCost).trim() !== "" ? scaleMoneyValue(task.directCost, factor) : task.directCost;
      return { ...task, executors, directCost };
    }),
  })) };
}

function applyOne(project, operation, context) {
  const index = indexProject(project), { scope: requestedScope, idPool, usedIds, performers, instruction, selectedSources } = context;
  // Follow-up fields of an entity created earlier in this same validated diff belong
  // to the contextual creation transaction, not to the pre-existing edit scope.
  const scope = usedIds.has(operation.targetId) ? { kind: "project", projectId: requestedScope.projectId } : requestedScope;
  switch (operation.type) {
    case "stage.add": {
      if (!contextualCreationAllows(index, scope, operation)) fail("target_out_of_scope", "Stage можно добавить только в контексте всей сметы или выбранного Stage", operation);
      requireNewId(idPool, "stages", operation.value.stageId, usedIds, index, operation);
      if (!PRESET_KEYS.has(operation.value.presetKey)) fail("invalid_preset", "Неизвестный preset Stage", operation);
      if (operation.value.beforeStageId !== null && !index.stages.has(operation.value.beforeStageId)) fail("target_not_found", "Позиция Stage не найдена", operation);
      const preset = STAGE_PRESETS.find((item) => item.key === operation.value.presetKey) || { key: "custom", name: "" };
      const stage = { ...makeStage(preset), id: operation.value.stageId, name: operation.value.name };
      return { ...project, stages: insertBefore(project.stages, stage, operation.value.beforeStageId) };
    }
    case "stage.rename": { const { stage } = requireTarget(index, "stage", operation.targetId, scope, operation); return { ...project, stages: replaceAt(project.stages, stage.id, (item) => ({ ...item, name: operation.value.name.trim() })) }; }
    case "stage.delete": { requireTarget(index, "stage", operation.targetId, scope, operation); return { ...project, stages: removeAt(project.stages, operation.targetId) }; }
    case "task.add": {
      if (!contextualCreationAllows(index, scope, operation)) fail("target_out_of_scope", "Task нельзя добавить вне доверенного parent Stage", operation);
      const { stage } = index.stages.get(operation.targetId) || {};
      requireNewId(idPool, "tasks", operation.value.taskId, usedIds, index, operation);
      if (operation.value.beforeTaskId !== null && !stage.tasks.some((item) => item.id === operation.value.beforeTaskId)) fail("target_not_found", "Позиция Task не найдена в целевом Stage", operation);
      const task = { ...makeTask(), id: operation.value.taskId, name: operation.value.name.trim() };
      return { ...project, stages: replaceAt(project.stages, stage.id, (item) => ({ ...item, tasks: insertBefore(item.tasks, task, operation.value.beforeTaskId) })) };
    }
    case "task.rename": { const { stage, task } = requireTarget(index, "task", operation.targetId, scope, operation); return { ...project, stages: replaceAt(project.stages, stage.id, (item) => ({ ...item, tasks: replaceAt(item.tasks, task.id, (entry) => ({ ...entry, name: operation.value.name.trim() })) })) }; }
    case "task.delete": { const { stage } = requireTarget(index, "task", operation.targetId, scope, operation); return { ...project, stages: replaceAt(project.stages, stage.id, (item) => ({ ...item, tasks: removeAt(item.tasks, operation.targetId) })) }; }
    case "executor.addAnonymous": {
      if (!contextualCreationAllows(index, scope, operation)) fail("target_out_of_scope", "Executor нельзя добавить вне доверенного parent Task", operation);
      const { stage, task } = index.tasks.get(operation.targetId) || {};
      requireNewId(idPool, "executors", operation.value.executorId, usedIds, index, operation);
      requireNewId(idPool, "tags", operation.value.roleTagId, usedIds, index, operation);
      const executor = { ...makeExecutor(), id: operation.value.executorId };
      executor.tags[0].id = operation.value.roleTagId;
      return { ...project, stages: replaceAt(project.stages, stage.id, (item) => ({ ...item, tasks: replaceAt(item.tasks, task.id, (entry) => ({ ...entry, executors: [...entry.executors, executor] })) })) };
    }
    case "executor.addFromPerformer": {
      if (!contextualCreationAllows(index, scope, operation)) fail("target_out_of_scope", "Executor нельзя добавить вне доверенного parent Task", operation);
      const { stage, task } = index.tasks.get(operation.targetId) || {}, performer = performerById(performers, operation.value.performerId, operation);
      if (!performerWasExplicitlyRequested(performer, instruction, selectedSources, operation.source)) fail("performer_not_explicit", "Performer не был прямо указан пользователем", operation);
      if (operation.source.kind !== "performer" || operation.source.id !== performer.id) fail("invalid_source", "Операция Performer должна ссылаться на подтверждённый источник", operation);
      requireNewId(idPool, "executors", operation.value.executorId, usedIds, index, operation);
      const executor = buildExecutorFromPerformer(performer, { inheritFinancials: operation.value.inheritFinancials !== false }); executor.id = operation.value.executorId;
      for (const tag of executor.tags) { const replacement = idPool.tags.find((tagId) => !usedIds.has(tagId) && !index.allIds.has(tagId)); if (!replacement) fail("id_pool_exhausted", "Не хватило выданных tag id", operation); usedIds.add(replacement); tag.id = replacement; }
      return { ...project, stages: replaceAt(project.stages, stage.id, (item) => ({ ...item, tasks: replaceAt(item.tasks, task.id, (entry) => ({ ...entry, executors: [...entry.executors, executor] })) })) };
    }
    case "executor.replacePerformer": {
      const located = requireTarget(index, "executor", operation.targetId, scope, operation), performer = performerById(performers, operation.value.performerId, operation);
      if (!/замен\p{L}*/iu.test(instruction || "") || !performerWasExplicitlyRequested(performer, instruction, selectedSources)) fail("performer_replace_not_explicit", "Замена Performer разрешена только по прямому запросу", operation);
      if (operation.source.kind !== "performer" || operation.source.id !== performer.id) fail("invalid_source", "Замена должна ссылаться на подтверждённого Performer", operation);
      const replacement = buildExecutorFromPerformer(performer);
      for (const tag of replacement.tags) { const freshId = idPool.tags.find((tagId) => !usedIds.has(tagId) && !index.allIds.has(tagId)); if (!freshId) fail("id_pool_exhausted", "Не хватило выданных tag id", operation); usedIds.add(freshId); tag.id = freshId; }
      const known = new Set(["id", "tags", "amount", "performerId", "performerSnapshot"]);
      return updateExecutor(project, located, (current) => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => !known.has(key))), id: current.id, tags: replacement.tags, amount: replacement.amount, performerId: performer.id, performerSnapshot: performerSnapshot(performer) }));
    }
    case "executor.payment.setType": {
      const located = requireTarget(index, "executor", operation.targetId, scope, operation);
      if (!PAYMENT_TYPES.has(operation.value.type)) fail("invalid_payment_type", "Неизвестный тип оплаты", operation);
      const existing = located.executor.tags.find((item) => item.key === "payment");
      let tagId = existing?.id;
      if (!tagId) { tagId = idPool.tags.find((item) => !usedIds.has(item) && !index.allIds.has(item)); if (!tagId) fail("id_pool_exhausted", "Не хватило выданных tag id", operation); usedIds.add(tagId); }
      return updateExecutor(project, located, (executor) => ({ ...executor, tags: existing
        ? executor.tags.map((tag) => tag.id === existing.id ? { ...tag, payment: { type: operation.value.type, rate: "", units: "", hours: "", shifts: "" } } : tag)
        : [...executor.tags, { ...makeTag("payment", operation.value.type), id: tagId }] }));
    }
    case "executor.payment.setRate": {
      const located = requireTarget(index, "executor", operation.targetId, scope, operation), tag = paymentTag(located.executor, operation);
      if (!["fix_task", "hourly", "shift"].includes(tag.payment?.type)) fail("payment_type_mismatch", "Ставка недоступна для текущего типа оплаты", operation);
      const value = moneyString(operation.value.value, operation);
      return updateExecutor(project, located, (executor) => ({ ...executor, tags: executor.tags.map((item) => item.id === tag.id ? { ...item, payment: { ...item.payment, rate: value } } : item) }));
    }
    case "executor.payment.setQuantity": {
      const located = requireTarget(index, "executor", operation.targetId, scope, operation), tag = paymentTag(located.executor, operation), expected = { fix_task: "units", hourly: "hours", shift: "shifts" }[tag.payment?.type];
      if (!expected || expected !== operation.value.field) fail("payment_type_mismatch", "Количество не соответствует текущему типу оплаты", operation);
      const value = quantityString(operation.value.value, operation);
      return updateExecutor(project, located, (executor) => ({ ...executor, tags: executor.tags.map((item) => item.id === tag.id ? { ...item, payment: { ...item.payment, [expected]: value } } : item) }));
    }
    case "executor.amount.set": {
      const located = requireTarget(index, "executor", operation.targetId, scope, operation), tag = paymentTag(located.executor, operation);
      if (tag.payment?.type !== "fix_total") fail("payment_type_mismatch", "Amount используется только для фиксированной ставки", operation);
      return updateExecutor(project, located, (executor) => ({ ...executor, amount: moneyString(operation.value.value, operation) }));
    }
    case "executor.tag.add": {
      const located = requireTarget(index, "executor", operation.targetId, scope, operation);
      if (operation.value.key === "payment") fail("unknown_tag", "Payment изменяется только специальными операциями", operation);
      const existing = located.executor.tags.find((item) => item.key === operation.value.key);
      if (existing) {
        const empty = !String(existing.value || "").trim();
        if (!CORE_TAG_KEYS.has(existing.key) || !empty || operation.value.tagId !== existing.id) fail("duplicate_tag", "Тег уже существует", operation);
        const value = validateTagValue(operation.value.key, operation.value.value, operation);
        return updateExecutor(project, located, (executor) => ({ ...executor, tags: executor.tags.map((tag) => tag.id === existing.id ? { ...tag, value } : tag) }));
      }
      requireNewId(idPool, "tags", operation.value.tagId, usedIds, index, operation);
      const value = validateTagValue(operation.value.key, operation.value.value, operation);
      return updateExecutor(project, located, (executor) => ({ ...executor, tags: [...executor.tags, { ...makeTag(operation.value.key, value), id: operation.value.tagId }] }));
    }
    case "executor.tag.update": {
      const located = requireTarget(index, "tag", operation.targetId, scope, operation);
      if (located.executor.id !== operation.value.executorId || located.tag.key === "payment") fail("invalid_tag_target", "Некорректная цель тега", operation);
      const value = validateTagValue(located.tag.key, operation.value.value, operation);
      return updateExecutor(project, located, (executor) => ({ ...executor, tags: executor.tags.map((tag) => tag.id === located.tag.id ? { ...tag, value } : tag) }));
    }
    case "executor.tag.remove": {
      const located = requireTarget(index, "tag", operation.targetId, scope, operation);
      if (located.executor.id !== operation.value.executorId || located.tag.key === "payment") fail("invalid_tag_target", "Некорректная цель тега", operation);
      return updateExecutor(project, located, (executor) => ({ ...executor, tags: executor.tags.filter((tag) => tag.id !== located.tag.id) }));
    }
    case "executor.delete": { const located = requireTarget(index, "executor", operation.targetId, scope, operation); return { ...project, stages: replaceAt(project.stages, located.stage.id, (stage) => ({ ...stage, tasks: replaceAt(stage.tasks, located.task.id, (task) => ({ ...task, executors: removeAt(task.executors, operation.targetId) })) })) }; }
    case "project.setTargetBudget": {
      const target = Number(moneyString(operation.value.target, operation));
      if (target <= 0) fail("invalid_target_budget", "Целевая стоимость сметы должна быть больше нуля", operation);
      const current = projectSum(project);
      if (!(current > 0)) fail("target_budget_unscalable", "Нечего масштабировать: базовая стоимость сметы равна нулю", operation);
      const factor = target / current;
      if (!Number.isFinite(factor) || factor <= 0) fail("target_budget_unscalable", "Не удалось вычислить коэффициент масштабирования", operation);
      return scaleSheetMonetaryInputs(project, factor);
    }
    default: fail("unknown_operation", `Операция ${operation.type} не разрешена`, operation);
  }
}

export function applyAiEditOperations(project, response, { performers = [], idPool, instruction = "", selectedSources = [] } = {}) {
  if (!project || response?.kind !== "diff") throw new AiEditValidationError("invalid_diff", "Ожидался валидный AI diff");
  if (response.scope.projectId !== project.id) throw new AiEditValidationError("project_mismatch", "Diff относится к другому Project");
  const canonical = clone(normalizeProject(project));
  const sheetId = response.scope?.sheetId || activeSheetId(canonical);
  let next = sheetProject(canonical, sheetId);
  const context = { scope: response.scope, idPool, usedIds: new Set(), performers, instruction, selectedSources };
  for (const operation of response.operations) next = applyOne(next, operation, context);
  indexProject(next);
  return normalizeProject(setSheetStages(canonical, sheetId, next.stages));
}
