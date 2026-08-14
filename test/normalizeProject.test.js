import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_DATA_VERSION, makeProject, makeProjectFromEstimate, normalizeProject } from "../src/store.js";

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

test("normalizeProject(undefined) returns a safe project", () => {
  assert.deepEqual(normalizeProject(undefined), { dataVersion: PROJECT_DATA_VERSION, stages: [] });
});

test("project without stages gets an empty stages array", () => {
  assert.deepEqual(normalizeProject({ id: "legacy" }), { id: "legacy", dataVersion: PROJECT_DATA_VERSION, stages: [] });
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

test("existing stages, tasks and executors are preserved", () => {
  const executor = { id: "executor", amount: "1250" };
  const input = { dataVersion: PROJECT_DATA_VERSION, stages: [{ id: "stage", tasks: [{ id: "task", executors: [executor] }] }] };
  assert.deepEqual(normalizeProject(input), input);
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
