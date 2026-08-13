import { applyAiEditOperations, AiEditValidationError } from "../../src/ai/editOperations.js";

const text = (value) => typeof value === "string" && value.trim() && value.length <= 160;

export function parseGeneratedStructure(raw) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : structuredClone(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).every((key) => ["schemaVersion", "kind", "projectName", "stages", "warnings"].includes(key)) || !Array.isArray(value.stages) || !value.stages.length || value.stages.length > 30 || !Array.isArray(value.warnings)) return null;
  let tasks = 0, bindings = 0;
  for (const stage of value.stages) {
    if (!stage || !Object.keys(stage).every((key) => ["name", "tasks"].includes(key)) || !text(stage.name) || !Array.isArray(stage.tasks) || !stage.tasks.length) return null;
    for (const task of stage.tasks) {
      tasks += 1;
      if (!task || !Object.keys(task).every((key) => ["name", "cost", "performerBindings"].includes(key)) || !text(task.name) || !Number.isInteger(task.cost) || task.cost < 0 || task.cost > 1_000_000_000) return null;
      if (task.performerBindings !== undefined && (!Array.isArray(task.performerBindings) || !task.performerBindings.every((binding) => binding && Object.keys(binding).length === 2 && text(binding.key) && text(binding.performerName)))) return null;
      bindings += task.performerBindings?.length || 0;
    }
  }
  if (tasks > 200 || bindings > 40 || value.warnings.length > 30 || !value.warnings.every((item) => typeof item === "string" && item.length <= 500)) return null;
  return { schemaVersion: 1, kind: "generated_structure", projectName: text(value.projectName) ? value.projectName.trim() : "Generated fragment", stages: value.stages, warnings: value.warnings };
}

const displayName = (performer) => [performer.firstName, performer.lastName].filter(Boolean).join(" ").trim();
const normalized = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function resolveGeneratedStructure({ draft, performers, prior = null, answer = "", selectedSource = null }) {
  const slotValues = { ...(prior?.slotValues || {}) };
  if (prior?.unresolvedSlots?.length && (answer || selectedSource)) slotValues[prior.unresolvedSlots[0].id] = selectedSource?.id || String(answer).trim();
  const unresolvedSlots = [], bindings = [];
  draft.stages.forEach((stage, stageIndex) => stage.tasks.forEach((task, taskIndex) => (task.performerBindings || []).forEach((binding, bindingIndex) => {
    const id = `binding-${stageIndex}-${taskIndex}-${bindingIndex}`, selected = slotValues[id];
    const matches = selected ? performers.filter((item) => item.id === selected) : performers.filter((item) => {
      const full = normalized(displayName(item)), first = normalized(item.firstName), query = normalized(binding.performerName);
      return query === full || query === first || full.startsWith(`${query} `);
    });
    if (matches.length === 1) { slotValues[id] = matches[0].id; bindings.push({ key: binding.key, performerId: matches[0].id, stageIndex, taskIndex }); }
    else unresolvedSlots.push({ id, question: matches.length ? `Какого Performer «${binding.performerName}» выбрать?` : `Performer «${binding.performerName}» не найден. Кого выбрать?`, choices: matches.slice(0, 10).map((item) => ({ id: `performer:${item.id}`, label: displayName(item) || item.id, source: { kind: "performer", id: item.id } })) });
  })));
  return { draft, slotValues, bindings, unresolvedSlots };
}

export function compileGeneratedStructure({ resolved, request, project, performers }) {
  const operations = [], used = { stages: 0, tasks: 0, executors: 0, tags: 0 }, take = (kind) => {
    const value = request.idPool[kind]?.[used[kind]++];
    if (!value) throw new AiEditValidationError("id_pool_exhausted", `Недостаточно ${kind} id`);
    return value;
  };
  const takeExplicitTag = () => {
    const pool = request.idPool.tags || [], value = pool[pool.length - 1 - used.tags++];
    if (!value) throw new AiEditValidationError("id_pool_exhausted", "Недостаточно tags id");
    return value;
  };
  const add = (type, targetId, value, reason, source = { kind: "current_request" }) => operations.push({ id: `generated-${operations.length + 1}`, type, targetId, ...(value === undefined ? {} : { value }), reason, source });
  const taskIds = new Map(), stageIds = new Map();
  if (request.scope.kind === "project") {
    resolved.draft.stages.forEach((stage, stageIndex) => { const stageId = take("stages"); stageIds.set(stageIndex, stageId); add("stage.add", project.id, { stageId, name: stage.name, presetKey: "custom", beforeStageId: null }, "Добавить сгенерированный Stage"); });
  } else stageIds.set("context", request.scope.stageId);
  resolved.draft.stages.forEach((stage, stageIndex) => stage.tasks.forEach((task, taskIndex) => {
    const stageId = request.scope.kind === "project" ? stageIds.get(stageIndex) : stageIds.get("context"), taskId = take("tasks");
    taskIds.set(`${stageIndex}:${taskIndex}`, taskId); add("task.add", stageId, { taskId, name: task.name, beforeTaskId: null }, "Добавить сгенерированную Task");
    const taskBindings = resolved.bindings.filter((item) => item.stageIndex === stageIndex && item.taskIndex === taskIndex);
    if (taskBindings.length) for (const binding of taskBindings) add("executor.addFromPerformer", taskId, { executorId: take("executors"), performerId: binding.performerId }, "Добавить подтверждённого Performer", { kind: "performer", id: binding.performerId, name: displayName(performers.find((item) => item.id === binding.performerId)) });
    else { const executorId = take("executors"), roleTagId = takeExplicitTag(); add("executor.addAnonymous", taskId, { executorId, roleTagId }, "Добавить стоимость сгенерированной Task"); add("executor.payment.setType", executorId, { type: "fix_total" }, "Использовать фиксированную стоимость"); add("executor.amount.set", executorId, { value: String(task.cost) }, "Установить сгенерированную себестоимость"); }
  }));
  const diff = { schemaVersion: 1, kind: "diff", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, summary: "Добавить сгенерированную структуру", operations, warnings: resolved.draft.warnings };
  applyAiEditOperations(project, diff, { performers, idPool: request.idPool, instruction: request.instruction, selectedSources: request.knowledge.selectedSources });
  return diff;
}
