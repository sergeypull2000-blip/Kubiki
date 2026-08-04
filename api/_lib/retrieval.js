const ALIASES = new Map([
  ["3д", "3d"], ["cgi", "cg"], ["сижи", "cg"], ["моушн", "motion"],
  ["препрод", "препродакшн"], ["preproduction", "препродакшн"],
  ["postproduction", "постпродакшн"], ["постпрод", "постпродакшн"],
]);
const STOP = new Set(["проект", "работа", "работы", "услуга", "услуги", "создание", "сделать", "project"]);
const TYPE_PRIORITY = { projectTemplate: 0, stageTemplate: 1, taskTemplate: 2, performer: 3, historicalProject: 4 };
export const RETRIEVAL_LIMITS = { projectTemplate: 3, stageTemplate: 4, taskTemplate: 6, performer: 5, historicalProject: 3, total: 16, maxJsonChars: 24_000 };

export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function tokens(value) {
  return normalizeSearchText(value).split(" ").map((item) => ALIASES.get(item) || item).filter((item) => item && !STOP.has(item));
}
const normalizedTerms = (values) => [...new Set((values || []).flatMap((value) => {
  const phrase = tokens(value).join(" ");
  return phrase ? [phrase, ...phrase.split(" ")] : [];
}))];

function distance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
  }
  return matrix[a.length][b.length];
}

export function safeFuzzyMatch(a, b) {
  const left = tokens(a).join(""), right = tokens(b).join("");
  if (left.length < 5 || right.length < 5 || left[0] !== right[0]) return false;
  return distance(left, right) <= (Math.max(left.length, right.length) <= 7 ? 1 : 2);
}

function fieldEvidence(queryValues, candidateValues, weight, key) {
  const queries = normalizedTerms(queryValues), candidates = normalizedTerms(candidateValues);
  if (!queries.length || !candidates.length) return null;
  for (const query of queries) if (candidates.includes(query)) return { key, score: weight, exact: true };
  for (const query of queries) for (const candidate of candidates) if ((candidate.includes(query) || query.includes(candidate)) && Math.min(query.length, candidate.length) >= 4) return { key, score: Math.round(weight * 0.75), exact: true };
  for (const query of queries) for (const candidate of candidates) if (safeFuzzyMatch(query, candidate)) return { key, score: Math.min(5, Math.round(weight * 0.3)), exact: false };
  return null;
}

function flattenTemplate(item) {
  const stages = Array.isArray(item.stages) ? item.stages : Array.isArray(item.tasks) ? [item] : [];
  const tasks = Array.isArray(item.tasks) ? item.tasks : stages.length ? stages.flatMap((stage) => stage.tasks || []) : [item];
  return {
    names: [item.name], stageNames: stages.map((stage) => stage.name), taskNames: tasks.map((task) => task.name),
    roles: tasks.flatMap((task) => task.roles || []), specializations: tasks.flatMap((task) => task.specializations || []),
  };
}

function candidatesFromKnowledge(knowledge) {
  return [
    ...(knowledge.projectTemplates || []).map((item) => ({ type: "projectTemplate", item, fields: flattenTemplate(item) })),
    ...(knowledge.stageTemplates || []).map((item) => ({ type: "stageTemplate", item, fields: flattenTemplate(item) })),
    ...(knowledge.taskTemplates || []).map((item) => ({ type: "taskTemplate", item, fields: flattenTemplate(item) })),
    ...(knowledge.performers || []).map((item) => ({ type: "performer", item, fields: { names: [], stageNames: [], taskNames: [], roles: item.roles, specializations: item.specializations } })),
    ...(knowledge.historicalProjects || []).map((item) => ({ type: "historicalProject", item, fields: flattenTemplate(item) })),
  ];
}

export function rankKnowledge(profile, knowledge) {
  const rows = [];
  for (const candidate of candidatesFromKnowledge(knowledge || {})) {
    const p = profile || {};
    const evidence = [
      fieldEvidence(p.projectTypes, candidate.fields.names, 24, "projectType"),
      fieldEvidence(p.deliverables, [...candidate.fields.names, ...candidate.fields.taskNames], 18, "deliverable"),
      fieldEvidence(p.taskTerms, candidate.fields.taskNames, 16, "task"),
      fieldEvidence(p.roleTerms, candidate.fields.roles, 14, "role"),
      fieldEvidence(p.disciplines, [...candidate.fields.specializations, ...candidate.fields.roles], 12, "discipline"),
      fieldEvidence(p.pipelineStages, candidate.fields.stageNames, 10, "stage"),
      fieldEvidence([...(p.styleTerms || []), ...(p.formats || []), ...(p.platforms || []), ...(p.keywords || [])], [...candidate.fields.names, ...candidate.fields.stageNames, ...candidate.fields.taskNames, ...candidate.fields.specializations], 6, "context"),
    ].filter(Boolean);
    const exactCount = evidence.filter((item) => item.exact).length;
    const score = Math.min(100, evidence.reduce((sum, item) => sum + item.score, 0));
    const strongSingle = evidence.some((item) => item.exact && item.score >= 16);
    if (!(score >= 20 || score >= 16 && evidence.length >= 2 || strongSingle)) continue;
    rows.push({ ...candidate, score, exactCount, evidence: evidence.map((item) => item.key) });
  }
  return rows.sort((a, b) => b.score - a.score || b.exactCount - a.exactCount || TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] || normalizeSearchText(a.item.name || a.item.displayName).localeCompare(normalizeSearchText(b.item.name || b.item.displayName), "ru") || a.item.id.localeCompare(b.item.id));
}

function signature(row) {
  const structure = row.type === "performer" ? [row.item.roles, row.item.specializations] : [row.item.name, row.fields.stageNames, row.fields.taskNames];
  return `${row.type}:${JSON.stringify(structure.map((value) => Array.isArray(value) ? value.map(normalizeSearchText) : normalizeSearchText(value)))}`;
}

export function selectShortlist(ranked) {
  const seenIds = new Set(), seenSignatures = new Set(), unique = [];
  for (const row of ranked || []) {
    const id = `${row.type}:${row.item.id}`, sig = signature(row);
    if (seenIds.has(id) || seenSignatures.has(sig)) continue;
    seenIds.add(id); seenSignatures.add(sig); unique.push(row);
  }
  const selected = [], selectedIds = new Set(), perType = new Map();
  const add = (row) => {
    if (!row || selectedIds.has(`${row.type}:${row.item.id}`) || selected.length >= RETRIEVAL_LIMITS.total || (perType.get(row.type) || 0) >= RETRIEVAL_LIMITS[row.type]) return;
    selected.push(row); selectedIds.add(`${row.type}:${row.item.id}`); perType.set(row.type, (perType.get(row.type) || 0) + 1);
  };
  for (const type of Object.keys(TYPE_PRIORITY).sort((a, b) => TYPE_PRIORITY[a] - TYPE_PRIORITY[b])) add(unique.find((row) => row.type === type));
  for (const row of unique) add(row);
  selected.sort((a, b) => b.score - a.score || b.exactCount - a.exactCount || TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] || a.item.id.localeCompare(b.item.id));
  return selected;
}

function safeShortItem(row) {
  if (row.type === "performer") return { ref: `performer:${row.item.id}`, name: row.item.displayName || row.item.roles[0], roles: row.item.roles, specializations: row.item.specializations, grade: row.item.grade, software: row.item.software, ...(row.item.rateHint ? { rateHint: row.item.rateHint } : {}) };
  if (row.type === "taskTemplate") return { ref: `taskTemplate:${row.item.id}`, name: row.item.name, roles: row.item.roles, specializations: row.item.specializations, rateHints: row.item.rateHints };
  if (row.type === "stageTemplate") return { ref: `stageTemplate:${row.item.id}`, name: row.item.name, tasks: row.item.tasks };
  if (row.type === "historicalProject") return { ref: `historicalProject:${row.item.id}`, name: row.item.name, stages: row.item.stages };
  return { ref: `projectTemplate:${row.item.id}`, name: row.item.name, stages: row.item.stages };
}

export function buildShortlist(profile, knowledge) {
  const selected = selectShortlist(rankKnowledge(profile, knowledge));
  const result = { projectTemplates: [], stageTemplates: [], taskTemplates: [], performers: [], historicalProjects: [] };
  const key = { projectTemplate: "projectTemplates", stageTemplate: "stageTemplates", taskTemplate: "taskTemplates", performer: "performers", historicalProject: "historicalProjects" };
  for (const row of selected) result[key[row.type]].push(safeShortItem(row));
  while (JSON.stringify(result).length > RETRIEVAL_LIMITS.maxJsonChars) {
    const populated = Object.values(key).map((name) => result[name]).filter((items) => items.length);
    if (!populated.length) break;
    populated.sort((a, b) => b.length - a.length)[0].pop();
  }
  return result;
}
