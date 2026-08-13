import test from "node:test";
import assert from "node:assert/strict";
import { parseAiIntentRoute, routeAiIntentDeterministically } from "../api/_lib/aiIntentRouter.js";
import { compileGeneratedStructure, parseGeneratedStructure, resolveGeneratedStructure } from "../api/_lib/generatedStructure.js";
import { applyAiEditOperations } from "../src/ai/editOperations.js";
import { normalizeAiEditSemanticPlan, parseAiEditSemanticResponse } from "../src/ai/editSemanticSchema.js";
import { resolveAiEditSemanticDraft } from "../src/ai/editSemanticPlan.js";

const pool = {
  stages: ["stage-new-1", "stage-new-2"], tasks: ["task-new-1", "task-new-2", "task-new-3"],
  executors: ["executor-new-1", "executor-new-2", "executor-new-3"], tags: Array.from({ length: 20 }, (_, index) => `tag-new-${index + 1}`),
};
const request = (scope, instruction = "сделай структуру") => ({ requestId: "request", baseRevision: "revision", scope, instruction, idPool: pool, knowledge: { selectedSources: [], useStudioKnowledge: false } });

test("versioned router separates generation from existing-entity edits and has no replace route", () => {
  assert.equal(routeAiIntentDeterministically("сделай мне смету для CG ролика").kind, "generate_structure");
  assert.equal(routeAiIntentDeterministically("переименуй этап Продакшн").kind, "edit_existing");
  assert.equal(parseAiIntentRoute({ schemaVersion: 1, kind: "replace_project" }), null);
  assert.deepEqual(parseAiIntentRoute({ schemaVersion: 1, kind: "clarification", question: "Создать новую структуру или изменить существующую?" }), { schemaVersion: 1, kind: "clarification", question: "Создать новую структуру или изменить существующую?" });
});

test("generated Project fragment compiles to existing low-level operations and appends after validation", () => {
  const project = { id: "project", stages: [{ id: "old-stage", name: "Existing", tasks: [] }] };
  const draft = parseGeneratedStructure({ projectName: "Fragment", stages: [{ name: "Setup", tasks: [{ name: "Prepare", cost: 100000 }] }], warnings: [] });
  const resolved = resolveGeneratedStructure({ draft, performers: [] });
  const diff = compileGeneratedStructure({ resolved, request: request({ kind: "project", projectId: "project" }), project, performers: [] });
  assert.deepEqual(diff.operations.map((item) => item.type), ["stage.add", "task.add", "executor.addAnonymous", "executor.payment.setType", "executor.amount.set"]);
  const applied = applyAiEditOperations(project, diff, { performers: [], idPool: pool, instruction: "сделай структуру", selectedSources: [] });
  assert.equal(applied.stages[0].id, "old-stage");
  assert.equal(applied.stages[1].tasks[0].executors[0].amount, "100000");
});

test("local generated fragment uses only the trusted contextual Stage", () => {
  const project = { id: "project", stages: [{ id: "trusted-stage", name: "Trusted", tasks: [] }, { id: "other-stage", name: "Other", tasks: [] }] };
  const draft = parseGeneratedStructure({ projectName: "Fragment", stages: [{ name: "Ignored wrapper", tasks: [{ name: "Local task", cost: 500 }] }], warnings: [] });
  const scope = { kind: "stage", projectId: "project", stageId: "trusted-stage" };
  const diff = compileGeneratedStructure({ resolved: resolveGeneratedStructure({ draft, performers: [] }), request: request(scope), project, performers: [] });
  assert.equal(diff.operations[0].type, "task.add"); assert.equal(diff.operations[0].targetId, "trusted-stage");
  assert.equal(diff.operations.some((item) => item.type === "stage.add"), false);
});

test("generated Performer binding resolves by slot and uses the existing Performer factory operation", () => {
  const project = { id: "project", stages: [] }, performers = [{ id: "m1", firstName: "Миша", lastName: "Иванов", primaryRole: "Продюсер", active: true }];
  const draft = parseGeneratedStructure({ projectName: "P", stages: [{ name: "Production", tasks: [{ name: "Shoot", cost: 1, performerBindings: [{ key: "producer", performerName: "Миша" }] }] }], warnings: [] });
  const resolved = resolveGeneratedStructure({ draft, performers });
  assert.deepEqual(resolved.bindings.map((item) => item.performerId), ["m1"]);
  const diff = compileGeneratedStructure({ resolved, request: request({ kind: "project", projectId: "project" }, "сделай смету, Мишу из базы в Продакшн"), project, performers });
  assert.equal(diff.operations.find((item) => item.type === "executor.addFromPerformer").value.performerId, "m1");
  const applied = applyAiEditOperations(project, diff, { performers, idPool: pool, instruction: "сделай смету, Мишу из базы в Продакшн", selectedSources: [] });
  assert.match(applied.stages[0].tasks[0].executors[0].performerSnapshot.name, /Миша/);
});

test("single semantic command is normalized into the same command-indexed relation resolver", () => {
  const project = { id: "project", stages: [{ id: "s", name: "Stage", tasks: [{ id: "story", name: "Сториборд", executors: [{ id: "only", tags: [{ id: "n", key: "name", value: "Старое имя" }] }] }] }] };
  const parsed = parseAiEditSemanticResponse({ kind: "command", summary: "Rename", command: { type: "executor.setName", taskName: "Сториборд", name: "Сергей" }, warnings: [] });
  const semantic = normalizeAiEditSemanticPlan(parsed), resolved = resolveAiEditSemanticDraft({ semantic, project, scope: { kind: "project", projectId: "project" } });
  assert.equal(semantic.commands.length, 1); assert.equal(resolved.confirmedTargets[0].target.id, "only"); assert.deepEqual(resolved.unresolvedSlots, []);
});
