import test from "node:test";
import assert from "node:assert/strict";
import { createSheet, deleteSheet, duplicateSheet, makeProject, makeProjectFromEstimate, normalizeProject, renameSheet, switchSheet } from "../src/store.js";
import { activeSheetId, sheetProject, sheetsOf, stagesOf } from "../src/sheets.js";
import { projectMarkupAmount, projectSum, projectTaxAmount, projectTotalWithTax, projectVatAmount } from "../src/calculations.js";
import { buildProjectRow, deserializeProjectFromServer } from "../src/projectServer.js";
import { applyAiEditOperations } from "../src/ai/editOperations.js";
import { buildAiEditPreview } from "../src/ai/editPreview.js";
import { materializeResolvedSemanticPlan, resolveAiEditSemanticDraft } from "../src/ai/editSemanticPlan.js";
import { compileAiEditSemanticPlan } from "../src/ai/editSemanticCompiler.js";
import { parseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { projectRevision, sheetRevision } from "../src/ai/projectRevision.js";
import { buildExportEstimateModel } from "../src/exportEstimate.js";

/* ============ migration / backward compatibility ============ */

test("legacy migration is deterministic and idempotent", () => {
  const legacy = { id: "p1", name: "Old", stages: [{ id: "s", tasks: [{ id: "t", executors: [{ id: "e", amount: "100" }] }] }] };
  const a = normalizeProject(legacy);
  const b = normalizeProject(JSON.parse(JSON.stringify(legacy)));
  assert.equal(a.sheets[0].id, "sheet-p1-1");
  assert.equal(b.sheets[0].id, "sheet-p1-1");
  assert.equal(a.activeSheetId, "sheet-p1-1");
  assert.deepEqual(a.stages, legacy.stages);
  assert.deepEqual(normalizeProject(a), a);
});

test("makeProjectFromEstimate materializes one sheet with the generated stages", () => {
  const stages = [{ id: "s", name: "Stage", tasks: [] }];
  const project = makeProjectFromEstimate(stages, { projectName: "Edited Name" });
  assert.equal(project.sheets.length, 1);
  assert.deepEqual(project.stages, stages);
  assert.equal(project.name, "Edited Name");
});

/* ============ sheet operations ============ */

test("sheet create/rename/switch/delete keeps active stages view in sync", () => {
  let project = makeProject();
  const first = project.sheets[0].id;
  project = createSheet(project, "Second");
  assert.equal(project.sheets.length, 2);
  assert.equal(project.activeSheetId, project.sheets[1].id);
  assert.equal(project.stages, project.sheets[1].stages);
  project = renameSheet(project, project.sheets[1].id, "Renamed");
  assert.equal(project.sheets[1].name, "Renamed");
  project = switchSheet(project, first);
  assert.equal(project.activeSheetId, first);
  assert.equal(project.stages, project.sheets[0].stages);
  project = deleteSheet(project, first);
  assert.equal(project.sheets.length, 1);
  assert.equal(project.activeSheetId, project.sheets[0].id);
});

test("deleting the last sheet is forbidden", () => {
  const project = makeProject();
  const after = deleteSheet(project, project.sheets[0].id);
  assert.equal(after.sheets.length, 1);
  assert.equal(after.activeSheetId, project.sheets[0].id);
});

test("duplicate regenerates nested ids but preserves performer linkage", () => {
  let project = makeProject();
  const sheet = project.sheets[0];
  const staged = normalizeProject({
    ...project,
    sheets: [{ ...sheet, stages: [{ id: "s1", name: "Stage", tasks: [{ id: "t1", name: "Task", executors: [{ id: "e1", amount: "100", performerId: "pf-1", performerSnapshot: { name: "Анна" }, tags: [{ id: "tag1", key: "role", value: "Арт-директор" }] }] }] }] }],
    activeSheetId: sheet.id,
  });
  const duplicated = duplicateSheet(staged, sheet.id);
  assert.equal(duplicated.sheets.length, 2);
  const copy = duplicated.sheets[1];
  assert.notEqual(copy.id, sheet.id);
  assert.notEqual(copy.stages[0].id, "s1");
  assert.notEqual(copy.stages[0].tasks[0].id, "t1");
  assert.notEqual(copy.stages[0].tasks[0].executors[0].id, "e1");
  assert.notEqual(copy.stages[0].tasks[0].executors[0].tags[0].id, "tag1");
  assert.equal(copy.stages[0].tasks[0].executors[0].performerId, "pf-1");
  assert.deepEqual(copy.stages[0].tasks[0].executors[0].performerSnapshot, { name: "Анна" });
  assert.equal(staged.sheets[0].stages[0].tasks[0].executors[0].performerId, "pf-1");
});

/* ============ active-sheet scoping of finance/export ============ */

test("projectSum and projectPrice are active-sheet scoped, never a grand total", () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [{ id: "tA", name: "T", directCost: "100", executors: [] }] }] }],
    activeSheetId: sheetA,
  });
  project = createSheet(project, "B");
  const sheetB = project.sheets.find((sheet) => sheet.id !== sheetA);
  project = normalizeProject({
    ...project,
    sheets: project.sheets.map((sheet) => sheet.id === sheetB.id ? { ...sheet, stages: [{ id: "sB", name: "B", tasks: [{ id: "tB", name: "T2", directCost: "900", executors: [] }] }] } : sheet),
    activeSheetId: sheetB.id,
  });
  assert.equal(projectSum(project), 900);
  assert.equal(projectSum(switchSheet(project, sheetA)), 100);
});

test("workspace top-right total = base + markup + tax + VAT of the active sheet", () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    globalMarkup: 10,
    tax: { percent: 6 },
    vat: { percent: 20 },
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [{ id: "tA", name: "T", directCost: "100", executors: [] }] }] }],
    activeSheetId: sheetA,
  });
  project = createSheet(project, "B");
  const sheetB = project.sheets.find((sheet) => sheet.id !== sheetA);
  project = normalizeProject({
    ...project,
    sheets: project.sheets.map((sheet) => sheet.id === sheetB.id ? { ...sheet, stages: [{ id: "sB", name: "B", tasks: [{ id: "tB", name: "T2", directCost: "900", executors: [] }] }] } : sheet),
    activeSheetId: sheetB.id,
  });
  // The top-right Workspace badge renders projectTotalWithTax (same final ИТОГО as export).
  // It must equal base + markup + tax + VAT of the active sheet only — no cross-sheet sums.
  const roundedParts = (p) => Math.round((projectSum(p) + projectMarkupAmount(p) + projectTaxAmount(p) + projectVatAmount(p)) * 100) / 100;
  assert.equal(projectTotalWithTax(project), roundedParts(project));
  assert.equal(projectSum(project), 900);
  assert.equal(projectTotalWithTax(project), 1259.28); // 900 + 90 markup + 59.4 tax + 209.88 VAT
  const sheetAView = switchSheet(project, sheetA);
  assert.equal(projectTotalWithTax(sheetAView), roundedParts(sheetAView));
  assert.equal(projectTotalWithTax(sheetAView), 139.92); // 100 + 10 markup + 6.6 tax + 23.32 VAT
});

test("export model is scoped to the active sheet", () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [{ id: "tA", name: "T", directCost: "1000", executors: [] }] }] }],
    activeSheetId: sheetA,
  });
  project = createSheet(project, "B");
  assert.equal(buildExportEstimateModel(project).stages.length, 0);
  assert.equal(buildExportEstimateModel(switchSheet(project, sheetA)).stages.length, 1);
});

test("export model carries the active sheet name for branded headers and file names", () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = renameSheet(project, sheetA, "Первая смета");
  project = createSheet(project, "Вторая смета");
  assert.equal(buildExportEstimateModel(project).sheetName, "Вторая смета");
  assert.equal(buildExportEstimateModel(switchSheet(project, sheetA)).sheetName, "Первая смета");
});

/* ============ AI sheet isolation ============ */

test("AI apply targets the captured sheet even after switching active sheet", () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [{ id: "tA", name: "Task", executors: [] }] }] }],
    activeSheetId: sheetA,
  });
  project = createSheet(project, "B");
  const sheetB = project.sheets.find((sheet) => sheet.id !== sheetA);
  const diff = {
    schemaVersion: 1, kind: "diff", requestId: "r", baseRevision: "sha256:x",
    scope: { kind: "project", projectId: project.id, sheetId: sheetA },
    summary: "Добавить задачу",
    operations: [{ id: "op-1", type: "task.add", targetId: "sA", value: { taskId: "tNew", name: "Новая", beforeTaskId: null }, reason: "нужно", source: { kind: "current_request" } }],
    warnings: [],
  };
  const after = applyAiEditOperations(project, diff, { idPool: { stages: [], tasks: ["tNew"], executors: [], tags: [] } });
  assert.equal(stagesOf(after, sheetA).find((stage) => stage.id === "sA").tasks.length, 2);
  assert.equal(stagesOf(after, sheetB).length, 0);
  assert.equal(after.activeSheetId, sheetB.id);
});

test("editing another sheet does not stale an in-flight AI request", async () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [{ id: "tA", name: "Task", executors: [{ id: "e", amount: "100", tags: [] }] }] }] }],
    activeSheetId: sheetA,
  });
  const revisionA = await sheetRevision(project, sheetA);
  project = createSheet(project, "B");
  const sheetB = project.sheets.find((sheet) => sheet.id !== sheetA);
  project = normalizeProject({
    ...project,
    sheets: project.sheets.map((sheet) => sheet.id === sheetB.id ? { ...sheet, stages: [{ id: "sB", name: "B", tasks: [] }] } : sheet),
    activeSheetId: sheetB.id,
  });
  assert.equal(await sheetRevision(project, sheetA), revisionA);
  project = normalizeProject({
    ...project,
    sheets: project.sheets.map((sheet) => sheet.id === sheetA ? { ...sheet, stages: [{ ...sheet.stages[0], name: "A2" }] } : sheet),
  });
  assert.notEqual(await sheetRevision(project, sheetA), revisionA);
});

test("preview metrics are computed for the target sheet, not the active sheet", async () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [{ id: "tA", name: "Task", directCost: "100", executors: [] }] }] }],
    activeSheetId: sheetA,
  });
  project = createSheet(project, "B");
  const revision = await sheetRevision(project, sheetA);
  const diff = {
    schemaVersion: 1, kind: "diff", requestId: "r", baseRevision: revision,
    scope: { kind: "project", projectId: project.id, sheetId: sheetA },
    summary: "Переименовать",
    operations: [{ id: "op-1", type: "task.rename", targetId: "tA", value: { name: "Renamed" }, reason: "нужно", source: { kind: "current_request" } }],
    warnings: [],
  };
  const preview = await buildAiEditPreview({ project, response: diff, idPool: { stages: [], tasks: [], executors: [], tags: [] }, expectedRevision: revision });
  assert.equal(preview.before.internalCost, 100);
  assert.equal(preview.after.tasks, 1);
});

/* ============ persistence round-trip ============ */

test("multi-sheet project survives server round-trip", async () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [] }] }],
    activeSheetId: sheetA,
  });
  project = createSheet(project, "Second");
  const row = buildProjectRow("user", project);
  const back = deserializeProjectFromServer({ ...row, client_id: project.id });
  assert.equal(back.sheets.length, 2);
  assert.equal(back.activeSheetId, project.activeSheetId);
  assert.deepEqual(stagesOf(back), stagesOf(project));
  assert.equal(await projectRevision(back), await projectRevision(project));
});

test("sheetProject projects a target sheet into a one-sheet view", () => {
  const project = normalizeProject({
    id: "p", sheets: [
      { id: "a", name: "A", stages: [{ id: "sa", tasks: [] }] },
      { id: "b", name: "B", stages: [{ id: "sb", tasks: [] }] },
    ], activeSheetId: "b",
  });
  assert.equal(sheetProject(project, "a").stages[0].id, "sa");
  assert.equal(sheetProject(project).stages[0].id, "sb");
  assert.equal(activeSheetId(project), "b");
  assert.equal(sheetsOf(project).length, 2);
});

test("duplicate sheet preserves task exportComment and keeps comments independent between sheets", () => {
  let project = makeProject();
  const sheetA = project.sheets[0].id;
  project = normalizeProject({
    ...project,
    sheets: [{ ...project.sheets[0], stages: [{ id: "sA", name: "A", tasks: [{ id: "tA", name: "Task", exportComment: "Только для A", executors: [] }] }] }],
    activeSheetId: sheetA,
  });
  const duplicated = duplicateSheet(project, sheetA);
  assert.equal(duplicated.sheets[1].stages[0].tasks[0].exportComment, "Только для A");
  const edited = normalizeProject({
    ...duplicated,
    sheets: duplicated.sheets.map((sheet) => sheet.id === duplicated.sheets[1].id ? { ...sheet, stages: [{ ...sheet.stages[0], tasks: [{ ...sheet.stages[0].tasks[0], exportComment: "Изменено в копии" }] }] } : sheet),
  });
  assert.equal(edited.sheets[0].stages[0].tasks[0].exportComment, "Только для A");
  assert.equal(edited.sheets[1].stages[0].tasks[0].exportComment, "Изменено в копии");
});

test("semantic resolve and compile target the sheet in scope, not the active sheet", () => {
  const project = normalizeProject({
    id: "p",
    name: "Multi",
    sheets: [
      { id: "a", name: "A", stages: [{ id: "sA", name: "Stage A", tasks: [{ id: "tA", name: "Задача", executors: [] }] }] },
      { id: "b", name: "B", stages: [{ id: "sB", name: "Stage B", tasks: [{ id: "tB", name: "Задача", executors: [] }] }] },
    ],
    activeSheetId: "b",
  });
  const scope = { kind: "project", projectId: "p", sheetId: "a" };
  const semantic = { kind: "commands", summary: "rename", commands: [{ type: "task.rename", name: "Переименовано", targetName: "Задача" }], warnings: [] };
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope, instruction: "Переименуй задачу «Задача»" });
  assert.deepEqual(resolved.unresolvedSlots, []);
  assert.equal(resolved.confirmedTargets[0].target.id, "tA");

  const request = { requestId: "r", baseRevision: "sha256:x", scope, instruction: "Переименуй задачу «Задача»", knowledge: { selectedSources: [] }, idPool: { stages: [], tasks: [], executors: [], tags: [] } };
  const diff = compileAiEditSemanticPlan({ semantic: materializeResolvedSemanticPlan(resolved), request, project, confirmedTargets: resolved.confirmedTargets, performers: [] });
  assert.equal(diff.operations[0].targetId, "tA");

  const after = applyAiEditOperations(project, diff, { performers: [], idPool: request.idPool, instruction: request.instruction, selectedSources: [] });
  assert.equal(stagesOf(after, "a")[0].tasks[0].name, "Переименовано");
  assert.equal(stagesOf(after, "b")[0].tasks[0].name, "Задача");
});

/* ============ AI semantic batch (all_in_scope) and target budget ============ */

const payExecutor = (id, name, { type = "fix_total", rate = "", amount = "" } = {}) => ({
  id, amount, performerId: null, performerSnapshot: null,
  tags: [
    { id: `${id}-name`, key: "name", value: name },
    { id: `${id}-payment`, key: "payment", value: type, payment: { type, rate, units: "1", hours: "1", shifts: "1" } },
  ],
});

const executorPayment = (project, sheetId, executorId) => {
  for (const stage of stagesOf(project, sheetId)) for (const task of stage.tasks || []) {
    const executor = (task.executors || []).find((item) => item.id === executorId);
    if (executor) return executor.tags.find((tag) => tag.key === "payment")?.payment;
  }
  return null;
};

const semanticRequest = (instruction, scope) => ({
  schemaVersion: 1, requestId: "req", projectId: "p", baseRevision: "sha256:x", scope,
  instruction, knowledge: { useStudioKnowledge: false, selectedSources: [] }, confirmed: {},
  idPool: { stages: [], tasks: [], executors: [], tags: ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5", "tag-6", "tag-7", "tag-8"] },
});

const resolveCompileApply = (project, scope, instruction, rawSemantic) => {
  const semantic = parseAiEditSemanticResponse(rawSemantic);
  assert.ok(semantic, "semantic payload accepted");
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope, instruction });
  const request = semanticRequest(instruction, scope);
  const diff = compileAiEditSemanticPlan({ semantic: materializeResolvedSemanticPlan(resolved), request, project, confirmedTargets: resolved.confirmedTargets, performers: [] });
  const after = applyAiEditOperations(project, diff, { performers: [], idPool: request.idPool, instruction, selectedSources: [] });
  return { resolved, after };
};

test("all executors payment type + rate resolves without clarification and touches only the scoped sheet", () => {
  const project = normalizeProject({
    id: "p", name: "Multi",
    sheets: [
      { id: "a", name: "A", stages: [{ id: "sA", name: "Stage A", tasks: [{ id: "tA", name: "Задача", executors: [payExecutor("e1", "Иван", { type: "fix_total", amount: "1000" }), payExecutor("e2", "Анна", { type: "hourly", rate: "500" })] }] }] },
      { id: "b", name: "B", stages: [{ id: "sB", name: "Stage B", tasks: [{ id: "tB", name: "Задача", executors: [payExecutor("e3", "Олег", { type: "fix_total", amount: "999" })] }] }] },
    ],
    activeSheetId: "b",
  });
  const scope = { kind: "project", projectId: "p", sheetId: "a" };
  const instruction = "у всех исполнителей поменяй тип оплаты на ставка за смену, стоимость смены 9120 руб";
  const { resolved, after } = resolveCompileApply(project, scope, instruction, {
    kind: "commands", summary: "Изменить оплату всех исполнителей", warnings: [],
    commands: [
      { type: "executor.setPaymentType", paymentType: "shift", target: { kind: "all_in_scope" } },
      { type: "executor.setPaymentRate", value: 9120, target: { kind: "all_in_scope" } },
    ],
  });
  assert.deepEqual(resolved.unresolvedSlots, []);
  for (const id of ["e1", "e2"]) {
    assert.equal(executorPayment(after, "a", id).type, "shift");
    assert.equal(executorPayment(after, "a", id).rate, "9120");
  }
  assert.equal(executorPayment(after, "b", "e3").type, "fix_total");
  assert.equal(stagesOf(after, "b")[0].tasks[0].executors[0].amount, "999");
});

test("all executors shift→hourly with kept rate resolves without clarification and leaves the other sheet untouched", () => {
  const project = normalizeProject({
    id: "p", name: "Multi",
    sheets: [
      { id: "a", name: "A", stages: [{ id: "sA", name: "Stage A", tasks: [{ id: "tA", name: "Монтаж", executors: [payExecutor("e1", "Иван", { type: "shift", rate: "1000" }), payExecutor("e2", "Анна", { type: "shift", rate: "1500" })] }] }] },
      { id: "b", name: "B", stages: [{ id: "sB", name: "Stage B", tasks: [{ id: "tB", name: "Монтаж", executors: [payExecutor("e3", "Олег", { type: "shift", rate: "700" })] }] }] },
    ],
    activeSheetId: "b",
  });
  const scope = { kind: "project", projectId: "p", sheetId: "a" };
  const instruction = "поменяй на всех исполнителях ставку за смену на ставку за час, оставь стоимость часа 9120";
  const { resolved, after } = resolveCompileApply(project, scope, instruction, {
    kind: "commands", summary: "Перевести всех исполнителей на почасовую оплату", warnings: [],
    commands: [
      { type: "executor.setPaymentType", paymentType: "hourly", target: { kind: "all_in_scope" } },
      { type: "executor.setPaymentRate", value: 9120, target: { kind: "all_in_scope" } },
    ],
  });
  assert.deepEqual(resolved.unresolvedSlots, []);
  for (const id of ["e1", "e2"]) {
    assert.equal(executorPayment(after, "a", id).type, "hourly");
    assert.equal(executorPayment(after, "a", id).rate, "9120");
  }
  assert.equal(executorPayment(after, "b", "e3").type, "shift");
  assert.equal(executorPayment(after, "b", "e3").rate, "700");
});

test("target budget scales base cost to ~1_000_000 keeping markup/tax/VAT and the other sheet unchanged", () => {
  const project = normalizeProject({
    id: "p", name: "Multi", globalMarkup: 25, markupMode: "embedded",
    tax: { type: "osno", percent: "6", visible: true }, vat: { percent: "20" },
    sheets: [
      { id: "a", name: "A", stages: [{ id: "sA", name: "Stage A", tasks: [{ id: "tA", name: "Задача", executors: [payExecutor("e1", "Иван", { type: "fix_total", amount: "250000" })] }] }] },
      { id: "b", name: "B", stages: [{ id: "sB", name: "Stage B", tasks: [{ id: "tB", name: "Задача", executors: [payExecutor("e3", "Олег", { type: "fix_total", amount: "50000" })] }] }] },
    ],
    activeSheetId: "b",
  });
  const scope = { kind: "project", projectId: "p", sheetId: "a" };
  const instruction = "увеличь стоимость всей сметы до 1 млн";
  const { resolved, after } = resolveCompileApply(project, scope, instruction, {
    kind: "commands", summary: "Привести базовую стоимость сметы к 1 млн", warnings: [],
    commands: [{ type: "estimate.setTargetBudget", value: 1000000 }],
  });
  assert.deepEqual(resolved.unresolvedSlots, []);
  assert.ok(Math.abs(projectSum(sheetProject(after, "a")) - 1_000_000) < 1, "base cost ≈ 1_000_000");
  assert.equal(after.globalMarkup, 25);
  assert.equal(after.tax.percent, "6");
  assert.equal(after.vat.percent, "20");
  assert.equal(projectSum(sheetProject(after, "b")), 50000);
});

