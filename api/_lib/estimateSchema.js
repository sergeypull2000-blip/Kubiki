const text = (value, max = 160) => typeof value === "string" && value.trim() && value.length <= max;
const numberValue = (value) => (typeof value === "number" || typeof value === "string") && String(value).trim() && Number.isFinite(Number(String(value).replace(/\s/g, "")));
const exact = (value, required, optional = []) => value && typeof value === "object" && !Array.isArray(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

export const GENERATED_STRUCTURE_VERSION = 2;
export const GENERATED_PAYMENT_TYPES = Object.freeze(["fix_total", "fix_task", "hourly", "shift"]);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const keys = (value) => object(value) ? Object.keys(value).sort().slice(0, 32) : [];
const missing = (value, required) => required.filter((key) => !object(value) || !Object.hasOwn(value, key));
const unknown = (value, allowed) => keys(value).filter((key) => !allowed.includes(key));
const inputType = (value) => Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

function rejected(base, validationPath, reason, value, required = [], optional = [], executorFailure = false) {
  return { ...base, ok: false, validationPath, reason,
    ...(required.length ? { missingKeys: missing(value, required) } : {}),
    ...(object(value) ? { unknownKeys: unknown(value, [...required, ...optional]) } : {}),
    ...(executorFailure ? {
      rejectedExecutorType: typeof value?.type === "string" ? value.type : null,
      rejectedExecutorKeys: keys(value),
    } : {}),
  };
}

export function diagnoseGeneratedStructure(input) {
  const base = { inputType: inputType(input), jsonParse: typeof input === "string" ? "failed" : "not_required" };
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input.trim()); base.jsonParse = "success"; }
    catch { return { ...base, ok: false, validationPath: "$", reason: "invalid_json" }; }
  }
  base.topLevelType = inputType(value);
  if (!object(value)) return { ...base, ok: false, validationPath: "$", reason: "invalid_top_level_type" };
  base.topLevelKeys = keys(value); base.schemaVersion = value.schemaVersion ?? null; base.kind = typeof value.kind === "string" ? value.kind : null;
  base.generationScope = typeof value.generationScope === "string" ? value.generationScope : null;
  base.stagesCount = Array.isArray(value.stages) ? value.stages.length : null; base.stages = [];
  const topRequired = ["schemaVersion", "kind", "generationScope", "projectName", "stages", "warnings"];
  if (missing(value, topRequired).length) return rejected(base, "$", "missing_top_level_keys", value, topRequired);
  if (unknown(value, topRequired).length) return rejected(base, "$", "unknown_top_level_keys", value, topRequired);
  if (value.schemaVersion !== 2) return rejected(base, "$.schemaVersion", "invalid_schema_version", value);
  if (value.kind !== "generated_structure") return rejected(base, "$.kind", "invalid_structure_kind", value);
  if (!["whole_project", "fragment"].includes(value.generationScope)) return rejected(base, "$.generationScope", "invalid_generation_scope", value);
  if (!text(value.projectName)) return rejected(base, "$.projectName", "invalid_project_name", value);
  if (!Array.isArray(value.stages) || !value.stages.length || value.stages.length > 30) return rejected(base, "$.stages", "invalid_stages", value);
  if (!Array.isArray(value.warnings) || value.warnings.length > 20 || !value.warnings.every((item) => typeof item === "string" && item.length <= 500)) return rejected(base, "$.warnings", "invalid_warnings", value);
  let taskTotal = 0, executorTotal = 0;
  for (let si = 0; si < value.stages.length; si += 1) {
    const stage = value.stages[si], stageMeta = { path: `$.stages[${si}]`, keys: keys(stage), tasksCount: Array.isArray(stage?.tasks) ? stage.tasks.length : null, tasks: [] };
    base.stages.push(stageMeta);
    const stageRequired = ["name", "tasks"];
    if (!object(stage) || missing(stage, stageRequired).length) return rejected(base, stageMeta.path, "missing_stage_keys", stage, stageRequired);
    if (unknown(stage, stageRequired).length) return rejected(base, stageMeta.path, "unknown_stage_keys", stage, stageRequired);
    if (!text(stage.name)) return rejected(base, `${stageMeta.path}.name`, "invalid_stage_name", stage);
    if (!Array.isArray(stage.tasks) || !stage.tasks.length) return rejected(base, `${stageMeta.path}.tasks`, "invalid_tasks", stage);
    for (let ti = 0; ti < stage.tasks.length; ti += 1) {
      const task = stage.tasks[ti], taskMeta = { path: `${stageMeta.path}.tasks[${ti}]`, keys: keys(task), executorsCount: Array.isArray(task?.executors) ? task.executors.length : null, executors: [] };
      stageMeta.tasks.push(taskMeta); taskTotal += 1;
      const taskRequired = ["name", "executors"], taskOptional = ["estimate"];
      if (!object(task) || missing(task, taskRequired).length) return rejected(base, taskMeta.path, "missing_task_keys", task, taskRequired, taskOptional);
      if (unknown(task, [...taskRequired, ...taskOptional]).length) return rejected(base, taskMeta.path, "unknown_task_keys", task, taskRequired, taskOptional);
      if (!text(task.name)) return rejected(base, `${taskMeta.path}.name`, "invalid_task_name", task);
      if (!Array.isArray(task.executors) || !task.executors.length) return rejected(base, `${taskMeta.path}.executors`, "invalid_executors", task);
      if (task.estimate !== undefined && (!exact(task.estimate, ["amount"]) || !numberValue(task.estimate.amount))) return rejected(base, `${taskMeta.path}.estimate`, "invalid_task_estimate", task.estimate, ["amount"]);
      for (let ei = 0; ei < task.executors.length; ei += 1) {
        const executor = task.executors[ei], path = `${taskMeta.path}.executors[${ei}]`;
        const executorMeta = { path, discriminator: typeof executor?.type === "string" ? executor.type : null, keys: keys(executor) };
        taskMeta.executors.push(executorMeta); executorTotal += 1;
        if (!object(executor)) return rejected(base, path, "invalid_executor_type", executor, [], [], true);
        if (!Object.hasOwn(executor, "type")) return rejected(base, path, "missing_executor_discriminator", executor, ["type"], [], true);
        const optional = ["role", "paymentType", "compensation", "quantity", "tax", "count", "copies"];
        const required = executor.type === "anonymous_named" ? ["type", "name"] : executor.type === "anonymous_unnamed" ? ["type"] : executor.type === "performer_binding" ? ["type", "key", "performerName"] : ["type"];
        const allowedOptional = executor.type === "performer_binding" ? [] : optional;
        if (!["anonymous_named", "anonymous_unnamed", "performer_binding"].includes(executor.type)) return rejected(base, `${path}.type`, "unknown_executor_discriminator", executor, [], [], true);
        if (missing(executor, required).length) return rejected(base, path, "missing_executor_keys", executor, required, allowedOptional, true);
        if (unknown(executor, [...required, ...allowedOptional]).length) return rejected(base, path, "unknown_executor_keys", executor, required, allowedOptional, true);
        if (!normalizeExecutor(executor)) return rejected(base, path, "invalid_executor_fields", executor, [], [], true);
      }
    }
  }
  if (taskTotal > 200) return rejected(base, "$.stages", "task_limit_exceeded", value);
  if (executorTotal > 200) return rejected(base, "$.stages", "executor_limit_exceeded", value);
  return { ...base, ok: true, validationPath: "$", reason: "valid" };
}

function normalizeExecutor(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const countKey = Object.hasOwn(raw, "count") ? "count" : Object.hasOwn(raw, "copies") ? "copies" : null;
  const count = countKey ? raw[countKey] : 1;
  if (!Number.isInteger(count) || count < 1 || count > 10) return null;
  const value = { ...raw }; delete value.count; delete value.copies;
  const financial = ["compensation", "quantity", "tax"];
  if (value.type === "anonymous_named") {
    if (!exact(value, ["type", "name"], ["role", "paymentType", ...financial]) || !text(value.name)) return null;
  } else if (value.type === "anonymous_unnamed") {
    if (!exact(value, ["type"], ["role", "paymentType", ...financial])) return null;
  } else if (value.type === "performer_binding") {
    if (!exact(value, ["type", "key", "performerName"]) || !text(value.key) || !text(value.performerName)) return null;
  } else return null;
  if (value.role !== undefined && !text(value.role)) return null;
  if (value.paymentType !== undefined && !GENERATED_PAYMENT_TYPES.includes(value.paymentType)) return null;
  if (financial.some((key) => value[key] !== undefined && (!numberValue(value[key]) || Number(String(value[key]).replace(/\s/g, "")) < 0 || Number(String(value[key]).replace(/\s/g, "")) > 1_000_000_000))) return null;
  return Array.from({ length: count }, () => structuredClone(value));
}

function parseV2(value) {
  if (!exact(value, ["schemaVersion", "kind", "generationScope", "projectName", "stages", "warnings"])
    || value.schemaVersion !== GENERATED_STRUCTURE_VERSION || value.kind !== "generated_structure"
    || !["whole_project", "fragment"].includes(value.generationScope) || !text(value.projectName)
    || !Array.isArray(value.stages) || !value.stages.length || value.stages.length > 30
    || !Array.isArray(value.warnings) || value.warnings.length > 20 || !value.warnings.every((item) => typeof item === "string" && item.length <= 500)) return null;
  let tasks = 0, executors = 0;
  const stages = [];
  for (const stage of value.stages) {
    if (!exact(stage, ["name", "tasks"]) || !text(stage.name) || !Array.isArray(stage.tasks) || !stage.tasks.length) return null;
    const nextStage = { name: stage.name.trim(), tasks: [] };
    for (const task of stage.tasks) {
      if (!exact(task, ["name", "executors"], ["estimate"]) || !text(task.name) || !Array.isArray(task.executors) || !task.executors.length) return null;
      if (task.estimate !== undefined && (!exact(task.estimate, ["amount"]) || !numberValue(task.estimate.amount))) return null;
      const drafts = [];
      for (const executor of task.executors) {
        const normalized = normalizeExecutor(executor); if (!normalized) return null; drafts.push(...normalized);
      }
      tasks += 1; executors += drafts.length;
      nextStage.tasks.push({ name: task.name.trim(), executors: drafts, ...(task.estimate === undefined ? {} : { estimate: { amount: Number(task.estimate.amount) } }) });
    }
    stages.push(nextStage);
  }
  if (tasks > 200 || executors > 200) return null;
  return { ...value, projectName: value.projectName.trim(), stages };
}

// Compatibility boundary for persisted/tests and temporarily stale model responses.
// It is immediately upgraded; downstream code never sees the old Task.cost DTO.
function upgradeLegacy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.stages) || !Array.isArray(value.warnings)) return null;
  const upgraded = {
    schemaVersion: 2, kind: "generated_structure", generationScope: "whole_project",
    projectName: value.projectName, warnings: value.warnings,
    stages: value.stages.map((stage) => ({ name: stage.name, tasks: Array.isArray(stage.tasks) ? stage.tasks.map((task) => ({
      name: task.name,
      executors: task.performerBindings?.length
        ? task.performerBindings.map((binding) => ({ type: "performer_binding", key: binding.key, performerName: binding.performerName }))
        : [{ type: "anonymous_unnamed", paymentType: "fix_total", compensation: task.cost }],
    })) : null })),
  };
  const parsed = parseV2(upgraded);
  if (parsed) parsed.stages.forEach((stage, si) => stage.tasks.forEach((task, ti) => Object.defineProperty(task, "cost", { value: value.stages[si].tasks[ti].cost, enumerable: false })));
  return parsed;
}

export function parseEstimate(raw) {
  if (!raw) return null;
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : structuredClone(raw); } catch { return null; }
  return value?.schemaVersion === 2 || value?.kind === "generated_structure" ? parseV2(value) : upgradeLegacy(value);
}

export const ESTIMATE_REPAIR_PROMPT = "Исправь предыдущий ответ. Верни только GeneratedStructure schemaVersion 2: generated_structure → stages → tasks → executors. Не кодируй исполнителей или деньги в названии Task. Не возвращай IDs, snapshots, tags или operations.";
