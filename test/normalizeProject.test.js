import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROJECT_DATA_VERSION, applyConfirmedEstimate, makeProject, makeProjectFromEstimate, makeTask, normalizeProject } from "../src/store.js";
import { buildProjectRow, deserializeProjectFromServer } from "../src/projectServer.js";

test("new project has the canonical data version", () => {
  assert.equal(makeProject().dataVersion, PROJECT_DATA_VERSION);
});

test("Initial estimate materialization persists the edited preview project name", () => {
  const stages = [{ id: "stage", name: "Stage", tasks: [] }];
  const generated = makeProjectFromEstimate(stages, { projectName: "  Edited Campaign Name  " });
  assert.equal(generated.name, "Edited Campaign Name");
  assert.deepEqual(generated.stages, stages);
  const reloaded = normalizeProject(JSON.parse(JSON.stringify(generated)));
  assert.equal(reloaded.name, "Edited Campaign Name");
});

test("real Workspace confirm path renames an empty whole-project Initial estimate and survives server round-trip", () => {
  const workspace = readFileSync(new URL("../src/components/Workspace.jsx", import.meta.url), "utf8");
  assert.match(workspace, /dispatch\(\(project\) => applyConfirmedEstimate\(project, stages, meta\)\)/);
  const current = makeProject();
  const stages = [{ id: "stage", name: "Production", tasks: [] }];
  const confirmed = applyConfirmedEstimate(current, stages, { generationScope: "whole_project", projectName: "Brand Launch 2026" });
  assert.equal(confirmed.name, "Brand Launch 2026");
  const row = buildProjectRow("user", confirmed);
  assert.equal(row.name, "Brand Launch 2026");
  assert.equal(deserializeProjectFromServer({ ...row, client_id: confirmed.id }).name, "Brand Launch 2026");
  const fragment = applyConfirmedEstimate({ ...confirmed, stages: [] }, stages, { generationScope: "fragment", projectName: "Unsafe Rename" });
  assert.equal(fragment.name, "Brand Launch 2026");
});

test("normalizeProject(undefined) returns a safe project", () => {
  const result = normalizeProject(undefined);
  assert.equal(result.dataVersion, PROJECT_DATA_VERSION);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.activeSheetId, result.sheets[0].id);
  assert.deepEqual(result.stages, []);
});

test("legacy project without stages migrates to a single deterministic default sheet", () => {
  const result = normalizeProject({ id: "legacy" });
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].id, "sheet-legacy-1");
  assert.equal(result.sheets[0].name, "Смета 1");
  assert.equal(result.activeSheetId, "sheet-legacy-1");
  assert.deepEqual(result.stages, []);
});

test("legacy project without dataVersion gets the canonical version", () => {
  assert.equal(normalizeProject({ id: "legacy" }).dataVersion, PROJECT_DATA_VERSION);
});

test("valid existing dataVersion is preserved", () => {
  assert.equal(normalizeProject({ dataVersion: 7 }).dataVersion, 7);
});

test("stage without tasks gets an empty tasks array", () => {
  assert.deepEqual(normalizeProject({ stages: [{ id: "stage" }] }).stages[0].tasks, []);
});

test("task without executors gets an empty executors array", () => {
  const result = normalizeProject({ stages: [{ tasks: [{ id: "task" }] }] });
  assert.deepEqual(result.stages[0].tasks[0].executors, []);
});

test("existing stages, tasks and executors are preserved inside the default sheet", () => {
  const executor = { id: "executor", amount: "1250" };
  const input = { dataVersion: PROJECT_DATA_VERSION, stages: [{ id: "stage", tasks: [{ id: "task", executors: [executor] }] }] };
  const result = normalizeProject(input);
  assert.deepEqual(result.stages, input.stages);
  assert.deepEqual(result.sheets[0].stages, input.stages);
  assert.equal(result.sheets[0].id, "sheet-project-1");
});

test("unknown project fields are preserved", () => {
  const result = normalizeProject({ id: "project", metadata: { source: "legacy" }, custom: 42 });
  assert.deepEqual(result.metadata, { source: "legacy" });
  assert.equal(result.custom, 42);
});

test("normalization does not mutate its input", () => {
  const input = { stages: [{ tasks: [{}] }] };
  const snapshot = structuredClone(input);
  const result = normalizeProject(input);
  assert.deepEqual(input, snapshot);
  assert.notEqual(result, input);
  assert.equal("executors" in input.stages[0].tasks[0], false);
});

test("normalization is idempotent", () => {
  const once = normalizeProject({ id: "project", stages: [{ tasks: [{}] }] });
  assert.deepEqual(normalizeProject(once), once);
});

test("financial values are unchanged", () => {
  const input = {
    globalMarkup: 25,
    total: "100000.50",
    tax: { type: "osno", percent: "20", visible: true },
    stages: [{ subtotal: 5000, tasks: [{ directCost: "1200.25", executors: [{ amount: "950.75" }] }] }],
  };
  const result = normalizeProject(input);
  assert.equal(result.globalMarkup, input.globalMarkup);
  assert.equal(result.total, input.total);
  assert.deepEqual(result.tax, input.tax);
  assert.equal(result.stages[0].subtotal, input.stages[0].subtotal);
  assert.equal(result.stages[0].tasks[0].directCost, input.stages[0].tasks[0].directCost);
  assert.equal(result.stages[0].tasks[0].executors[0].amount, input.stages[0].tasks[0].executors[0].amount);
});

test("legacy project can execute Workspace collection operations after normalization", () => {
  const project = normalizeProject({ id: "legacy", name: "Old project" });
  assert.equal(project.stages.length, 0);
  assert.equal(project.stages.every((stage) => stage.tasks.every((task) => task.executors.length >= 0)), true);
  assert.deepEqual(project.stages.map((stage) => stage.tasks.map((task) => task.executors.map((executor) => executor.id))), []);
});

test("makeTask initializes an empty exportComment", () => {
  assert.equal(makeTask().exportComment, "");
});

test("task exportComment survives normalization and server round-trip", () => {
  const input = { id: "project", stages: [{ tasks: [{ id: "task", name: "Task", exportComment: "Доделать к пятнице" }] }] };
  const normalized = normalizeProject(input);
  assert.equal(normalized.stages[0].tasks[0].exportComment, "Доделать к пятнице");
  const row = buildProjectRow("user", normalized);
  const back = deserializeProjectFromServer({ ...row, client_id: normalized.id });
  assert.equal(back.stages[0].tasks[0].exportComment, "Доделать к пятнице");
});
