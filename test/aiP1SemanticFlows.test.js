import test from "node:test";
import assert from "node:assert/strict";
import { routeAiIntentDeterministically } from "../api/_lib/aiIntentRouter.js";
import { diagnoseAiEditSemanticStructure, parseAiEditSemanticResponse, normalizeAiEditSemanticPlan } from "../src/ai/editSemanticSchema.js";
import { materializeResolvedSemanticPlan, resolveAiEditSemanticDraft } from "../src/ai/editSemanticPlan.js";
import { compileAiEditSemanticPlan } from "../src/ai/editSemanticCompiler.js";

const project = {
  id: "project",
  stages: [
    { id: "stage-pre", name: "Препродакшн", tasks: [{ id: "task-board", name: "Раскадровка", executors: [] }, { id: "task-concept", name: "Концепция", executors: [] }] },
    { id: "stage-prod", name: "Продакшн", tasks: [{ id: "task-light", name: "Свет", executors: [] }] },
    { id: "stage-post", name: "Постпродакшн", tasks: [{ id: "task-post", name: "Композ", executors: [] }] },
  ],
};
const projectScope = { kind: "project", projectId: "project" };
const taskScope = { kind: "task", projectId: "project", stageId: "stage-prod", taskId: "task-light" };
const stageScope = { kind: "stage", projectId: "project", stageId: "stage-pre" };
const idPool = {
  stages: Array.from({ length: 6 }, (_, i) => `stage-new-${i}`),
  tasks: Array.from({ length: 30 }, (_, i) => `task-new-${i}`),
  executors: Array.from({ length: 40 }, (_, i) => `executor-new-${i}`),
  tags: Array.from({ length: 200 }, (_, i) => `tag-new-${i}`),
};
const request = (scope, instruction) => ({ requestId: "request", baseRevision: "revision", scope, instruction, idPool, knowledge: { selectedSources: [], useStudioKnowledge: false } });
const plan = (commands) => parseAiEditSemanticResponse({ kind: "commands", summary: "Изменить смету", commands, warnings: [] });

test("named Executor creation routes to edit and asks only for missing global destination", () => {
  assert.equal(routeAiIntentDeterministically("добавь Мишу").kind, "edit_existing");
  const semantic = plan([{ type: "executor.createAnonymous", name: "Миша" }]);
  const global = resolveAiEditSemanticDraft({ semantic, project, scope: projectScope, instruction: "добавь Мишу" });
  assert.equal(global.unresolvedSlots.length, 1);
  assert.equal(global.unresolvedSlots[0].kind, "task");
  assert.equal(global.unresolvedSlots[0].question, "Куда добавить Мишу?");
  assert.deepEqual(global.unresolvedSlots[0].choices.map((item) => item.label), ["Препродакшн / Раскадровка", "Препродакшн / Концепция", "Продакшн / Свет", "Постпродакшн / Композ"]);

  const local = resolveAiEditSemanticDraft({ semantic, project, scope: taskScope, instruction: "добавь Мишу" });
  assert.deepEqual(local.unresolvedSlots, []);
  assert.equal(local.confirmedTargets[0].task.id, "task-light");
});

test("Stage destination rules auto-resolve one Task and clarify only destination for many", () => {
  const semantic = plan([{ type: "executor.createAnonymous", name: "Миша" }]);
  const many = resolveAiEditSemanticDraft({ semantic, project, scope: stageScope, instruction: "добавь Мишу" });
  assert.equal(many.unresolvedSlots[0].question, "В какую задачу добавить Мишу?");
  assert.deepEqual(many.unresolvedSlots[0].choices.map((item) => item.source.id), ["task-board", "task-concept"]);
  const oneScope = { kind: "stage", projectId: "project", stageId: "stage-prod" };
  const one = resolveAiEditSemanticDraft({ semantic, project, scope: oneScope, instruction: "добавь Мишу" });
  assert.equal(one.confirmedTargets[0].task.id, "task-light");
});

test("explicit Performer creation is supported and missing destination is its only clarification", () => {
  assert.equal(routeAiIntentDeterministically("добавь Мишу из базы").kind, "edit_existing");
  const performer = { id: "misha", firstName: "Миша", active: true };
  const semantic = plan([{ type: "executor.createFromPerformer", performerName: "Миша" }]);
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: projectScope, performers: [performer], instruction: "добавь Мишу из базы" });
  assert.equal(resolved.unresolvedSlots.length, 1);
  assert.equal(resolved.unresolvedSlots[0].kind, "task");
  assert.equal(resolved.unresolvedSlots[0].question, "Куда добавить Мишу?");
});

test("exact Performer matches retain every duplicate and continuation preserves resolved Task", () => {
  const performers = [
    { id: "misha-1", firstName: "Миша", lastName: "Иванов", primaryRole: "Light" },
    { id: "misha-2", firstName: "Миша", lastName: "Иванов", primaryRole: "Comp" },
  ];
  const semantic = plan([{ type: "executor.createFromPerformer", performerId: "misha-1", performerName: "Миша Иванов", taskName: "Свет" }]);
  const pending = resolveAiEditSemanticDraft({ semantic, project, scope: projectScope, performers, instruction: "добавь Мишу Иванова из базы в задачу Свет" });
  assert.equal(pending.unresolvedSlots[0].kind, "performer");
  assert.deepEqual(pending.unresolvedSlots[0].choices.map((item) => item.source.id), ["misha-1", "misha-2"]);
  assert.equal(pending.confirmedTargets[0].task.id, "task-light");

  const continued = resolveAiEditSemanticDraft({ semantic, project, scope: projectScope, performers, instruction: "добавь Мишу Иванова из базы в задачу Свет", prior: pending, selectedSource: { kind: "performer", id: "misha-2" } });
  assert.deepEqual(continued.unresolvedSlots, []);
  assert.equal(continued.confirmedTargets[0].task.id, "task-light");
  assert.equal(continued.slotValues["slot-0-performer"], "misha-2");
});

test("only a user-confirmed Performer id can bypass exact-name ambiguity", () => {
  const performers = [{ id: "m1", firstName: "Миша" }, { id: "m2", firstName: "Миша" }];
  const semantic = plan([{ type: "executor.createFromPerformer", performerId: "m1", performerName: "Миша", taskName: "Свет" }]);
  const untrusted = resolveAiEditSemanticDraft({ semantic, project, scope: projectScope, performers, instruction: "добавь Мишу из базы в задачу Свет" });
  assert.equal(untrusted.unresolvedSlots[0].kind, "performer");
  const confirmed = resolveAiEditSemanticDraft({ semantic, project, scope: projectScope, performers, instruction: "добавь Мишу из базы в задачу Свет", confirmedPerformerIds: ["m1"] });
  assert.deepEqual(confirmed.unresolvedSlots, []);
  assert.equal(confirmed.slotValues["slot-0-performer"], "m1");
  assert.equal(confirmed.confirmedTargets[0].task.id, "task-light");
});

test("one exact Performer auto-resolves and anonymous names never require the Library", () => {
  const performer = { id: "grisha", firstName: "Гриша", active: true };
  const library = plan([{ type: "executor.createFromPerformer", performerName: "Гриша", taskName: "Свет" }]);
  const resolved = resolveAiEditSemanticDraft({ semantic: library, project, scope: projectScope, performers: [performer], instruction: "добавь Гришу из базы в Свет" });
  assert.deepEqual(resolved.unresolvedSlots, []);
  assert.equal(resolved.slotValues["slot-0-performer"], "grisha");
  const anonymous = plan([{ type: "executor.createAnonymous", name: "Аня", taskName: "Свет" }]);
  const ordinary = resolveAiEditSemanticDraft({ semantic: anonymous, project, scope: projectScope, performers: [{ id: "anya", firstName: "Аня" }], instruction: "Аня делает свет" });
  assert.deepEqual(ordinary.unresolvedSlots, []);
  assert.equal(ordinary.confirmedTargets[0].task.id, "task-light");
});

test("external semantic DTO normalization accepts safe equivalents then enforces strict commands", () => {
  const stageRaw = { semantic: { schemaVersion: 1, kind: "command", summary: "Добавить этап", command: { type: "stage.create", name: "Пост", reason: "requested" }, confidence: 0.99 } };
  const stage = normalizeAiEditSemanticPlan(parseAiEditSemanticResponse(stageRaw));
  assert.deepEqual(stage.commands, [{ type: "stage.create", name: "Пост" }]);

  const taskRaw = { kind: "commands", summary: "Добавить задачу", plan: [{ type: "task.create", name: "Герой", description: "requested" }] };
  const task = parseAiEditSemanticResponse(taskRaw);
  assert.deepEqual(task.commands, [{ type: "task.create", name: "Герой" }]);
  const local = resolveAiEditSemanticDraft({ semantic: task, project, scope: stageScope, instruction: "добавь новую задачу Герой" });
  assert.equal(local.confirmedTargets[0].stage.id, "stage-pre");

  assert.equal(parseAiEditSemanticResponse({ kind: "commands", summary: "bad", commands: [{ type: "project.patch", path: "stages" }] }), null);
  assert.equal(parseAiEditSemanticResponse({ kind: "commands", summary: "bad", commands: [{ type: "stage.create", arbitrary: true }] }), null);
  assert.equal(parseAiEditSemanticResponse({ semantic: stageRaw.semantic, operations: [{ type: "project.patch" }] }), null);
});

test("large typed multi-command plan compiles atomically with new Executors included in final bulk tax", () => {
  const commands = [
    { type: "stage.create", ref: "new-stage-1", name: "Препродакшн 2" },
    { type: "task.create", ref: "new-task-1", stageRef: "new-stage-1", name: "Раскадровка" },
    { type: "executor.createAnonymous", ref: "new-executor-1", taskRef: "new-task-1", name: "Миша" },
    { type: "task.create", ref: "new-task-2", stageRef: "new-stage-1", name: "Концепция" },
    { type: "executor.createAnonymous", ref: "new-executor-2", taskRef: "new-task-2", name: "Аня" },
    { type: "stage.create", ref: "new-stage-2", name: "Продакшн 2" },
    { type: "task.create", ref: "new-task-3", stageRef: "new-stage-2", name: "Моделинг" },
    { type: "executor.createAnonymous", ref: "new-executor-3", taskRef: "new-task-3", name: "Аня" },
    { type: "task.create", ref: "new-task-4", stageRef: "new-stage-2", name: "Свет" },
    { type: "executor.createAnonymous", ref: "new-executor-4", taskRef: "new-task-4", name: "Гриша" },
    { type: "task.create", ref: "new-task-5", stageRef: "new-stage-2", name: "Визуализация" },
    { type: "executor.createAnonymous", ref: "new-executor-5", taskRef: "new-task-5", name: "Элла" },
    { type: "executor.createAnonymous", taskName: "Композ", compensation: 300000 },
    { type: "executor.createAnonymous", taskName: "Композ", compensation: 300000 },
    { type: "executor.setTaxBulk", percent: 6 },
  ];
  const semantic = parseAiEditSemanticResponse({ kind: "commands", summary: "Большой план", commands, warnings: [] });
  assert.ok(semantic);
  const instruction = "Добавь этапы и обычных named Executors. В Постпродакшн добавь двух новых исполнителей без имени по 300к каждому. Всем исполнителям налог 6%.";
  const resolved = resolveAiEditSemanticDraft({ semantic, project, scope: projectScope, performers: [{ id: "library-anya", firstName: "Аня" }], instruction });
  assert.deepEqual(resolved.unresolvedSlots, []);
  const materialized = materializeResolvedSemanticPlan(resolved);
  assert.equal(materialized.commands.filter((item) => item.type === "executor.createFromPerformer").length, 0);
  const diff = compileAiEditSemanticPlan({ semantic: materialized, request: request(projectScope, instruction), project, confirmedTargets: resolved.confirmedTargets });
  assert.ok(diff.operations.length > commands.length);
  const createdExecutorIds = diff.operations.filter((item) => ["executor.addAnonymous", "executor.addFromPerformer"].includes(item.type)).map((item) => item.value.executorId);
  const taxedIds = new Set(diff.operations.filter((item) => item.type === "executor.tag.add" || item.type === "executor.tag.update").map((item) => item.targetId));
  assert.ok(createdExecutorIds.length >= 7);
  assert.ok(createdExecutorIds.every((id) => taxedIds.has(id)));
});

test("bounded anonymous Executor multiplicity normalizes into repeated typed commands", () => {
  const raw = { kind: "commands", summary: "Два исполнителя", commands: [
    { type: "executor.createAnonymous", taskName: "Композ", compensation: 300000, count: 2 },
    { type: "executor.setTaxBulk", percent: 6 },
  ], warnings: [] };
  const semantic = parseAiEditSemanticResponse(raw);
  assert.ok(semantic);
  assert.equal(semantic.commands.length, 3);
  assert.deepEqual(semantic.commands.slice(0, 2).map(({ type, taskName, compensation }) => ({ type, taskName, compensation })), [
    { type: "executor.createAnonymous", taskName: "Композ", compensation: 300000 },
    { type: "executor.createAnonymous", taskName: "Композ", compensation: 300000 },
  ]);
  assert.equal(parseAiEditSemanticResponse({ ...raw, commands: [{ ...raw.commands[0], count: 11 }] }), null);
});

test("schema rejection diagnostic contains structure and paths but no field values", () => {
  const diagnostic = diagnoseAiEditSemanticStructure({ kind: "commands", summary: "private summary", commands: [
    { type: "executor.createAnonymous", name: "Private Name", taskName: "Private Task", unexpectedField: "secret-value" },
  ], warnings: [] });
  assert.equal(diagnostic.topLevelType, "object");
  assert.deepEqual(diagnostic.topLevelKeys, ["commands", "kind", "summary", "warnings"]);
  assert.deepEqual(diagnostic.commandTypes, ["executor.createAnonymous"]);
  assert.deepEqual(diagnostic.rejectedCommand.unknownKeys, ["unexpectedField"]);
  assert.equal(diagnostic.validationPath, "$.commands[0]");
  assert.equal(diagnostic.reason, "unknown_command_keys");
  const serialized = JSON.stringify(diagnostic);
  assert.doesNotMatch(serialized, /Private Name|Private Task|secret-value|private summary/);
});
