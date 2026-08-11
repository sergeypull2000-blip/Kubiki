import test from "node:test";
import assert from "node:assert/strict";
import { parseAiEditResponse, validateAiEditRequest } from "../src/ai/editSchema.js";
import { AiEditValidationError, applyAiEditOperations } from "../src/ai/editOperations.js";
import { buildAiEditPreview } from "../src/ai/editPreview.js";
import { projectRevision } from "../src/ai/projectRevision.js";
import { createAiEditUndoStore } from "../src/ai/editUndo.js";
import { globalAiEditScope } from "../src/ai/editScope.js";
import { buildAiEditContinuation } from "../src/ai/editContinuation.js";
import { executorSum } from "../src/calculations.js";

const pool = () => ({ stages: ["s-new"], tasks: ["t-new"], executors: ["e-new"], tags: ["tg-new-1", "tg-new-2", "tg-new-3", "tg-new-4", "tg-new-5", "tg-new-6"] });
const project = () => ({ id: "p", name: "Проект", globalMarkup: 25, stages: [{ id: "s", name: "Продакшн", presetKey: "prod", collapsed: false, legacyStage: true, tasks: [{ id: "t", name: "Моделинг", collapsed: false, directCost: null, legacyTask: true, executors: [{ id: "e", amount: "1000", performerId: null, performerSnapshot: null, legacyExecutor: { kept: true }, tags: [{ id: "pay", key: "payment", value: "fix_total", payment: { type: "fix_total", rate: "old", units: "2", hours: "3", shifts: "4" } }] }] }] }], legacyProject: { kept: true } });
const scope = (kind = "project") => kind === "project" ? { kind, projectId: "p" } : kind === "stage" ? { kind, projectId: "p", stageId: "s" } : kind === "task" ? { kind, projectId: "p", stageId: "s", taskId: "t" } : { kind, projectId: "p", stageId: "s", taskId: "t", executorId: "e" };
const operation = (type, targetId, value, source = { kind: "current_request" }, id = `op-${type}`) => ({ id, type, targetId, ...(value === undefined ? {} : { value }), reason: "Нужно пользователю", source });
const response = (operations, kindScope = scope()) => ({ schemaVersion: 1, kind: "diff", requestId: "r", baseRevision: "rev", scope: kindScope, summary: "Изменения", operations, warnings: [] });

test("strict schema accepts allowlist and rejects unknown operations and fields", () => {
  const valid = response([operation("task.rename", "t", { name: "Скульптинг" })]);
  assert.ok(parseAiEditResponse(valid));
  assert.equal(parseAiEditResponse({ ...valid, extra: true }), null);
  assert.equal(parseAiEditResponse({ ...valid, operations: [{ ...valid.operations[0], type: "set" }] }), null);
});

test("request schema requires stable scope ids, id pool and no userId", () => {
  const body = { schemaVersion: 1, requestId: "r", projectId: "p", baseRevision: "sha256:x", scope: scope(), instruction: "Добавь этап", knowledge: { useStudioKnowledge: false, selectedSources: [] }, confirmed: {}, idPool: pool() };
  assert.equal(validateAiEditRequest(body).ok, true);
  assert.equal(validateAiEditRequest({ ...body, userId: "attacker" }).ok, false);
});

test("global technical entry point always builds project scope", () => {
  assert.deepEqual(globalAiEditScope({ id: "p" }), { kind: "project", projectId: "p" });
});

test("content revision ignores collapsed but reacts to names and finance", async () => {
  const value = project(), base = await projectRevision(value);
  value.stages[0].collapsed = true; value.stages[0].tasks[0].collapsed = true;
  assert.equal(await projectRevision(value), base);
  value.stages[0].tasks[0].name = "Другое";
  assert.notEqual(await projectRevision(value), base);
});

test("stage and task can be added and renamed using only preallocated ids", () => {
  const diff = response([
    operation("stage.add", "p", { stageId: "s-new", name: "Пост", presetKey: "comp", beforeStageId: null }, undefined, "op-1"),
    operation("task.add", "s-new", { taskId: "t-new", name: "Композ", beforeTaskId: null }, undefined, "op-2"),
    operation("task.rename", "t-new", { name: "Композитинг" }, undefined, "op-3"),
  ]);
  const next = applyAiEditOperations(project(), diff, { idPool: pool() });
  assert.equal(next.stages[1].tasks[0].name, "Композитинг");
  assert.throws(() => applyAiEditOperations(project(), response([operation("stage.add", "p", { stageId: "invented", name: "X", presetKey: "custom", beforeStageId: null })]), { idPool: pool() }), AiEditValidationError);
});

test("invalid target, out-of-scope target and unknown operation are rejected without mutation", () => {
  const original = project(), snapshot = structuredClone(original);
  assert.throws(() => applyAiEditOperations(original, response([operation("task.rename", "missing", { name: "X" })]), { idPool: pool() }), /не найден/);
  assert.throws(() => applyAiEditOperations(original, response([operation("stage.add", "p", { stageId: "s-new", name: "X", presetKey: "custom", beforeStageId: null })], scope("task")), { idPool: pool() }), /только в контексте всей сметы/);
  assert.deepEqual(original, snapshot);
});

test("deleting a subtree removes its descendants atomically", () => {
  const next = applyAiEditOperations(project(), response([operation("stage.delete", "s")]), { idPool: pool() });
  assert.deepEqual(next.stages, []);
  assert.throws(() => applyAiEditOperations(project(), response([operation("stage.delete", "s", undefined, undefined, "op-1"), operation("task.rename", "t", { name: "X" }, undefined, "op-2")]), { idPool: pool() }), /не найден/);
});

test("tax is a real tag operation and never changes executor.amount", () => {
  const diff = response([operation("executor.tag.add", "e", { tagId: "tg-new-1", key: "tax", value: "6" })], scope("executor"));
  const next = applyAiEditOperations(project(), diff, { idPool: pool() }), executor = next.stages[0].tasks[0].executors[0];
  assert.equal(executor.amount, "1000");
  assert.equal(executor.tags.find((tag) => tag.key === "tax").value, "6");
  assert.equal(executorSum(executor), 1063.83);
});

test("anonymous Executor uses only explicitly preallocated Executor and role tag ids", () => {
  const diff = response([operation("executor.addAnonymous", "t", { executorId: "e-new", roleTagId: "tg-new-1" })], scope("task"));
  const next = applyAiEditOperations(project(), diff, { idPool: pool() }), executor = next.stages[0].tasks[0].executors[1];
  assert.equal(executor.id, "e-new"); assert.equal(executor.tags[0].id, "tg-new-1"); assert.equal(executor.tags[0].key, "role");
});

test("custom Stage creation uses a preallocated id and explicit custom preset", () => {
  const diff = response([operation("stage.add", "p", { stageId: "s-new", name: "Новый этап", presetKey: "custom", beforeStageId: null })]);
  const next = applyAiEditOperations(project(), diff, { idPool: pool() });
  assert.deepEqual(next.stages.at(-1), { id: "s-new", presetKey: "custom", name: "Новый этап", tasks: [], collapsed: false });
});

test("anonymous Executor can receive name, existing core role, payment and fixed rate without duplicate tags", () => {
  const diff = response([
    operation("executor.addAnonymous", "t", { executorId: "e-new", roleTagId: "tg-new-1" }, undefined, "op-1"),
    operation("executor.tag.update", "tg-new-1", { executorId: "e-new", value: "Арт-директор" }, undefined, "op-2"),
    operation("executor.tag.add", "e-new", { tagId: "tg-new-2", key: "name", value: "Иванов" }, undefined, "op-3"),
    operation("executor.payment.setType", "e-new", { type: "fix_total" }, undefined, "op-4"),
    operation("executor.amount.set", "e-new", { value: "80000" }, undefined, "op-5"),
  ]);
  const next = applyAiEditOperations(project(), diff, { idPool: pool() }), executor = next.stages[0].tasks[0].executors[1];
  assert.equal(executor.tags.filter((tag) => tag.key === "role").length, 1);
  assert.equal(executor.tags.find((tag) => tag.key === "role").value, "Арт-директор");
  assert.equal(executor.tags.find((tag) => tag.key === "name").value, "Иванов");
  assert.equal(executor.tags.find((tag) => tag.key === "payment").payment.type, "fix_total");
  assert.equal(executor.amount, "80000");
});

test("payment type change exactly follows current UI and inactive amount is preserved", () => {
  const next = applyAiEditOperations(project(), response([operation("executor.payment.setType", "e", { type: "hourly" })], scope("executor")), { idPool: pool() });
  const executor = next.stages[0].tasks[0].executors[0], payment = executor.tags.find((tag) => tag.key === "payment").payment;
  assert.equal(executor.amount, "1000");
  assert.deepEqual(payment, { type: "hourly", rate: "", units: "", hours: "", shifts: "" });
  assert.equal(executorSum(executor), 0);
});

test("Performer snapshot creation requires a direct request and preserves source independence", () => {
  const performer = { id: "pf", firstName: "Миша", lastName: "Иванов", primaryRole: "3D артист", additionalRoles: [], specializations: [], software: [], grade: null, defaultPaymentType: "fix_total", defaultRate: 5000, defaultUnit: "total", defaultTaxRate: 6, defaultCommission: null, legalStatus: null, active: true };
  const diff = response([operation("executor.addFromPerformer", "t", { executorId: "e-new", performerId: "pf" }, { kind: "performer", id: "pf", name: "Миша Иванов" })], scope("task"));
  assert.throws(() => applyAiEditOperations(project(), diff, { idPool: pool(), performers: [performer], instruction: "Добавь исполнителя" }), /прямо указан/);
  const next = applyAiEditOperations(project(), diff, { idPool: pool(), performers: [performer], instruction: "Назначь Мишу на моделинг" });
  performer.firstName = "Пётр";
  assert.equal(next.stages[0].tasks[0].executors[1].performerSnapshot.name, "Миша Иванов");
});

test("replace Performer is direct-only, replaces known data and preserves executor id and legacy fields", () => {
  const performer = { id: "pf", firstName: "Анна", lastName: "Смирнова", primaryRole: "Продюсер", additionalRoles: [], specializations: [], software: [], grade: null, defaultPaymentType: "fix_total", defaultRate: 7000, defaultUnit: "total", defaultTaxRate: null, defaultCommission: null, legalStatus: null, active: true };
  const diff = response([operation("executor.replacePerformer", "e", { performerId: "pf" }, { kind: "performer", id: "pf", name: "Анна Смирнова" })], scope("executor"));
  assert.throws(() => applyAiEditOperations(project(), diff, { idPool: pool(), performers: [performer], instruction: "Назначь Анну" }), /только по прямому запросу/);
  const next = applyAiEditOperations(project(), diff, { idPool: pool(), performers: [performer], instruction: "Замени исполнителя на Анну" }), executor = next.stages[0].tasks[0].executors[0];
  assert.equal(executor.id, "e"); assert.deepEqual(executor.legacyExecutor, { kept: true }); assert.equal(executor.amount, "7000"); assert.equal(executor.performerId, "pf");
});

test("preview is immutable, computes before/after and rejects stale revisions", async () => {
  const original = project(), snapshot = structuredClone(original), revision = await projectRevision(original), diff = { ...response([operation("task.rename", "t", { name: "Скульптинг" })]), baseRevision: revision };
  const preview = await buildAiEditPreview({ project: original, response: diff, idPool: pool(), expectedRevision: revision });
  assert.deepEqual(original, snapshot); assert.equal(preview.kind, "diff"); assert.equal(preview.before.internalCost, 1000); assert.equal(preview.after.tasks, 1);
  await assert.rejects(() => buildAiEditPreview({ project: { ...original, name: "Changed" }, response: diff, idPool: pool(), expectedRevision: revision }), (error) => error.code === "stale_revision");
});

test("global tax diff creates add/update operations, preserves amounts and exposes financial preview", async () => {
  const original = project(), task = original.stages[0].tasks[0];
  task.executors.push({ id: "e2", amount: "2000", tags: [{ id: "pay2", key: "payment", value: "fix_total", payment: { type: "fix_total", rate: "", units: "", hours: "", shifts: "" } }, { id: "tax2", key: "tax", value: "3" }] });
  const revision = await projectRevision(original), diff = { ...response([
    operation("executor.tag.add", "e", { tagId: "tg-new-1", key: "tax", value: "6" }, undefined, "op-tax-1"),
    operation("executor.tag.update", "tax2", { executorId: "e2", value: "6" }, undefined, "op-tax-2"),
  ]), baseRevision: revision };
  const preview = await buildAiEditPreview({ project: original, response: diff, idPool: pool(), expectedRevision: revision });
  assert.equal(preview.kind, "diff"); assert.equal(preview.operations.length, 2);
  assert.equal(preview.afterProject.stages[0].tasks[0].executors[0].amount, "1000");
  assert.equal(preview.afterProject.stages[0].tasks[0].executors[1].amount, "2000");
  assert.ok(preview.after.executorTaxes > preview.before.executorTaxes);
});

test("clarification continuation preserves original request and confirms source id", () => {
  const continuation = buildAiEditContinuation({ instruction: "Добавь Мишу из базы", source: { kind: "performer", id: "pf" }, label: "Миша Иванов" });
  assert.match(continuation.instruction, /^Добавь Мишу из базы/); assert.equal(continuation.confirmed.performerId, "pf");
  assert.deepEqual(continuation.knowledge.selectedSources, [{ kind: "performer", id: "pf" }]);
});

test("one-level in-memory Undo is replaced and invalidated on the next mutation", () => {
  const undo = createAiEditUndoStore(); undo.record("p", { beforeProject: project(), appliedRevision: "r1", requestId: "q1" });
  assert.equal(undo.has("p"), true); assert.equal(undo.get("p").requestId, "q1");
  undo.record("p", { beforeProject: { id: "p", stages: [] }, appliedRevision: "r2", requestId: "q2" });
  assert.equal(undo.get("p").requestId, "q2"); assert.equal(undo.invalidate("p"), true); assert.equal(undo.has("p"), false);
});
