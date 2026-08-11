import { normalizeSearchText } from "./retrieval.js";

const confirmedId = (instruction) => /\[confirmed_source\s+kind=project\s+id=([^\]\s]+)\]/iu.exec(instruction)?.[1] || null;
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

const choice = (entity) => ({
  id: `${entity.kind}:${entity.id}`,
  label: entity.kind === "executor" ? `${entity.name || "Без имени"} — ${entity.stageName} / ${entity.taskName}` : entity.kind === "task" ? `${entity.name} — ${entity.stageName}` : entity.name,
  source: { kind: "project", id: entity.id, name: entity.name || entity.kind },
});

export function resolveProjectTarget(instruction, project) {
  const entities = projectEntities(project), confirmed = confirmedId(instruction);
  if (confirmed) {
    const entity = entities.find((item) => item.id === confirmed);
    return entity ? { target: entity, clarification: null } : { target: null, clarification: { question: "Выбранная сущность больше не существует в смете. Что изменить?" } };
  }

  const wantsStage = /\bэтап\p{L}*/iu.test(instruction);
  const wantsTask = /\bзадач\p{L}*/iu.test(instruction);
  const wantsExecutor = /(?:исполнител\p{L}*|оплат\p{L}*|ставк\p{L}*|замен\p{L}*)/iu.test(instruction);
  const kind = wantsExecutor ? "executor" : wantsTask ? "task" : wantsStage ? "stage" : null;
  if (/\b(?:добав|созда)\p{L}*/iu.test(instruction) && !/\bзамен\p{L}*/iu.test(instruction)) return { target: null, clarification: null };
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
