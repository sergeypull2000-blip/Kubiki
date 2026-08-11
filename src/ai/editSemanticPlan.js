import { indexProject } from "./editOperations.js";

const normalized = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const same = (a, b) => normalized(a) === normalized(b);
const choice = (kind, id, label) => ({ id: `${kind}-${id}`, label, source: { kind: kind === "performer" ? "performer" : "project", id } });

export class AiEditSemanticPlanError extends Error {
  constructor(code, message) { super(message); this.name = "AiEditSemanticPlanError"; this.code = code; }
}

function entities(project, kind, command = {}) {
  const index = indexProject(project);
  if (kind === "stage") return [...index.stages.values()].map(({ stage }) => ({ id: stage.id, name: stage.name, label: stage.name }));
  if (kind === "task") return [...index.tasks.values()].filter(({ stage }) => !command.stageName || same(stage.name, command.stageName)).map(({ stage, task }) => ({ id: task.id, name: task.name, label: `${stage.name} / ${task.name}` }));
  return [...index.executors.values()].filter(({ stage, task }) => (!command.stageName || same(stage.name, command.stageName)) && (!command.taskName || same(task.name, command.taskName))).map(({ stage, task, executor }) => ({ id: executor.id, name: executor.tags?.find((tag) => tag.key === "name")?.value || "Без имени", label: `${stage.name} / ${task.name} / ${executor.tags?.find((tag) => tag.key === "name")?.value || "Без имени"}` }));
}

function resolveNamed(project, kind, name, command) {
  const matches = entities(project, kind, command).filter((item) => same(item.name, name));
  return matches.length === 1 ? matches[0] : null;
}

function scopeEntity(scope, kind) {
  const id = scope?.[`${kind}Id`]; return id ? { kind, id } : null;
}

export function resolveAiEditSemanticDraft({ semantic, project, scope, performers = [], prior = null, answer = "", selectedSource = null }) {
  if (semantic.kind !== "commands") return { semantic, confirmedTargets: {}, unresolvedSlots: [] };
  const draft = semantic, confirmedTargets = structuredClone(prior?.confirmedTargets || {}), slotValues = { ...(prior?.slotValues || {}) };
  if (prior?.unresolvedSlots?.length && (answer || selectedSource)) {
    const slot = prior.unresolvedSlots[0];
    slotValues[slot.id] = selectedSource?.id || String(answer).trim();
  }
  const unresolvedSlots = [];
  const addSlot = (index, field, kind, question, candidates = []) => unresolvedSlots.push({ id: `slot-${index}-${field}`, commandIndex: index, field, kind, question, choices: candidates.slice(0, 10).map((item) => choice(kind, item.id, item.label)) });
  const refs = new Map();
  draft.commands.forEach((command, index) => { if (command.ref) { if (refs.has(command.ref)) throw new AiEditSemanticPlanError("ai_semantic_duplicate_ref", `Повторный local ref ${command.ref}`); refs.set(command.ref, { type: command.type, index }); } });
  draft.commands.forEach((command, index) => {
    if (command.stageRef && refs.get(command.stageRef)?.type !== "stage.create") throw new AiEditSemanticPlanError("ai_semantic_invalid_ref", `Stage ref ${command.stageRef} не существует`);
    if (command.taskRef && refs.get(command.taskRef)?.type !== "task.create") throw new AiEditSemanticPlanError("ai_semantic_invalid_ref", `Task ref ${command.taskRef} не существует`);
    if (command.targetRef && !refs.has(command.targetRef)) throw new AiEditSemanticPlanError("ai_semantic_invalid_ref", `Target ref ${command.targetRef} не существует`);
    if (command.type === "task.create") {
      const name = command.name || slotValues[`slot-${index}-name`];
      if (!name) addSlot(index, "name", "text", "Как назвать создаваемую Task?");
      if (!command.stageRef) {
        const selected = slotValues[`slot-${index}-stage`] || command.stageName;
        const resolved = selectedSourceFor(slotValues[`slot-${index}-stage`], project, "stage") || selected && resolveNamed(project, "stage", selected, command) || scopeEntity(scope, "stage");
        if (resolved) confirmedTargets[index] = { ...(confirmedTargets[index] || {}), stage: { kind: "stage", id: resolved.id } };
        else addSlot(index, "stage", "stage", "В какой Stage создать Task?", entities(project, "stage"));
      }
    } else if (command.type === "executor.createAnonymous") {
      if (!command.taskRef) {
        const selected = slotValues[`slot-${index}-task`] || command.taskId || command.taskName;
        const resolved = selectedSourceFor(selected, project, "task") || selected && resolveNamed(project, "task", selected, command) || scopeEntity(scope, "task") || soleStageTask(project, scope);
        if (resolved) confirmedTargets[index] = { ...(confirmedTargets[index] || {}), task: { kind: "task", id: resolved.id } };
        else addSlot(index, "task", "task", "В какую Task добавить Executor?", entities(project, "task", command));
      }
    } else if (command.type === "executor.createFromPerformer") {
      const selectedTask = slotValues[`slot-${index}-task`] || command.taskId || command.taskName;
      const task = selectedSourceFor(selectedTask, project, "task") || selectedTask && resolveNamed(project, "task", selectedTask, command) || scopeEntity(scope, "task") || soleStageTask(project, scope);
      if (task) confirmedTargets[index] = { ...(confirmedTargets[index] || {}), task: { kind: "task", id: task.id } };
      else addSlot(index, "task", "task", "В какую Task добавить Performer?", entities(project, "task", command));
      const performerSlot = `slot-${index}-performer`, selectedPerformer = slotValues[performerSlot] || command.performerId;
      const matches = selectedPerformer ? performers.filter((item) => item.id === selectedPerformer) : performerMatches(command.performerName, performers);
      if (selectedPerformer) slotValues[performerSlot] = selectedPerformer;
      else if (matches.length === 1) slotValues[performerSlot] = matches[0].id;
      else addSlot(index, "performer", "performer", matches.length ? `Какого Performer «${command.performerName}» выбрать?` : `Performer «${command.performerName || ""}» не найден. Кого выбрать?`, matches);
    } else if (!["stage.create", "executor.createFromPerformer", "executor.setTaxBulk"].includes(command.type) && !command.targetRef) {
      const kind = command.type.startsWith("stage.") ? "stage" : command.type.startsWith("task.") ? "task" : "executor";
      const selected = slotValues[`slot-${index}-target`] || command.targetName;
      const resolved = selectedSourceFor(slotValues[`slot-${index}-target`], project, kind) || selected && resolveNamed(project, kind, selected, command) || scopeEntity(scope, kind);
      if (resolved) confirmedTargets[index] = { ...(confirmedTargets[index] || {}), target: { kind, id: resolved.id } };
      else addSlot(index, "target", kind, `Какой ${kind} изменить?`, entities(project, kind, command));
    }
  });
  return { semantic: draft, confirmedTargets, slotValues, unresolvedSlots };
}

function selectedSourceFor(value, project, kind) {
  if (!value) return null;
  return entities(project, kind).find((item) => item.id === value) || null;
}

function soleStageTask(project, scope) {
  if (scope?.kind !== "stage") return null;
  const matches = entities(project, "task").filter((item) => indexProject(project).tasks.get(item.id)?.stage.id === scope.stageId);
  return matches.length === 1 ? matches[0] : null;
}

function performerMatches(name, performers) {
  const query = normalized(name);
  if (!query) return [];
  return [...new Map((performers || []).filter((item) => {
    const full = normalized([item.firstName, item.lastName].filter(Boolean).join(" "));
    const first = normalized(item.firstName);
    return full === query || first === query || full.startsWith(`${query} `) || query.startsWith(`${first} `);
  }).map((item) => [item.id, { ...item, label: [[item.firstName, item.lastName].filter(Boolean).join(" "), item.primaryRole].filter(Boolean).join(" — ") }])).values()];
}

export function materializeResolvedSemanticPlan(resolved) {
  const semantic = structuredClone(resolved.semantic);
  for (const [slotId, value] of Object.entries(resolved.slotValues || {})) {
    const match = /^slot-(\d+)-(.+)$/.exec(slotId); if (!match) continue;
    const command = semantic.commands[Number(match[1])], field = match[2];
    if (field === "name") command.name = value;
    if (field === "performer") command.performerId = value;
    if (field === "task") command.taskId = value;
  }
  return semantic;
}
