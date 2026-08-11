import { normalizeSearchText } from "./retrieval.js";

const words = (value) => normalizeSearchText(value).split(/\s+/).filter((word) => word.length >= 3);
const stem = (word) => word.slice(0, Math.max(3, word.length - 2));
const nameMentioned = (instruction, name) => {
  const queryWords = words(instruction);
  return words(name).some((nameWord) => queryWords.some((queryWord) => queryWord.startsWith(stem(nameWord)) || nameWord.startsWith(stem(queryWord))));
};
const hasExplicitNameToken = (instruction) => [...String(instruction).matchAll(/\p{L}+/gu)].slice(1).some((match) => /^\p{Lu}/u.test(match[0]));
const executorName = (executor) => (executor.tags || []).find((tag) => tag.key === "name")?.value?.trim() || "";

export function projectEntities(project) {
  const result = [];
  for (const stage of project?.stages || []) {
    result.push({ kind: "stage", id: stage.id, name: stage.name || "Без названия", stageId: stage.id, stageName: stage.name || "Этап" });
    for (const task of stage.tasks || []) {
      result.push({ kind: "task", id: task.id, name: task.name || "Без названия", stageId: stage.id, stageName: stage.name || "Этап", taskId: task.id, taskName: task.name || "Задача" });
      for (const executor of task.executors || []) result.push({ kind: "executor", id: executor.id, name: executorName(executor), stageId: stage.id, stageName: stage.name || "Этап", taskId: task.id, taskName: task.name || "Задача", executorId: executor.id });
    }
  }
  return result;
}

function inScope(entity, scope) {
  if (!scope || scope.kind === "project") return true;
  if (scope.kind === "stage") return entity.stageId === scope.stageId;
  if (scope.kind === "task") return entity.taskId === scope.taskId || entity.kind === "stage" && entity.id === scope.stageId;
  return entity.executorId === scope.executorId || entity.kind === "task" && entity.id === scope.taskId || entity.kind === "stage" && entity.id === scope.stageId;
}

function hardScopeTarget(entities, scope, kind) {
  const id = kind === "stage" ? scope?.stageId : kind === "task" ? scope?.taskId : scope?.executorId;
  return id ? entities.find((item) => item.kind === kind && item.id === id) || null : null;
}

const choice = (entity) => ({
  id: `${entity.kind}:${entity.id}`,
  label: entity.kind === "executor" ? `${entity.name || "Без имени"} — ${entity.stageName} / ${entity.taskName}` : entity.kind === "task" ? `${entity.name} — ${entity.stageName}` : entity.name,
  source: { kind: "project", id: entity.id, name: entity.name || entity.kind },
});

export function resolveProjectTarget(instruction, project, confirmed = null, scope = null) {
  const allEntities = projectEntities(project), entities = allEntities.filter((item) => inScope(item, scope));
  if (confirmed) {
    const entity = entities.find((item) => item.id === confirmed);
    return entity ? { target: entity, clarification: null } : { target: null, clarification: { question: "Выбранная сущность больше не существует в смете. Что изменить?" } };
  }

  const wantsStage = /этап\p{L}*/iu.test(instruction);
  const wantsTask = /задач\p{L}*/iu.test(instruction);
  const wantsExecutor = /(?:исполнител\p{L}*|оплат\p{L}*|ставк\p{L}*|налог\p{L}*|замен\p{L}*|почас\p{L}*|час\p{L}*|смен\p{L}*|единиц\p{L}*|\bроль\b)/iu.test(instruction);
  const kind = wantsExecutor ? "executor" : wantsTask ? "task" : wantsStage ? "stage" : scope?.kind !== "project" ? scope?.kind : null;
  const scoped = kind && scope?.kind !== "project" ? hardScopeTarget(entities, scope, kind) : null;
  if (scoped) return { target: scoped, clarification: null };
  if (/(?:добав|созда)\p{L}*/iu.test(instruction) && !/замен\p{L}*/iu.test(instruction)) return { target: null, clarification: null };
  if (!kind || /(?:\bвсем\b|\bвсех\b|\bкажд\p{L}*)/iu.test(instruction)) return { target: null, clarification: null };
  const matches = entities.filter((entity) => entity.kind === kind && entity.name && nameMentioned(instruction, entity.name));
  if (matches.length === 1) return { target: matches[0], clarification: null };
  if (matches.length > 1) return {
    target: null,
    clarification: { question: `Какую сущность «${matches[0].name}» изменить?`, choices: matches.slice(0, 10).map(choice) },
  };
  if (hasExplicitNameToken(instruction)) return { target: null, clarification: { question: "Названная сущность не найдена в текущей смете. Что именно нужно изменить?" } };
  return { target: null, clarification: null };
}

export function resolveTaskCreationStage(instruction, project, confirmed = null, scope = null) {
  if (!/(?:добав|созда)\p{L}*/iu.test(instruction) || !/задач\p{L}*/iu.test(instruction)) return { stage: null, clarification: null };
  const entities = projectEntities(project).filter((item) => item.kind === "stage" && inScope(item, scope));
  if (confirmed) {
    const stage = entities.find((item) => item.id === confirmed);
    return stage ? { stage, clarification: null } : { stage: null, clarification: { question: "Выбранный этап больше не существует. В какой этап добавить задачу?" } };
  }
  const scoped = scope?.stageId && entities.find((item) => item.id === scope.stageId);
  if (scoped) return { stage: scoped, clarification: null };
  const matches = entities.filter((item) => nameMentioned(instruction, item.name));
  if (matches.length === 1) return { stage: matches[0], clarification: null };
  if (matches.length > 1) return { stage: null, clarification: { question: "В какой этап добавить задачу?", choices: matches.slice(0, 10).map(choice) } };
  return { stage: null, clarification: { question: "В какой этап добавить задачу?", choices: entities.slice(0, 10).map(choice) } };
}

export function resolveExecutorCreationTask(instruction, project, confirmed = null, scope = null) {
  const entities = projectEntities(project).filter((item) => inScope(item, scope));
  if (confirmed) {
    const entity = entities.find((item) => item.id === confirmed);
    if (entity?.kind === "task") return { task: entity, clarification: null };
  }
  const creation = /(?:добав|созда)\p{L}*/iu.test(instruction) && /(?:исполнител\p{L}*|директор\p{L}*|артист\p{L}*|\s(?:в|на)\s+этап)/iu.test(instruction) && !/(?:нов\p{L}*\s+этап|созда\p{L}*\s+этап)/iu.test(instruction);
  if (!creation) return { task: null, clarification: null };
  const scoped = scope?.taskId && entities.find((item) => item.kind === "task" && item.id === scope.taskId);
  if (scoped) return { task: scoped, clarification: null };
  const tasks = entities.filter((item) => item.kind === "task"), mentionedTasks = tasks.filter((item) => nameMentioned(instruction, item.name));
  if (mentionedTasks.length === 1) return { task: mentionedTasks[0], clarification: null };
  if (mentionedTasks.length > 1) return { task: null, clarification: { question: "В какую Task добавить Executor?", choices: mentionedTasks.slice(0, 10).map(choice) } };
  const stages = entities.filter((item) => item.kind === "stage" && nameMentioned(instruction, item.name));
  if (stages.length === 1) {
    const stageTasks = tasks.filter((item) => item.stageId === stages[0].id);
    if (stageTasks.length === 1) return { task: stageTasks[0], clarification: null };
    if (stageTasks.length) return { task: null, clarification: { question: `В какую Task этапа «${stages[0].name}» добавить Executor?`, choices: stageTasks.slice(0, 10).map(choice) } };
  }
  return { task: null, clarification: { question: "В какую Task добавить Executor?" } };
}
