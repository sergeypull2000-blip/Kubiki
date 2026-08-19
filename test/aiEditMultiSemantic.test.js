import test from "node:test";
import assert from "node:assert/strict";
import { parseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { compileAiEditSemanticPlan } from "../src/ai/editSemanticCompiler.js";
import { applyAiEditOperations } from "../src/ai/editOperations.js";
import { materializeResolvedSemanticPlan, resolveAiEditSemanticDraft } from "../src/ai/editSemanticPlan.js";
import { signAiEditContinuation, verifyAiEditContinuation } from "../api/_lib/semanticContinuation.js";
import { validateAiEditRequest } from "../src/ai/editSchema.js";
import { buildAiEditPreview } from "../src/ai/editPreview.js";
import { sheetRevision } from "../src/ai/projectRevision.js";

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
    { type: "executor.createAnonymous", taskRef: "new-task-6", role: "Композитор", compensation: "300к" },
    { type: "executor.createAnonymous", taskRef: "new-task-6", role: "Композитор", compensation: "300к" },
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
    { type: "executor.createAnonymous", taskRef: "new-task-1", role: "Композитор", compensation: 300000 },
    { type: "executor.createAnonymous", taskRef: "new-task-1", role: "Композитор", compensation: 300000 },
  ] });
  const original = JSON.stringify(semantic);
  const pending = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope });
  assert.equal(pending.unresolvedSlots.length, 1);
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, prior: pending, answer: "Композитинг" });
  assert.equal(resolved.unresolvedSlots.length, 0);
  assert.equal(JSON.stringify(semantic), original);
  assert.equal(materializeResolvedSemanticPlan(resolved).commands[0].name, "Композитинг");
});

test("arbitrary Task name clarification is materialized literally", () => {
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Создать задачу", warnings: [], commands: [{ type: "task.create", ref: "new-task-1", stageName: "Постпродакшн" }] });
  const pending = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope });
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, prior: pending, answer: "лох" });
  assert.equal(materializeResolvedSemanticPlan(resolved).commands[0].name, "лох");
});

test("Performer confirmations are isolated per creation command", () => {
  const instruction = "добавь Мишу из базы и Эллу из базы";
  const performers = [
    { id: "m1", firstName: "Миша", lastName: "Иванов", primaryRole: "Композитор" },
    { id: "m2", firstName: "Миша", lastName: "Петров", primaryRole: "3D артист" },
    { id: "ella", firstName: "Элла", lastName: "Смирнова", primaryRole: "Арт-директор" },
  ];
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Добавить двух Performer", warnings: [], commands: [
    { type: "executor.createFromPerformer", taskId: "old-task", performerName: "Миша" },
    { type: "executor.createFromPerformer", taskId: "old-task", performerName: "Элла" },
  ] });
  const pending = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, performers, instruction });
  assert.equal(pending.unresolvedSlots.length, 1); assert.equal(pending.unresolvedSlots[0].commandIndex, 0);
  assert.deepEqual(pending.unresolvedSlots[0].choices.map((item) => item.source.id), ["m1", "m2"]);
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, performers, instruction, prior: pending, selectedSource: { kind: "performer", id: "m2" } });
  assert.deepEqual(resolved.unresolvedSlots, []);
  const commands = materializeResolvedSemanticPlan(resolved).commands;
  assert.equal(commands[0].performerId, "m2"); assert.equal(commands[1].performerId, "ella");
});

test("Performer explicit provenance is not inherited from a neighboring command", () => {
  const performers = [{ id: "m", firstName: "Миша" }, { id: "e", firstName: "Элла" }];
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Два Performer", warnings: [], commands: [
    { type: "executor.createFromPerformer", taskId: "old-task", performerName: "Миша" },
    { type: "executor.createFromPerformer", taskId: "old-task", performerName: "Элла" },
  ] });
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: request.scope, performers, instruction: "Миша из базы в старую задачу, Элла в старую задачу" });
  assert.deepEqual(materializeResolvedSemanticPlan(resolved).commands.map((command) => command.performerExplicit), [true, false]);
});

test("full Performer continuation preserves exact Task destinations through preview and apply", async () => {
  const previous = process.env.AI_EDIT_CONTINUATION_SECRET; process.env.AI_EDIT_CONTINUATION_SECRET = "test-secret";
  try {
    const current = { id: "project", stages: [{ id: "stage", name: "Этап", tasks: [{ id: "hero", name: "герой", executors: [] }, { id: "loh", name: "лох", executors: [] }] }] };
    const performers = [{ id: "misha", firstName: "Миша", lastName: "Иванов", active: true }, { id: "ella-1", firstName: "Элла", lastName: "Первая", active: true }, { id: "ella-2", firstName: "Элла", lastName: "Вторая", active: true }];
    const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Добавить Performer", warnings: [], commands: [
      { type: "executor.createFromPerformer", taskName: "герой", performerName: "Миша" },
      { type: "executor.createFromPerformer", taskName: "лох", performerName: "Элла" },
    ] });
    const instruction = "Миша из базы в герой, Элла из базы в лох";
    const first = resolveAiEditSemanticDraft({ semantic, project: current, scope: request.scope, performers, instruction });
    assert.deepEqual(first.confirmedTargets, { 0: { task: { kind: "task", id: "hero" } }, 1: { task: { kind: "task", id: "loh" } } });
    assert.deepEqual(first.unresolvedSlots.map((slot) => slot.id), ["slot-1-performer"]);
    const token = signAiEditContinuation({ projectId: "project", baseRevision: "revision", scope: request.scope, semantic, unresolvedSlots: first.unresolvedSlots, confirmedTargets: first.confirmedTargets, slotValues: first.slotValues });
    const continuationRequest = { ...request, continuation: { token, source: { kind: "performer", id: "ella-2" } } };
    assert.equal(validateAiEditRequest(continuationRequest).ok, true);
    const restored = verifyAiEditContinuation(token), second = resolveAiEditSemanticDraft({ semantic: restored.semantic, project: current, scope: request.scope, performers, instruction, prior: restored, selectedSource: continuationRequest.continuation.source });
    assert.deepEqual(second.unresolvedSlots, []);
    assert.deepEqual(second.confirmedTargets, first.confirmedTargets);
    const materialized = materializeResolvedSemanticPlan(second);
    assert.deepEqual(materialized.commands.map((command) => command.performerExplicit), [true, true]);
    assert.deepEqual(materialized.commands.map((command) => [command.taskName, command.performerId]), [["герой", "misha"], ["лох", "ella-2"]]);
    const revision = await sheetRevision(current), editRequest = { ...request, baseRevision: revision, instruction };
    const diff = compileAiEditSemanticPlan({ semantic: materialized, request: editRequest, project: current, confirmedTargets: second.confirmedTargets, performers });
    assert.deepEqual(diff.operations.map((operation) => [operation.targetId, operation.value.performerId]), [["hero", "misha"], ["loh", "ella-2"]]);
    const preview = await buildAiEditPreview({ project: current, response: diff, performers, idPool, expectedRevision: revision, instruction: editRequest.instruction });
    assert.equal(preview.after.executors, 2);
    const applied = applyAiEditOperations(current, diff, { performers, idPool, instruction: editRequest.instruction });
    assert.equal(applied.stages[0].tasks[0].executors[0].performerId, "misha"); assert.equal(applied.stages[0].tasks[1].executors[0].performerId, "ella-2");
  } finally { if (previous === undefined) delete process.env.AI_EDIT_CONTINUATION_SECRET; else process.env.AI_EDIT_CONTINUATION_SECRET = previous; }
});

test("continuation token survives two independent Performer ambiguities", () => {
  const previous = process.env.AI_EDIT_CONTINUATION_SECRET; process.env.AI_EDIT_CONTINUATION_SECRET = "test-secret";
  try {
    const current = { id: "project", stages: [{ id: "stage", name: "Этап", tasks: [{ id: "hero", name: "герой", executors: [] }, { id: "loh", name: "лох", executors: [] }] }] };
    const performers = [{ id: "m1", firstName: "Миша" }, { id: "m2", firstName: "Миша" }, { id: "e1", firstName: "Элла" }, { id: "e2", firstName: "Элла" }];
    const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Два Performer", warnings: [], commands: [{ type: "executor.createFromPerformer", taskName: "герой", performerName: "Миша" }, { type: "executor.createFromPerformer", taskName: "лох", performerName: "Элла" }] });
    const instruction = "Миша из базы в герой, Элла из базы в лох";
    const first = resolveAiEditSemanticDraft({ semantic, project: current, scope: request.scope, performers, instruction });
    assert.deepEqual(first.unresolvedSlots.map((slot) => slot.id), ["slot-0-performer", "slot-1-performer"]);
    const token1 = signAiEditContinuation({ semantic, unresolvedSlots: first.unresolvedSlots, confirmedTargets: first.confirmedTargets, slotValues: first.slotValues });
    const second = resolveAiEditSemanticDraft({ semantic, project: current, scope: request.scope, performers, instruction, prior: verifyAiEditContinuation(token1), selectedSource: { kind: "performer", id: "m2" } });
    assert.deepEqual(second.unresolvedSlots.map((slot) => slot.id), ["slot-1-performer"]);
    const token2 = signAiEditContinuation({ semantic, unresolvedSlots: second.unresolvedSlots, confirmedTargets: second.confirmedTargets, slotValues: second.slotValues });
    const third = resolveAiEditSemanticDraft({ semantic, project: current, scope: request.scope, performers, instruction, prior: verifyAiEditContinuation(token2), selectedSource: { kind: "performer", id: "e1" } });
    assert.deepEqual(third.unresolvedSlots, []); assert.deepEqual(third.confirmedTargets, first.confirmedTargets);
    const materialized = materializeResolvedSemanticPlan(third);
    assert.deepEqual(materialized.commands.map((command) => command.performerId), ["m2", "e1"]);
    assert.deepEqual(materialized.commands.map((command) => command.performerExplicit), [true, true]);
  } finally { if (previous === undefined) delete process.env.AI_EDIT_CONTINUATION_SECRET; else process.env.AI_EDIT_CONTINUATION_SECRET = previous; }
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

test("multi-command plan can add a confirmed Performer from the library", () => {
  const performer = { id: "pf-ella", firstName: "Элла", primaryRole: "3D артист", defaultPaymentType: "fix_total", defaultRate: "90000", active: true };
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Добавить из базы и обновить налог", warnings: [], commands: [
    { type: "executor.createFromPerformer", taskId: "old-task", performerId: performer.id },
    { type: "executor.setTaxBulk", percent: 6 },
  ] });
  const libraryRequest = { ...request, instruction: "Добавь Эллу из базы и поставь всем налог 6%", knowledge: { useStudioKnowledge: false, selectedSources: [{ kind: "performer", id: performer.id }] }, confirmed: { performerId: performer.id } };
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: libraryRequest.scope, performers: [performer], instruction: libraryRequest.instruction });
  assert.deepEqual(resolved.unresolvedSlots, []);
  const materialized = materializeResolvedSemanticPlan(resolved);
  assert.equal(materialized.commands[0].performerExplicit, true);
  const diff = compileAiEditSemanticPlan({ semantic: materialized, request: libraryRequest, project, confirmedTargets: resolved.confirmedTargets, performer, performers: [performer] });
  assert.equal(diff.operations[0].type, "executor.addFromPerformer");
  const next = applyAiEditOperations(project, diff, { performers: [performer], idPool, instruction: libraryRequest.instruction, selectedSources: libraryRequest.knowledge.selectedSources });
  assert.equal(next.stages[0].tasks[0].executors.at(-1).performerId, performer.id);
});

test("local contextual creation resolves parents only from trusted anchor ancestry", () => {
  const current = { id: "project", stages: [
    { id: "stage-a", name: "A", tasks: [{ id: "task-a", name: "Раскадровка", executors: [{ id: "executor-a", tags: [{ id: "name-a", key: "name", value: "Свет" }], amount: "0" }] }] },
    { id: "stage-b", name: "B", tasks: [{ id: "task-b", name: "Раскадровка", executors: [{ id: "executor-b", tags: [{ id: "name-b", key: "name", value: "Свет" }], amount: "0" }] }] },
  ] };
  const commands = (command) => parseAiEditSemanticResponse({ kind: "commands", summary: "create", warnings: [], commands: [command] });
  const cases = [
    [{ kind: "executor", projectId: "project", stageId: "stage-a", taskId: "task-a", executorId: "executor-a" }, { type: "executor.createAnonymous", name: "Новый", taskName: "Раскадровка" }, "task", "task-a"],
    [{ kind: "task", projectId: "project", stageId: "stage-a", taskId: "task-a" }, { type: "executor.createAnonymous", name: "Новый" }, "task", "task-a"],
    [{ kind: "task", projectId: "project", stageId: "stage-a", taskId: "task-a" }, { type: "task.create", name: "Новая" }, "stage", "stage-a"],
    [{ kind: "stage", projectId: "project", stageId: "stage-a" }, { type: "task.create", name: "Новая" }, "stage", "stage-a"],
  ];
  for (const [scope, command, parentKind, parentId] of cases) {
    const semantic = commands(command);
    const resolved = resolveAiEditSemanticDraft({ semantic, project: current, scope });
    assert.deepEqual(resolved.unresolvedSlots, []);
    assert.equal(resolved.confirmedTargets[0][parentKind].id, parentId);
    const diff = compileAiEditSemanticPlan({ semantic, request: { ...request, scope, instruction: "Создай локально" }, project: current, confirmedTargets: resolved.confirmedTargets });
    assert.equal(diff.operations[0].targetId, parentId);
  }

  const stageCreateScope = { kind: "stage", projectId: "project", stageId: "stage-a" };
  const stageDiff = compileAiEditSemanticPlan({ semantic: commands({ type: "stage.create", name: "C" }), request: { ...request, scope: stageCreateScope, instruction: "Создай Stage C" }, project: current });
  assert.equal(stageDiff.operations[0].targetId, "project");
});

test("Stage contextual Executor creation uses sole Task and clarifies zero or many Tasks", () => {
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "create", warnings: [], commands: [{ type: "executor.createAnonymous", name: "Новый" }] });
  const scoped = (tasks) => ({ id: "project", stages: [{ id: "stage", name: "Stage", tasks }] });
  const scope = { kind: "stage", projectId: "project", stageId: "stage" };
  const sole = resolveAiEditSemanticDraft({ semantic, project: scoped([{ id: "only", name: "Only", executors: [] }]), scope });
  assert.equal(sole.confirmedTargets[0].task.id, "only");
  const many = resolveAiEditSemanticDraft({ semantic, project: scoped([{ id: "one", name: "One", executors: [] }, { id: "two", name: "Two", executors: [] }]), scope });
  assert.deepEqual(many.unresolvedSlots[0].choices.map((item) => item.source.id), ["one", "two"]);
  const none = resolveAiEditSemanticDraft({ semantic, project: scoped([]), scope });
  assert.match(none.unresolvedSlots[0].question, /нет Task/);
});

test("Stage contextual parent stays trusted through compiler validation", () => {
  const scope = { kind: "stage", projectId: "project", stageId: "stage-a" };
  const current = { id: "project", stages: [
    { id: "stage-a", name: "A", tasks: [{ id: "task-a", name: "Only", executors: [{ id: "executor-a", amount: "0", tags: [] }] }] },
    { id: "stage-b", name: "B", tasks: [{ id: "task-b", name: "Other", executors: [] }] },
  ] };
  const commands = (command) => parseAiEditSemanticResponse({ kind: "commands", summary: "create", warnings: [], commands: [command] });
  const localRequest = { ...request, scope, instruction: "добавь Мишу" };

  const anonymous = commands({ type: "executor.createAnonymous", name: "Миша" });
  const anonymousResolved = resolveAiEditSemanticDraft({ semantic: anonymous, project: current, scope });
  const anonymousDiff = compileAiEditSemanticPlan({ semantic: anonymous, request: localRequest, project: current, confirmedTargets: anonymousResolved.confirmedTargets });
  assert.equal(anonymousDiff.operations[0].targetId, "task-a");
  assert.equal(applyAiEditOperations(current, anonymousDiff, { idPool, instruction: localRequest.instruction }).stages[0].tasks[0].executors.length, 2);

  const performer = { id: "performer-misha", firstName: "Миша", active: true };
  const fromLibrary = commands({ type: "executor.createFromPerformer", performerId: performer.id, performerName: "Миша" });
  const libraryRequest = { ...localRequest, instruction: "добавь Мишу из базы", knowledge: { useStudioKnowledge: false, selectedSources: [{ kind: "performer", id: performer.id }] } };
  const libraryResolved = resolveAiEditSemanticDraft({ semantic: fromLibrary, project: current, scope, performers: [performer], instruction: libraryRequest.instruction });
  const libraryDiff = compileAiEditSemanticPlan({ semantic: materializeResolvedSemanticPlan(libraryResolved), request: libraryRequest, project: current, confirmedTargets: libraryResolved.confirmedTargets, performers: [performer] });
  assert.equal(libraryDiff.operations[0].targetId, "task-a");

  assert.throws(() => compileAiEditSemanticPlan({ semantic: anonymous, request: localRequest, project: current, confirmedTargets: { 0: { task: { kind: "task", id: "task-b" } } } }), (error) => error.code === "ai_compile_target_out_of_scope");
});

test("Stage Task clarification confirms only a parent inside that Stage", () => {
  const scope = { kind: "stage", projectId: "project", stageId: "stage" };
  const current = { id: "project", stages: [{ id: "stage", name: "Stage", tasks: [{ id: "one", name: "One", executors: [] }, { id: "two", name: "Two", executors: [] }] }] };
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "create", warnings: [], commands: [{ type: "executor.createAnonymous", name: "Миша" }] });
  const pending = resolveAiEditSemanticDraft({ semantic, project: current, scope });
  assert.equal(pending.unresolvedSlots[0].kind, "task");
  const confirmed = resolveAiEditSemanticDraft({ semantic, project: current, scope, prior: pending, selectedSource: { kind: "project", id: "two" } });
  assert.equal(confirmed.confirmedTargets[0].task.id, "two");
  const diff = compileAiEditSemanticPlan({ semantic, request: { ...request, scope, instruction: "добавь Мишу" }, project: current, confirmedTargets: confirmed.confirmedTargets });
  assert.equal(diff.operations[0].targetId, "two");
});

test("explicit named edits outside local scope stay out of scope", () => {
  const current = { id: "project", stages: [
    { id: "stage-a", name: "A", tasks: [{ id: "task-a", name: "Раскадровка", executors: [] }] },
    { id: "stage-b", name: "B", tasks: [{ id: "task-b", name: "Свет", executors: [] }] },
  ] };
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "edit", warnings: [], commands: [{ type: "task.rename", targetName: "Свет", name: "Свет 2" }] });
  const resolved = resolveAiEditSemanticDraft({ semantic, project: current, scope: { kind: "task", projectId: "project", stageId: "stage-a", taskId: "task-a" } });
  assert.equal(resolved.confirmedTargets[0], undefined);
  assert.equal(resolved.unresolvedSlots[0].kind, "task");
});
