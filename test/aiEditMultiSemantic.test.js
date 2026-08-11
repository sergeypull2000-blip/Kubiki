import test from "node:test";
import assert from "node:assert/strict";
import { parseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { compileAiEditSemanticPlan } from "../src/ai/editSemanticCompiler.js";
import { applyAiEditOperations } from "../src/ai/editOperations.js";
import { materializeResolvedSemanticPlan, resolveAiEditSemanticDraft } from "../src/ai/editSemanticPlan.js";
import { signAiEditContinuation, verifyAiEditContinuation } from "../api/_lib/semanticContinuation.js";

const pool = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
const idPool = { stages: pool("stage", 6), tasks: pool("task", 30), executors: pool("executor", 40), tags: pool("tag", 200) };
const request = { schemaVersion: 1, requestId: "request", projectId: "project", baseRevision: "revision", scope: { kind: "project", projectId: "project" },
  instruction: "Добавь этап препродакшн, задачи и исполнителей; этап Продакшн; в постпродакшн двух исполнителей. Всем исполнителям 6% налога",
  knowledge: { useStudioKnowledge: false, selectedSources: [] }, confirmed: {}, idPool };
const project = { id: "project", name: "Смета", stages: [{ id: "post", name: "Постпродакшн", presetKey: "custom", tasks: [{ id: "old-task", name: "Монтаж", executors: [{ id: "old-executor", amount: "100", performerId: null, performerSnapshot: null, tags: [{ id: "old-role", key: "role", value: "3D артист" }] }] }] }] };

function scenario() {
  return parseAiEditSemanticResponse({ kind: "commands", summary: "Создать производственный план", warnings: [], commands: [
    { type: "stage.create", ref: "new-stage-1", name: "Препродакшн" },
    { type: "task.create", ref: "new-task-1", stageRef: "new-stage-1", name: "Раскадровка" },
    { type: "executor.createAnonymous", taskRef: "new-task-1", name: "Миша" },
    { type: "task.create", ref: "new-task-2", stageRef: "new-stage-1", name: "Концепция" },
    { type: "executor.createAnonymous", taskRef: "new-task-2", name: "Аня" },
    { type: "stage.create", ref: "new-stage-2", name: "Продакшн" },
    { type: "task.create", ref: "new-task-3", stageRef: "new-stage-2", name: "Моделинг" },
    { type: "executor.createAnonymous", taskRef: "new-task-3", name: "Аня" },
    { type: "task.create", ref: "new-task-4", stageRef: "new-stage-2", name: "Свет" },
    { type: "executor.createAnonymous", taskRef: "new-task-4", name: "Гриша" },
    { type: "task.create", ref: "new-task-5", stageRef: "new-stage-2", name: "Визуализация" },
    { type: "executor.createAnonymous", taskRef: "new-task-5", name: "Элла" },
    { type: "task.create", ref: "new-task-6", stageName: "Постпродакшн", name: "Композитинг" },
    { type: "executor.createAnonymous", taskRef: "new-task-6", compensation: "300к" },
    { type: "executor.createAnonymous", taskRef: "new-task-6", compensation: "300к" },
    { type: "executor.setTaxBulk", percent: 6 },
  ] });
}

test("multi-command schema stays bounded and rejects low-level or invalid refs", () => {
  assert.ok(scenario());
  const tooMany = { kind: "commands", summary: "x", warnings: [], commands: Array.from({ length: 21 }, () => ({ type: "stage.create" })) };
  assert.equal(parseAiEditSemanticResponse(tooMany), null);
  assert.equal(parseAiEditSemanticResponse({ kind: "commands", summary: "x", warnings: [], commands: [{ type: "stage.create", ref: "real-id", operations: [] }] }), null);
});

test("real multi-step scenario compiles in fixed phases and bulk includes newly created Executors", () => {
  const semantic = scenario();
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope });
  assert.deepEqual(resolved.unresolvedSlots, []);
  const diff = compileAiEditSemanticPlan({ semantic: materializeResolvedSemanticPlan(resolved), request, project, confirmedTargets: resolved.confirmedTargets });
  const phases = diff.operations.map((operation) => operation.type);
  assert.ok(phases.lastIndexOf("stage.add") < phases.indexOf("task.add"));
  assert.ok(phases.lastIndexOf("task.add") < phases.indexOf("executor.addAnonymous"));
  assert.ok(phases.lastIndexOf("executor.addAnonymous") < phases.lastIndexOf("executor.tag.add"));
  const next = applyAiEditOperations(project, diff, { idPool, instruction: request.instruction });
  const allExecutors = next.stages.flatMap((stage) => stage.tasks.flatMap((task) => task.executors));
  assert.equal(allExecutors.length, 8);
  assert.ok(allExecutors.every((executor) => executor.tags.find((tag) => tag.key === "tax")?.value === "6"));
  const anonymous = next.stages.find((stage) => stage.name === "Постпродакшн").tasks.find((task) => task.name === "Композитинг").executors;
  assert.deepEqual(anonymous.map((executor) => executor.amount), ["300000", "300000"]);
});

test("clarification fills one slot while validated draft remains structurally unchanged", () => {
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Добавить исполнителей", warnings: [], commands: [
    { type: "task.create", ref: "new-task-1", stageName: "Постпродакшн" },
    { type: "executor.createAnonymous", taskRef: "new-task-1", compensation: 300000 },
    { type: "executor.createAnonymous", taskRef: "new-task-1", compensation: 300000 },
  ] });
  const original = JSON.stringify(semantic);
  const pending = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope });
  assert.equal(pending.unresolvedSlots.length, 1);
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, prior: pending, answer: "Композитинг" });
  assert.equal(resolved.unresolvedSlots.length, 0);
  assert.equal(JSON.stringify(semantic), original);
  assert.equal(materializeResolvedSemanticPlan(resolved).commands[0].name, "Композитинг");
});

test("continuation token is versioned, signed and expires", () => {
  const previous = process.env.AI_EDIT_CONTINUATION_SECRET; process.env.AI_EDIT_CONTINUATION_SECRET = "test-secret";
  try {
    const token = signAiEditContinuation({ baseRevision: "revision", semantic: scenario(), unresolvedSlots: [], confirmedTargets: {} }, 1000);
    assert.equal(verifyAiEditContinuation(token, 1001).v, 1);
    assert.equal(verifyAiEditContinuation(`${token}x`, 1001), null);
    assert.equal(verifyAiEditContinuation(token, 1000 + 16 * 60 * 1000), null);
  } finally { if (previous === undefined) delete process.env.AI_EDIT_CONTINUATION_SECRET; else process.env.AI_EDIT_CONTINUATION_SECRET = previous; }
});
