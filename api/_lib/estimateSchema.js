const text = (value, max = 160) => typeof value === "string" && value.trim() && value.length <= max;
const numberValue = (value) => (typeof value === "number" || typeof value === "string") && String(value).trim() && Number.isFinite(Number(String(value).replace(/\s/g, "")));
const exact = (value, required, optional = []) => value && typeof value === "object" && !Array.isArray(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

export const GENERATED_STRUCTURE_VERSION = 2;
export const GENERATED_PAYMENT_TYPES = Object.freeze(["fix_total", "fix_task", "hourly", "shift"]);

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
  if (value.quantity !== undefined && !["fix_task", "hourly", "shift"].includes(value.paymentType)) return null;
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
