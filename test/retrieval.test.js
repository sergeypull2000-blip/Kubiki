import test from "node:test";
import assert from "node:assert/strict";
import { loadOwnKnowledge } from "../api/_lib/knowledgeRepository.js";
import { projectKnowledge, projectPerformer, projectProjectTemplate, projectStageTemplate, projectTaskTemplate } from "../api/_lib/knowledgeProjection.js";
import { RETRIEVAL_LIMITS, buildShortlist, normalizeSearchText, rankKnowledge, safeFuzzyMatch, selectShortlist } from "../api/_lib/retrieval.js";

const emptyProfile = (patch = {}) => ({ projectTypes: [], deliverables: [], disciplines: [], pipelineStages: [], taskTerms: [], roleTerms: [], styleTerms: [], formats: [], platforms: [], constraints: [], keywords: [], uncertainty: [], complexity: "unknown", language: "ru", ...patch });

test("Performer projection contains only professional allowlist and optional rate", () => {
  const safe = projectPerformer({ id: "p1", firstName: "Миша", lastName: "Иванов", primaryRole: "3D Artist", additionalRoles: ["Animator"], specializations: ["Product"], grade: "Senior", software: ["Blender"], defaultPaymentType: "shift", defaultRate: 25000, defaultUnit: "shift", phone: "+7999", email: "x@example.com", telegram: "@x", notes: "secret", legalStatus: "ИП", defaultTaxRate: 6, defaultCommission: 10, unknown: { token: "x" } });
  assert.deepEqual(safe, { id: "p1", displayName: "Миша Иванов", roles: ["3D Artist", "Animator"], specializations: ["Product"], grade: "Senior", software: ["Blender"], rateHint: { paymentType: "shift", rate: 25000, unit: "shift", basis: "performer-default" } });
  for (const forbidden of ["phone", "email", "telegram", "notes", "legalStatus", "defaultTaxRate", "defaultCommission", "unknown"]) assert.equal(JSON.stringify(safe).includes(forbidden), false);
  assert.equal(projectPerformer({ id: "inactive", active: false, primaryRole: "Artist" }), null);
  assert.deepEqual(projectPerformer({ id: "no-rate", firstName: "Анна", primaryRole: "Producer" }), { id: "no-rate", displayName: "Анна", roles: ["Producer"], specializations: [], grade: "", software: [] });
});

test("professional fields cannot smuggle contacts into model projection", () => {
  const safe = projectPerformer({ id: "p", firstName: "artist@example.com", lastName: "+7 999 123-45-67", primaryRole: "@private_handle", specializations: ["https://secret.test", "3D"], defaultPaymentType: "shift", defaultRate: 1000, defaultUnit: "call +79991234567" });
  assert.equal(safe.displayName, "");
  assert.deepEqual(safe.roles, []);
  assert.deepEqual(safe.specializations, ["3D"]);
  assert.equal(safe.rateHint.unit, "shift");
  assert.doesNotMatch(JSON.stringify(safe), /example|7999|private_handle|secret\.test/);
});

test("template projections preserve useful hierarchy but remove finance, contacts and snapshots", () => {
  const rawTask = { id: "t1", name: "3D-анимация", directCost: "120000", markupOverride: 40, tax: { type: "vat" }, exportSettings: { secret: true }, unknown: { token: "x" }, executors: [{ id: "e", amount: "30000", performerId: "p", performerSnapshot: { name: "Private", legalStatus: "ИП", rate: 1 }, tags: [{ key: "role", value: "3D Artist" }, { key: "spec", value: "Product" }, { key: "grade", value: "Senior" }, { key: "payment", payment: { type: "shift", rate: "30000" } }, { key: "name", value: "Private Person" }, { key: "tax", value: "6" }] }] };
  const task = projectTaskTemplate(rawTask);
  assert.equal(task.name, "3D-анимация");
  assert.deepEqual(task.roles, ["3D Artist"]);
  assert.equal(task.rateHints.length, 2);
  const project = projectProjectTemplate({ id: "project", templateName: "3D Product Video", branding: { contacts: "secret" }, globalMarkup: 25, exportSettings: { mode: "x" }, stages: [{ id: "s", name: "Продакшн", tasks: [rawTask] }] });
  const serialized = JSON.stringify(project);
  for (const forbidden of ["Private", "performerSnapshot", "performerId", "contacts", "markup", "exportSettings", "token", "tax"]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  assert.equal(project.stages[0].tasks[0].name, "3D-анимация");
  assert.equal(projectStageTemplate({ id: "s", name: "Этап", tasks: [rawTask] }).tasks.length, 1);
});

test("projectKnowledge ignores legacy performer templates and inactive performers", () => {
  const result = projectKnowledge({ templateLibrary: { projectTemplates: [], stageTemplates: [], taskTemplates: [], performerTemplates: [{ id: "legacy" }], performers: [{ id: "legacy2" }] }, performers: [{ id: "p", primaryRole: "Artist" }, { id: "off", active: false, primaryRole: "Artist" }] });
  assert.deepEqual(result.performers.map((item) => item.id), ["p"]);
  assert.equal("performerTemplates" in result, false);
});

test("normalization and fuzzy matching are conservative and deterministic", () => {
  assert.equal(normalizeSearchText("  3Д/Продукт Ёлка-01 "), "3д продукт елка 01");
  assert.equal(safeFuzzyMatch("моделинг", "моделлинг"), true);
  assert.equal(safeFuzzyMatch("арт", "artist"), false);
  assert.equal(safeFuzzyMatch("дизайнер", "визажист"), false);
});

test("ranking uses exact task, stage, role and specialization evidence", () => {
  const knowledge = projectKnowledge({
    performers: [{ id: "p1", firstName: "Миша", primaryRole: "3D Artist", specializations: ["Product visualization"] }, { id: "p2", firstName: "Катя", primaryRole: "Copywriter" }],
    templateLibrary: { projectTemplates: [{ id: "pr", templateName: "3D Product Video", stages: [{ id: "s", name: "Препродакшн", tasks: [{ id: "t", name: "Концепция", executors: [] }] }] }], stageTemplates: [{ id: "st", name: "Продакшн", tasks: [{ id: "x", name: "3D моделинг", executors: [] }] }], taskTemplates: [{ id: "tt", name: "3D моделинг", executors: [{ tags: [{ key: "role", value: "3D Artist" }] }] }] },
  });
  const ranked = rankKnowledge(emptyProfile({ projectTypes: ["3D Product Video"], pipelineStages: ["Препродакшн"], taskTerms: ["3D моделинг"], roleTerms: ["3D Artist"], disciplines: ["Product visualization"] }), knowledge);
  assert.ok(ranked.some((row) => row.type === "projectTemplate" && row.item.id === "pr"));
  assert.ok(ranked.some((row) => row.type === "taskTemplate" && row.item.id === "tt"));
  assert.ok(ranked.some((row) => row.type === "performer" && row.item.id === "p1"));
  assert.equal(ranked.some((row) => row.item.id === "p2"), false);
});

test("weak and fuzzy-only candidates are excluded", () => {
  const knowledge = projectKnowledge({ templateLibrary: { taskTemplates: [{ id: "a", name: "Моделлинг", executors: [] }, { id: "b", name: "Работа", executors: [] }] } });
  const ranked = rankKnowledge(emptyProfile({ taskTerms: ["Моделинг"], keywords: ["работа"] }), knowledge);
  assert.deepEqual(ranked, []);
});

test("deduplication, limits and stable tie-break do not depend on input order", () => {
  const taskTemplates = Array.from({ length: 10 }, (_, index) => ({ id: `t${String(index).padStart(2, "0")}`, name: index < 2 ? "3D моделинг" : `3D моделинг ${index}`, executors: [{ tags: [{ key: "role", value: "3D Artist" }] }] }));
  const profile = emptyProfile({ taskTerms: ["3D моделинг"], roleTerms: ["3D Artist"] });
  const a = projectKnowledge({ templateLibrary: { taskTemplates } });
  const b = projectKnowledge({ templateLibrary: { taskTemplates: [...taskTemplates].reverse() } });
  const ids = (knowledge) => selectShortlist(rankKnowledge(profile, knowledge)).map((row) => `${row.type}:${row.item.id}`);
  assert.deepEqual(ids(a), ids(b));
  assert.ok(ids(a).length <= RETRIEVAL_LIMITS.taskTemplate);
  assert.ok(ids(a).includes("taskTemplate:t00"));
  assert.equal(ids(a).includes("taskTemplate:t01"), false);
});

test("shortlist has bounded typed shape and no ranking internals", () => {
  const knowledge = projectKnowledge({ performers: [{ id: "p", firstName: "Миша", primaryRole: "3D Artist", defaultPaymentType: "shift", defaultRate: 20000 }] });
  const shortlist = buildShortlist(emptyProfile({ roleTerms: ["3D Artist"], disciplines: ["3D Artist"] }), knowledge);
  assert.equal(shortlist.performers.length, 1);
  assert.equal("score" in shortlist.performers[0], false);
  assert.ok(JSON.stringify(shortlist).length <= RETRIEVAL_LIMITS.maxJsonChars);
  assert.deepEqual(Object.keys(shortlist), ["projectTemplates", "stageTemplates", "taskTemplates", "performers", "historicalProjects"]);
});

test("global limit reserves the strongest candidate of every matched entity type", () => {
  const rows = ["projectTemplate", "stageTemplate", "taskTemplate", "performer"].flatMap((type, typeIndex) => Array.from({ length: 8 }, (_, index) => ({ type, item: { id: `${type}-${index}`, name: `${type} ${index}`, displayName: `${type} ${index}`, roles: [type], specializations: [] }, fields: { stageNames: [], taskNames: [], roles: [type], specializations: [] }, score: 100 - typeIndex * 10 - index, exactCount: 1, evidence: ["x"] })));
  const selected = selectShortlist(rows);
  assert.ok(selected.length <= RETRIEVAL_LIMITS.total);
  for (const type of ["projectTemplate", "stageTemplate", "taskTemplate", "performer"]) assert.ok(selected.some((row) => row.type === type));
});

function mockClient({ performerRows, templateRow, projectRows = [] }) {
  const calls = [];
  return { calls, from(table) {
    const state = { table, columns: "", userId: "" };
    const result = () => table === "performers" ? { data: performerRows, error: null } : table === "projects" ? { data: projectRows, error: null } : { data: templateRow, error: null };
    const builder = {
      select(columns) { state.columns = columns; return builder; },
      eq(column, value) { calls.push({ table, columns: state.columns, column, value }); state.userId = value; return builder; },
      maybeSingle() { return Promise.resolve(result()); },
      limit(value) { calls.push({ table, limit: value, column: "user_id", value: state.userId }); return Promise.resolve(result()); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return builder;
  } };
}

test("knowledge repository scopes both reads to authenticated user and filters foreign rows", async () => {
  const client = mockClient({ performerRows: [{ user_id: "u1", client_id: "p1", performer_data: { firstName: "Own" } }, { user_id: "u2", client_id: "p2", performer_data: { firstName: "Foreign" } }], templateRow: { user_id: "u1", library_data: { taskTemplates: [] } } });
  const result = await loadOwnKnowledge(client, "u1");
  assert.deepEqual(result.performers.map((item) => item.id), ["p1"]);
  assert.equal(result.performers[0].firstName, "Own");
  assert.deepEqual(client.calls.map((call) => [call.table, call.column, call.value]), [["performers", "user_id", "u1"], ["template_libraries", "user_id", "u1"]]);
});

test("history is not queried without opt-in and is owner scoped and bounded when enabled", async () => {
  const projectRows = Array.from({ length: 15 }, (_, index) => ({ user_id: index === 14 ? "u2" : "u1", client_id: `h${index}`, project_data: { name: `Project ${index}`, createdAt: new Date(2026, 0, index + 1).toISOString(), stages: [] } }));
  const without = mockClient({ performerRows: [], templateRow: null, projectRows });
  assert.deepEqual((await loadOwnKnowledge(without, "u1")).historicalProjects, []);
  assert.equal(without.calls.some((call) => call.table === "projects"), false);
  const withHistory = mockClient({ performerRows: [], templateRow: null, projectRows });
  const result = await loadOwnKnowledge(withHistory, "u1", { includeHistory: true });
  assert.equal(result.historicalProjects.length, 12);
  assert.equal(result.historicalProjects.some((project) => project.id === "h14"), false);
  assert.ok(withHistory.calls.some((call) => call.table === "projects" && call.limit === 50));
});
