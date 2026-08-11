import test from "node:test";
import assert from "node:assert/strict";
import { attachTrustedAiEditMetadata, parseAiEditSemanticResponse, diagnoseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { compileAiEditSemanticCommand } from "../src/ai/editSemanticCompiler.js";
import { applyAiEditOperations } from "../src/ai/editOperations.js";
import { resolveExecutorCreationTask, resolveProjectTarget, resolveTaskCreationStage } from "../api/_lib/projectTargetResolver.js";

const ids = { stages: ["new-stage"], tasks: ["new-task"], executors: ["new-executor"], tags: ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5", "tag-6", "tag-7", "tag-8"] };
const request = (instruction = "Измени") => ({ schemaVersion: 1, requestId: "r", projectId: "p", baseRevision: "rev", scope: { kind: "project", projectId: "p" }, instruction, knowledge: { useStudioKnowledge: false, selectedSources: [] }, confirmed: {}, idPool: ids });
const semantic = (command, summary = "Изменение") => parseAiEditSemanticResponse({ kind: "command", summary, command, warnings: [] });
const executor = (id, name, paymentType = "fix_total", tax = null) => ({ id, amount: "1000", performerId: null, performerSnapshot: null, tags: [{ id: `${id}-name`, key: "name", value: name }, { id: `${id}-payment`, key: "payment", value: paymentType, payment: { type: paymentType, rate: "500", units: "2", hours: "3", shifts: "4" } }, ...(tax === null ? [] : [{ id: `${id}-tax`, key: "tax", value: String(tax) }])] });
const project = () => ({ id: "p", name: "Смета", stages: [{ id: "s", name: "Препродакшн", presetKey: "preprod", tasks: [{ id: "t", name: "Концепт", executors: [executor("e1", "Гриша Петров"), executor("e2", "Анна", "hourly", 5)] }] }] });

test("semantic runtime rejects direct low-level diff without fallback", () => {
  const raw = { kind: "diff", summary: "x", operations: [], warnings: [] };
  assert.equal(parseAiEditSemanticResponse(raw, request()), null);
  assert.equal(diagnoseAiEditSemanticResponse(raw, request()), "ai_semantic_low_level_forbidden");
});

test("model semantic payload has no transport metadata and server attaches trusted context", () => {
  const trusted = request("Добавь новый этап"), raw = { kind: "command", summary: "Добавить этап", command: { type: "stage.create" }, warnings: [] };
  const parsed = parseAiEditSemanticResponse(raw);
  assert.deepEqual(parsed, raw);
  assert.equal(parseAiEditSemanticResponse({ ...raw, requestId: "model-copy" }), null);
  const diff = compileAiEditSemanticCommand({ semantic: parsed, request: trusted, project: project() });
  assert.equal(diff.requestId, trusted.requestId); assert.equal(diff.baseRevision, trusted.baseRevision); assert.deepEqual(diff.scope, trusted.scope);
  const clarification = attachTrustedAiEditMetadata({ kind: "clarification", question: "Какую Task выбрать?" }, trusted);
  assert.equal(clarification.requestId, trusted.requestId); assert.equal(clarification.baseRevision, trusted.baseRevision); assert.deepEqual(clarification.scope, trusted.scope);
});

test("semantic schema accepts exactly the first-MVP command allowlist", () => {
  const commands = [
    { type: "stage.create" },
    { type: "executor.createAnonymous", name: "Иванов", role: "Арт-директор", compensation: 80000 },
    { type: "executor.setCompensation", value: 120000 },
    { type: "executor.setTax", percent: 6 },
    { type: "executor.setTaxBulk", percent: 6 },
    { type: "task.delete" },
    { type: "executor.replacePerformer" },
  ];
  for (const command of commands) assert.ok(parseAiEditSemanticResponse(semantic(command), request()));
  assert.equal(parseAiEditSemanticResponse(semantic({ type: "stage.create", operations: [] }), request()), null);
  assert.equal(parseAiEditSemanticResponse(semantic({ type: "task.rename" }), request()), null);
});

test("stage.create compiles to exactly one neutral custom Stage", () => {
  const diff = compileAiEditSemanticCommand({ semantic: semantic({ type: "stage.create" }), request: request("Добавь новый этап"), project: project() });
  assert.equal(diff.operations.length, 1); assert.equal(diff.operations[0].type, "stage.add");
  assert.deepEqual(diff.operations[0].value, { stageId: "new-stage", name: "Новый этап", presetKey: "custom", beforeStageId: null });
});

test("stage.create ignores a name invented outside the current instruction", () => {
  const diff = compileAiEditSemanticCommand({ semantic: semantic({ type: "stage.create", name: "Сториборд из персонализации" }), request: request("Добавь новый этап"), project: project() });
  assert.equal(diff.operations[0].value.name, "Новый этап");
  assert.equal(diff.operations.length, 1);
});

test("executor.createAnonymous compiles role name and fixed compensation inside one Task", () => {
  const current = project(), task = resolveExecutorCreationTask("Добавь арт-директора Иванова в этап Препродакшн, ставка 80к", current).task;
  const command = semantic({ type: "executor.createAnonymous", name: "Иванов", role: "Арт-директор", compensation: "80к" });
  const diff = compileAiEditSemanticCommand({ semantic: command, request: request("Добавь арт-директора Иванова в этап Препродакшн, ставка 80к"), project: current, resolvedTask: task });
  assert.deepEqual(diff.operations.map((item) => item.type), ["executor.addAnonymous", "executor.tag.update", "executor.tag.add", "executor.payment.setType", "executor.amount.set"]);
  const next = applyAiEditOperations(current, diff, { idPool: ids, instruction: "Добавь арт-директора Иванова" });
  assert.equal(next.stages[0].tasks[0].executors.at(-1).amount, "80000");
});

test("executor creation asks for Task when Stage has several Tasks", () => {
  const current = project(); current.stages[0].tasks.push({ id: "t2", name: "Сториборд", executors: [] });
  const result = resolveExecutorCreationTask("Добавь Иванова в этап Препродакшн", current);
  assert.equal(result.task, null); assert.deepEqual(result.clarification.choices.map((item) => item.source.id), ["t", "t2"]);
});

test("setCompensation chooses amount or rate from current payment type", () => {
  const current = project();
  const fixedTarget = resolveProjectTarget("Увеличь оплату Гриши до 130к", current).target;
  const fixed = compileAiEditSemanticCommand({ semantic: semantic({ type: "executor.setCompensation", value: "130к" }), request: request(), project: current, resolvedTarget: fixedTarget });
  const hourlyTarget = resolveProjectTarget("Увеличь ставку Анны до 900", current).target;
  const hourly = compileAiEditSemanticCommand({ semantic: semantic({ type: "executor.setCompensation", value: 900 }), request: request(), project: current, resolvedTarget: hourlyTarget });
  assert.equal(fixed.operations[0].type, "executor.amount.set"); assert.equal(fixed.operations[0].value.value, "130000");
  assert.equal(hourly.operations[0].type, "executor.payment.setRate"); assert.equal(hourly.operations[0].value.value, "900");
});

test("setTaxBulk deterministically emits one valid tax operation per Executor", () => {
  const current = project(), diff = compileAiEditSemanticCommand({ semantic: semantic({ type: "executor.setTaxBulk", percent: 6 }), request: request("Поставь всем исполнителям налог 6%"), project: current });
  assert.deepEqual(diff.operations.map((item) => item.type), ["executor.tag.add", "executor.tag.update"]);
  const next = applyAiEditOperations(current, diff, { idPool: ids });
  assert.deepEqual(next.stages[0].tasks[0].executors.map((item) => item.tags.find((tag) => tag.key === "tax").value), ["6", "6"]);
  assert.deepEqual(next.stages[0].tasks[0].executors.map((item) => item.amount), ["1000", "1000"]);
});

test("task.delete and replacePerformer compile only confirmed stable ids", () => {
  const current = project(), taskTarget = resolveProjectTarget("Удалить задачу Концепт", current).target;
  const deletion = compileAiEditSemanticCommand({ semantic: semantic({ type: "task.delete" }), request: request(), project: current, resolvedTarget: taskTarget });
  assert.equal(deletion.operations[0].targetId, "t");
  const performer = { id: "pf", firstName: "Миша", primaryRole: "Арт-директор", active: true };
  const executorTarget = resolveProjectTarget("Замени Гришу на Мишу", current).target;
  const replaceRequest = { ...request("Замени Гришу на Мишу из базы"), knowledge: { useStudioKnowledge: false, selectedSources: [{ kind: "performer", id: "pf" }] }, confirmed: { projectEntityId: "e1", performerId: "pf" } };
  const replacement = compileAiEditSemanticCommand({ semantic: semantic({ type: "executor.replacePerformer" }), request: replaceRequest, project: current, resolvedTarget: executorTarget, performer, performers: [performer] });
  assert.equal(replacement.operations[0].targetId, "e1"); assert.equal(replacement.operations[0].value.performerId, "pf");
});

test("basic Stage and Task CRUD compiles to existing low-level operations", () => {
  const current = project(), stageTarget = { kind: "stage", id: "s" }, taskTarget = { kind: "task", id: "t" };
  const cases = [
    [{ type: "stage.rename", name: "Продакшн" }, stageTarget, "stage.rename"],
    [{ type: "stage.delete" }, stageTarget, "stage.delete"],
    [{ type: "task.create", name: "Аниматик" }, stageTarget, "task.add"],
    [{ type: "task.rename", name: "Арт" }, taskTarget, "task.rename"],
  ];
  for (const [command, resolvedTarget, lowLevel] of cases) {
    const diff = compileAiEditSemanticCommand({ semantic: semantic(command), request: request(), project: current, resolvedTarget });
    assert.equal(diff.operations.length, 1); assert.equal(diff.operations[0].type, lowLevel);
  }
  assert.equal(resolveTaskCreationStage("Добавь задачу Аниматик в Препродакшн", current).stage.id, "s");
});

test("basic Executor CRUD derives payment quantity field from current payment type", () => {
  const current = project(), fixed = { kind: "executor", id: "e1" }, hourly = { kind: "executor", id: "e2" };
  const cases = [
    [{ type: "executor.delete" }, fixed, "executor.delete"],
    [{ type: "executor.setPaymentType", paymentType: "Почасовая ставка" }, fixed, "executor.payment.setType"],
    [{ type: "executor.setPaymentRate", value: 900 }, hourly, "executor.payment.setRate"],
    [{ type: "executor.setPaymentQuantity", value: 8 }, hourly, "executor.payment.setQuantity"],
    [{ type: "executor.setRole", name: "Арт-директор" }, fixed, "executor.tag.add"],
    [{ type: "executor.setName", name: "Иван" }, fixed, "executor.tag.update"],
  ];
  for (const [command, resolvedTarget, lowLevel] of cases) {
    const parsed = semantic(command); assert.ok(parsed);
    const diff = compileAiEditSemanticCommand({ semantic: parsed, request: request(), project: current, resolvedTarget });
    assert.equal(diff.operations[0].type, lowLevel);
    if (command.type === "executor.setPaymentQuantity") assert.deepEqual(diff.operations[0].value, { field: "hours", value: "8" });
  }
  assert.equal(semantic({ type: "executor.setPaymentQuantity", field: "hours", value: 2 }), null);
});

test("local hard scopes pin resolution and strict validation rejects outside targets", () => {
  const current = project();
  current.stages.push({ id: "s2", name: "Продакшн", presetKey: "custom", tasks: [{ id: "t2", name: "Концепт", executors: [executor("e3", "Анна", "hourly")] }] });
  const scope = { kind: "executor", projectId: "p", stageId: "s2", taskId: "t2", executorId: "e3" };
  assert.equal(resolveProjectTarget("Поставь Анне 10 часов", current, null, scope).target.id, "e3");
  assert.throws(() => compileAiEditSemanticCommand({ semantic: semantic({ type: "executor.setPaymentQuantity", value: 10 }), request: { ...request(), scope }, project: current, resolvedTarget: { kind: "executor", id: "e2" } }), /контекст/i);
});

test("Task scope plus one confirmed Performer compiles to addFromPerformer only", () => {
  const current = project(), performer = { id: "pf-ella", firstName: "Элла", primaryRole: "3D артист", defaultPaymentType: "hourly", defaultRate: "2500", defaultTaxRate: 6, active: true };
  const localRequest = { ...request("сюда добавь Эллу из базы"), scope: { kind: "task", projectId: "p", stageId: "s", taskId: "t" }, knowledge: { useStudioKnowledge: false, selectedSources: [{ kind: "performer", id: performer.id }] }, confirmed: { performerId: performer.id } };
  const parsed = semantic({ type: "executor.createFromPerformer", taskId: "t", performerId: performer.id });
  const diff = compileAiEditSemanticCommand({ semantic: parsed, request: localRequest, project: current, resolvedTask: { id: "t" }, performer, performers: [performer] });
  assert.deepEqual(diff.operations.map((item) => item.type), ["executor.addFromPerformer"]);
  assert.deepEqual(diff.operations[0].value, { executorId: "new-executor", performerId: performer.id });
  assert.deepEqual(Object.keys(parsed.command).sort(), ["performerId", "taskId", "type"]);
});

test("Task scope short name intent creates an anonymous Executor without invented role", () => {
  const current = project();
  const localRequest = { ...request("добавь Мишу"), scope: { kind: "task", projectId: "p", stageId: "s", taskId: "t" } };
  const parsed = semantic({ type: "executor.createAnonymous", name: "Миша" });
  assert.ok(parsed);
  const diff = compileAiEditSemanticCommand({ semantic: parsed, request: localRequest, project: current, resolvedTask: { id: "t" } });
  assert.deepEqual(diff.operations.map((item) => item.type), ["executor.addAnonymous", "executor.tag.add"]);
  assert.deepEqual(diff.operations[1].value, { tagId: "tag-2", key: "name", value: "Миша" });
  assert.equal(diff.operations.some((item) => item.type === "executor.tag.update"), false);
  assert.equal(semantic({ type: "executor.createAnonymous" }), null);
  assert.ok(parseAiEditSemanticResponse({ kind: "clarification", question: "Как назвать исполнителя?" }));
});
