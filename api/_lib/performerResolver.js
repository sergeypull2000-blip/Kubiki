import { normalizeSearchText } from "./retrieval.js";

const ASSIGNMENT_INTENT = /(?:назнач\p{L}*|добав\p{L}*|постав\p{L}*|замен\p{L}*|исполнител\p{L}*)/iu;
const REPLACE_INTENT = /замен\p{L}*/iu;
const DATABASE_INTENT = /(?:из\s+базы|performer|библиотек\p{L}*)/iu;

const displayName = (performer) => [performer?.firstName, performer?.lastName].filter(Boolean).join(" ").trim();
const executorName = (executor) => (executor?.tags || []).find((tag) => tag.key === "name")?.value?.trim() || "";
const allExecutors = (project) => (project?.stages || []).flatMap((stage) => (stage.tasks || []).flatMap((task) => (task.executors || []).map((executor) => ({ executor, stage, task }))));

function mentioned(query, name) {
  const normalized = normalizeSearchText(name);
  if (!normalized) return false;
  if (query.includes(normalized)) return true;
  const first = normalized.split(" ")[0], stem = first.slice(0, Math.max(3, first.length - 1));
  return stem.length >= 3 && query.split(/\s+/).some((word) => word.startsWith(stem));
}

function performerMatches(query, performers) {
  const full = performers.filter((item) => { const name = normalizeSearchText(displayName(item)); return name && query.includes(name); });
  if (full.length) return full;
  return performers.filter((item) => mentioned(query, item.firstName));
}

function confirmedProjectId(instruction) {
  return /\[confirmed_source\s+kind=project\s+id=([^\]\s]+)\]/iu.exec(instruction)?.[1] || null;
}

function replaceParts(instruction) {
  const match = /замен\p{L}*\s+(.+?)\s+(?:на|с)\s+(.+)/iu.exec(instruction);
  return match ? { target: match[1].trim(), replacement: match[2].trim() } : null;
}

function executorAmbiguity(items) {
  return {
    performers: [], targetExecutorId: null,
    clarification: {
      question: "Какого исполнителя в текущей смете нужно заменить?",
      choices: items.slice(0, 10).map(({ executor, stage, task }) => ({ id: `executor:${executor.id}`, label: `${executorName(executor) || "Без имени"} — ${stage.name || "этап"} / ${task.name || "задача"}`, source: { kind: "project", id: executor.id, name: executorName(executor) || "Executor" } })),
    },
  };
}

function performerAmbiguity(items) {
  return {
    performers: [], targetExecutorId: null,
    clarification: {
      question: `Какого исполнителя из базы выбрать: ${items.map((item) => displayName(item) || item.primaryRole || item.id).join(" или ")}?`,
      choices: items.slice(0, 10).map((item) => ({ id: `performer:${item.id}`, label: [displayName(item), item.primaryRole].filter(Boolean).join(" — ") || item.id, source: { kind: "performer", id: item.id, name: displayName(item) || item.primaryRole || item.id } })),
    },
  };
}

export function resolveExplicitPerformers(instruction, performers, selectedSources = [], project = null, resolvedProjectTarget = null) {
  const selectedIds = new Set(selectedSources.filter((item) => item.kind === "performer").map((item) => item.id));
  const selected = performers.filter((item) => selectedIds.has(item.id));

  if (REPLACE_INTENT.test(instruction)) {
    const parts = replaceParts(instruction);
    if (!parts) return { performers: [], targetExecutorId: null, clarification: { question: "Кого в смете и на какого Performer нужно заменить?" } };
    const executors = allExecutors(project), confirmedId = resolvedProjectTarget?.kind === "executor" ? resolvedProjectTarget.id : confirmedProjectId(instruction);
    const targetMatches = confirmedId ? executors.filter(({ executor }) => executor.id === confirmedId) : executors.filter(({ executor }) => mentioned(normalizeSearchText(parts.target), executorName(executor)));
    if (targetMatches.length !== 1) return targetMatches.length > 1 ? executorAmbiguity(targetMatches) : { performers: [], targetExecutorId: null, clarification: { question: `Исполнитель «${parts.target}» не найден в текущей смете. Кого заменить?` } };
    const replacements = selected.length ? selected : performerMatches(normalizeSearchText(parts.replacement), performers);
    if (replacements.length !== 1) return replacements.length > 1 ? performerAmbiguity(replacements) : { performers: [], targetExecutorId: targetMatches[0].executor.id, clarification: { question: `Performer «${parts.replacement}» не найден в базе. На кого заменить?` } };
    return { performers: replacements, targetExecutorId: targetMatches[0].executor.id, clarification: null };
  }

  if (selected.length === 1) return { performers: selected, targetExecutorId: null, clarification: null };
  if (selected.length > 1) return performerAmbiguity(selected);
  if (!ASSIGNMENT_INTENT.test(instruction)) return { performers: [], targetExecutorId: null, clarification: null };
  const matches = performerMatches(normalizeSearchText(instruction), performers);
  if (matches.length === 1) return { performers: matches, targetExecutorId: null, clarification: null };
  if (matches.length > 1) return performerAmbiguity(matches);
  if (DATABASE_INTENT.test(instruction)) return { performers: [], targetExecutorId: null, clarification: { question: "Указанный Performer не найден в базе. Кого выбрать?" } };
  return { performers: [], targetExecutorId: null, clarification: null };
}

export function needsClarificationForBareInput(instruction) {
  const words = normalizeSearchText(instruction).split(" ").filter(Boolean);
  return words.length > 0 && words.length <= 3 && !/(?:добав\p{L}*|удал\p{L}*|переимен\p{L}*|замен\p{L}*|назнач\p{L}*|постав\p{L}*|измен\p{L}*|созда\p{L}*|раздроб\p{L}*|перемест\p{L}*)/iu.test(instruction);
}
