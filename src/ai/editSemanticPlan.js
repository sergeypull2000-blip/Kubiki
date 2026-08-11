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

function trustedScopeEntity(project, scope, kind) {
  if (!scope || scope.kind === "project") return null;
  const index = indexProject(project), stage = index.stages.get(scope.stageId)?.stage;
  if (!stage) return null;
  if (kind === "stage") return { kind, id: stage.id };
  const task = index.tasks.get(scope.taskId);
  if (!task || task.stage.id !== stage.id) return null;
  if (kind === "task") return { kind, id: task.task.id };
  const executor = index.executors.get(scope.executorId);
  return executor && executor.stage.id === stage.id && executor.task.id === task.task.id ? { kind: "executor", id: executor.executor.id } : null;
}

function contextualCreationParent(project, scope, kind) {
  if (kind === "task" && ["stage", "task", "executor"].includes(scope?.kind)) return trustedScopeEntity(project, scope, "stage");
  if (kind === "executor" && ["task", "executor"].includes(scope?.kind)) return trustedScopeEntity(project, scope, "task");
  return null;
}

function contextualTaskCandidates(project, scope, command = {}) {
  const candidates = entities(project, "task", command);
  return scope?.kind === "stage" ? candidates.filter((item) => indexProject(project).tasks.get(item.id)?.stage.id === scope.stageId) : candidates;
}

function scopeContains(project, scope, kind, id) {
  if (!scope || scope.kind === "project") return true;
  const located = indexProject(project)[`${kind}s`]?.get(id);
  if (!located) return false;
  if (scope.kind === "stage") return located.stage?.id === scope.stageId;
  if (scope.kind === "task") return located.task?.id === scope.taskId;
  return located.executor?.id === scope.executorId;
}

export function resolveAiEditSemanticDraft({ semantic, project, scope, performers = [], instruction = "", prior = null, answer = "", selectedSource = null }) {
  if (semantic.kind !== "commands") return { semantic, confirmedTargets: {}, unresolvedSlots: [] };
  const draft = semantic, confirmedTargets = structuredClone(prior?.confirmedTargets || {}), slotValues = { ...(prior?.slotValues || {}) };
  if (prior?.unresolvedSlots?.length && (answer || selectedSource)) {
    const slot = prior.unresolvedSlots[0];
    slotValues[slot.id] = selectedSource?.id || String(answer).trim();
  }
  const unresolvedSlots = [];
  const performerNames = draft.commands.filter((command) => command.type === "executor.createFromPerformer").map((command) => command.performerName || performers.find((item) => item.id === command.performerId)?.firstName).filter(Boolean);
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
        const resolved = contextualCreationParent(project, scope, "task") || selectedSourceFor(slotValues[`slot-${index}-stage`], project, "stage") || selected && resolveNamed(project, "stage", selected, command);
        if (resolved) confirmedTargets[index] = { ...(confirmedTargets[index] || {}), stage: { kind: "stage", id: resolved.id } };
        else addSlot(index, "stage", "stage", "В какой Stage создать Task?", entities(project, "stage"));
      }
    } else if (command.type === "executor.createAnonymous") {
      if (!command.taskRef) {
        const selected = slotValues[`slot-${index}-task`] || command.taskId || command.taskName;
        const restored = selectedSourceFor(confirmedTargets[index]?.task?.id, project, "task");
        const candidates = contextualTaskCandidates(project, scope, command);
        const selectedTask = candidates.find((item) => item.id === selected) || selected && candidates.filter((item) => same(item.name, selected)).length === 1 && candidates.find((item) => same(item.name, selected));
        const resolved = contextualCreationParent(project, scope, "executor") || restored || selectedTask || soleStageTask(project, scope);
        if (resolved) confirmedTargets[index] = { ...(confirmedTargets[index] || {}), task: { kind: "task", id: resolved.id } };
        else addSlot(index, "task", "task", candidates.length ? "В какую Task добавить Executor?" : "В выбранном Stage нет Task. Создать Task или выбрать другую?", candidates);
      }
    } else if (command.type === "executor.createFromPerformer") {
      const selectedTask = slotValues[`slot-${index}-task`] || command.taskId || command.taskName;
      const restoredTask = selectedSourceFor(confirmedTargets[index]?.task?.id, project, "task");
      const taskCandidates = contextualTaskCandidates(project, scope, command);
      const selectedCandidate = taskCandidates.find((item) => item.id === selectedTask) || selectedTask && taskCandidates.filter((item) => same(item.name, selectedTask)).length === 1 && taskCandidates.find((item) => same(item.name, selectedTask));
      const task = contextualCreationParent(project, scope, "executor") || restoredTask || selectedCandidate || soleStageTask(project, scope);
      if (task) confirmedTargets[index] = { ...(confirmedTargets[index] || {}), task: { kind: "task", id: task.id } };
      else addSlot(index, "task", "task", taskCandidates.length ? "В какую Task добавить Performer?" : "В выбранном Stage нет Task. Создать Task или выбрать другую?", taskCandidates);
      const performerSlot = `slot-${index}-performer`, selectedPerformer = slotValues[performerSlot] || command.performerId;
      const explicitSlot = `slot-${index}-performerExplicit`;
      const namedPerformer = command.performerName || performers.find((item) => item.id === command.performerId)?.firstName;
      if (slotValues[explicitSlot] === undefined) slotValues[explicitSlot] = explicitDatabaseRequest(instruction, namedPerformer, performerNames);
      const matches = selectedPerformer ? performers.filter((item) => item.id === selectedPerformer) : performerMatches(command.performerName, performers);
      if (selectedPerformer) slotValues[performerSlot] = selectedPerformer;
      else if (matches.length === 1) slotValues[performerSlot] = matches[0].id;
      else addSlot(index, "performer", "performer", matches.length ? `Какого Performer «${command.performerName}» выбрать?` : `Performer «${command.performerName || ""}» не найден. Кого выбрать?`, matches);
    } else if (!["stage.create", "executor.createFromPerformer", "executor.setTaxBulk"].includes(command.type) && !command.targetRef) {
      const kind = command.type.startsWith("stage.") ? "stage" : command.type.startsWith("task.") ? "task" : "executor";
      const selected = slotValues[`slot-${index}-target`] || command.targetName;
      const scopedMatches = selected ? entities(project, kind, command).filter((item) => scopeContains(project, scope, kind, item.id) && same(item.name, selected)) : [];
      const resolved = selectedSourceFor(slotValues[`slot-${index}-target`], project, kind) || scopedMatches.length === 1 && scopedMatches[0] || !selected && trustedScopeEntity(project, scope, kind) || !selected && scopeEntity(scope, kind);
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

function explicitDatabaseRequest(instruction, performerName, performerNames) {
  const query = normalized(instruction), stemFor = (value) => { const first = normalized(value).split(" ")[0]; return first.slice(0, Math.max(3, first.length - 1)); };
  const requestedStem = stemFor(performerName);
  if (requestedStem.length < 3) return false;
  const mentions = performerNames.flatMap((name) => { const stem = stemFor(name); return [...query.matchAll(new RegExp(`${stem}\\p{L}*`, "giu"))].map((match) => ({ stem, index: match.index })); });
  const markers = [...query.matchAll(/из\s+базы|performer|библиотек\p{L}*/giu)];
  return markers.some((marker) => mentions.reduce((nearest, mention) => Math.abs(mention.index - marker.index) < Math.abs(nearest.index - marker.index) ? mention : nearest, { stem: "", index: Number.POSITIVE_INFINITY }).stem === requestedStem);
}

export function materializeResolvedSemanticPlan(resolved) {
  const semantic = structuredClone(resolved.semantic);
  for (const [slotId, value] of Object.entries(resolved.slotValues || {})) {
    const match = /^slot-(\d+)-(.+)$/.exec(slotId); if (!match) continue;
    const command = semantic.commands[Number(match[1])], field = match[2];
    if (field === "name") command.name = value;
    if (field === "performer") command.performerId = value;
    if (field === "performerExplicit") command.performerExplicit = value === true;
    if (field === "task") command.taskId = value;
  }
  return semantic;
}
