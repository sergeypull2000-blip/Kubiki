import test from "node:test";
import assert from "node:assert/strict";
import { parseGeneratedStructure, resolveGeneratedStructure, compileGeneratedStructure } from "../api/_lib/generatedStructure.js";
import { routeAiIntentDeterministically } from "../api/_lib/aiIntentRouter.js";
import { stagesFromGeneratedEstimate } from "../src/ai/estimateInsertion.js";

const control = {
  schemaVersion: 2, kind: "generated_structure", generationScope: "whole_project", projectName: "QA", warnings: [],
  stages: [
    { name: "Препродакшн", tasks: [
      { name: "Раскадровка", executors: [{ type: "anonymous_named", name: "Миша", tax: 6 }] },
      { name: "Концепция", executors: [{ type: "anonymous_named", name: "Аня", tax: 6 }] },
    ] },
    { name: "Продакшн", tasks: [
      { name: "Моделинг", executors: [{ type: "anonymous_named", name: "Аня", tax: 6 }] },
      { name: "Свет", executors: [{ type: "anonymous_named", name: "Гриша", tax: 6 }] },
      { name: "Визуализация", executors: [{ type: "anonymous_named", name: "Элла", tax: 6 }] },
    ] },
    { name: "Постпродакшн", tasks: [{ name: "Пост", executors: [{ type: "anonymous_unnamed", count: 2, paymentType: "fix_total", compensation: 300000, tax: 6 }] }] },
  ],
};

test("one v2 fixture preserves executor relations for Initial materialization", () => {
  const parsed = parseGeneratedStructure(control);
  assert.equal(parsed.stages[2].tasks[0].executors.length, 2);
  assert.equal(parsed.stages[0].tasks[0].name, "Раскадровка");
  assert.equal(parsed.stages[0].tasks[0].executors[0].name, "Миша");
  const stages = stagesFromGeneratedEstimate(parsed);
  assert.equal(stages[0].tasks[0].executors[0].tags.find((tag) => tag.key === "name").value, "Миша");
  assert.deepEqual(stages[2].tasks[0].executors.map((item) => item.amount), ["300000", "300000"]);
  assert.deepEqual(stages[2].tasks[0].executors.map((item) => item.tags.find((tag) => tag.key === "tax").value), ["6", "6"]);
});

test("the same v2 fixture compiles through Global generation without semantic CRUD", () => {
  const parsed = parseGeneratedStructure({ ...control, generationScope: "fragment" });
  const project = { id: "p", stages: [] };
  const idPool = {
    stages: Array.from({ length: 6 }, (_, i) => `s${i}`), tasks: Array.from({ length: 20 }, (_, i) => `t${i}`),
    executors: Array.from({ length: 20 }, (_, i) => `e${i}`), tags: Array.from({ length: 60 }, (_, i) => `g${i}`),
  };
  const request = { requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" }, instruction: "Добавь структуру", idPool, knowledge: { selectedSources: [] } };
  const diff = compileGeneratedStructure({ resolved: resolveGeneratedStructure({ draft: parsed, performers: [] }), request, project, performers: [] });
  assert.equal(diff.operations.filter((item) => item.type === "executor.addAnonymous").length, 7);
  assert.equal(diff.operations.filter((item) => item.type === "executor.amount.set").length, 2);
  assert.equal(diff.operations.filter((item) => item.type === "executor.tag.add" && item.value.key === "name").length, 5);
  assert.equal(diff.operations.some((item) => item.type.includes("project") || item.type.includes("rename")), false);
});

test("projectName validation depends on generation scope", () => {
  const fragment = { ...control, generationScope: "fragment" };
  delete fragment.projectName;
  assert.equal(Object.hasOwn(parseGeneratedStructure(fragment), "projectName"), false);
  for (const projectName of ["", " ", "x".repeat(161), { unsafe: true }]) {
    const parsed = parseGeneratedStructure({ ...fragment, projectName });
    assert.ok(parsed); assert.equal(Object.hasOwn(parsed, "projectName"), false);
  }
  assert.equal(parseGeneratedStructure(control).projectName, "QA");
  assert.equal(parseGeneratedStructure({ ...control, projectName: "" }), null);
  assert.equal(parseGeneratedStructure({ ...control, projectName: "x".repeat(161) }), null);
});

test("custom GeneratedStructure role has identical Initial and Global semantics", () => {
  const fixture = {
    schemaVersion: 2, kind: "generated_structure", generationScope: "fragment", projectName: "P", warnings: [],
    stages: [{ name: "S", tasks: [{ name: "T", executors: [{ type: "anonymous_named", name: "Миша", role: "Раскадровщик" }, { type: "anonymous_unnamed" }] }] }],
  };
  const parsed = parseGeneratedStructure(fixture);
  const initial = stagesFromGeneratedEstimate(parsed);
  assert.equal(initial[0].tasks[0].executors[0].tags.find((tag) => tag.key === "role").value, "Раскадровщик");
  assert.equal(initial[0].tasks[0].executors[1].tags.some((tag) => tag.key === "role"), false);

  const request = { requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" }, instruction: "Создать структуру", knowledge: { selectedSources: [] }, idPool: {
    stages: ["s"], tasks: ["t"], executors: ["e1", "e2"], tags: Array.from({ length: 8 }, (_, index) => `g${index}`),
  } };
  const global = compileGeneratedStructure({ resolved: resolveGeneratedStructure({ draft: parsed, performers: [] }), request, project: { id: "p", stages: [] }, performers: [] });
  assert.equal(global.operations.find((operation) => operation.type === "executor.tag.update").value.value, "Раскадровщик");
  assert.equal(global.operations.filter((operation) => operation.type === "executor.addFromPerformer").length, 0);
});

test("Performer binding and ordinary Executor coexist and unsafe model fields are rejected", () => {
  const mixed = { schemaVersion: 2, kind: "generated_structure", generationScope: "fragment", projectName: "P", warnings: [], stages: [{ name: "S", tasks: [{ name: "T", executors: [
    { type: "performer_binding", key: "m", performerName: "Миша" }, { type: "anonymous_named", name: "Аня", compensation: 1000 },
  ] }] }] };
  const performers = [{ id: "pf", firstName: "Миша", lastName: "Иванов", primaryRole: "Продюсер", active: true }];
  const parsed = parseGeneratedStructure(mixed), resolved = resolveGeneratedStructure({ draft: parsed, performers });
  assert.equal(resolved.bindings[0].performerId, "pf");
  const request = { requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" }, instruction: "Добавь Мишу из базы и Аню", knowledge: { selectedSources: [] }, idPool: {
    stages: ["s"], tasks: ["t"], executors: ["e1", "e2"], tags: Array.from({ length: 10 }, (_, index) => `g${index}`),
  } };
  const diff = compileGeneratedStructure({ resolved, request, project: { id: "p", stages: [] }, performers });
  assert.equal(diff.operations.some((item) => item.type === "executor.addFromPerformer"), true);
  assert.equal(diff.operations.some((item) => item.type === "executor.addAnonymous"), true);
  assert.equal(diff.operations.some((item) => item.type === "executor.amount.set"), true);
  assert.equal(parseGeneratedStructure({ ...mixed, stages: [{ name: "S", tasks: [{ name: "T", executors: [{ type: "performer_binding", key: "m", performerName: "Миша", performerId: "pf" }] }] }] }), null);
  assert.equal(parseGeneratedStructure({ ...mixed, operations: [] }), null);
});

test("strict v2 parser accepts the production anonymous_named shape", () => {
  const productionShape = {
    schemaVersion: 2, kind: "generated_structure", generationScope: "fragment", projectName: "P", warnings: [],
    stages: [{ name: "S", tasks: [{ name: "T", executors: [{
      type: "anonymous_named", name: "Person", role: "Artist", paymentType: "fix_total",
      compensation: 300000, quantity: 1, tax: 6,
    }] }] }],
  };
  const parsed = parseGeneratedStructure(productionShape);
  assert.equal(parsed.stages[0].tasks[0].executors[0].type, "anonymous_named");
  assert.equal(parsed.stages[0].tasks[0].executors[0].quantity, 1);
});

test("GeneratedStructure payment semantics match between Initial and Global", () => {
  const fixture = {
    schemaVersion: 2, kind: "generated_structure", generationScope: "fragment", projectName: "P", warnings: [],
    stages: [{ name: "S", tasks: [{ name: "T", executors: [
      { type: "anonymous_named", name: "Fixed", paymentType: "fix_total", compensation: 100000, quantity: 1 },
      { type: "anonymous_named", name: "Shift", paymentType: "shift", compensation: 5000, quantity: 3 },
    ] }] }],
  };
  const parsed = parseGeneratedStructure(fixture), initial = stagesFromGeneratedEstimate(parsed);
  const fixedInitial = initial[0].tasks[0].executors[0], shiftInitial = initial[0].tasks[0].executors[1];
  assert.equal(fixedInitial.amount, "100000");
  assert.deepEqual(fixedInitial.tags.find((tag) => tag.key === "payment").payment, { type: "fix_total", rate: "", units: "", hours: "", shifts: "" });
  assert.deepEqual(shiftInitial.tags.find((tag) => tag.key === "payment").payment, { type: "shift", rate: "5000", units: "", hours: "", shifts: "3" });

  const request = { requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" }, instruction: "Create", knowledge: { selectedSources: [] }, idPool: {
    stages: ["s"], tasks: ["t"], executors: ["e1", "e2"], tags: Array.from({ length: 8 }, (_, index) => `g${index}`),
  } };
  const global = compileGeneratedStructure({ resolved: resolveGeneratedStructure({ draft: parsed, performers: [] }), request, project: { id: "p", stages: [] }, performers: [] });
  const fixedOperations = global.operations.filter((operation) => operation.targetId === "e1");
  const shiftOperations = global.operations.filter((operation) => operation.targetId === "e2");
  assert.equal(fixedOperations.some((operation) => operation.type === "executor.amount.set" && operation.value.value === "100000"), true);
  assert.equal(fixedOperations.some((operation) => operation.type === "executor.payment.setQuantity"), false);
  assert.equal(shiftOperations.some((operation) => operation.type === "executor.payment.setRate" && operation.value.value === "5000"), true);
  assert.equal(shiftOperations.some((operation) => operation.type === "executor.payment.setQuantity" && operation.value.field === "shifts" && operation.value.value === "3"), true);
});

test("ExecutorDraft branches retain strict field boundaries and can be mixed", () => {
  const fixture = (executors) => ({
    schemaVersion: 2, kind: "generated_structure", generationScope: "fragment", projectName: "P", warnings: [],
    stages: [{ name: "S", tasks: [{ name: "T", executors }] }],
  });
  assert.equal(parseGeneratedStructure(fixture([{ type: "anonymous_named", name: "A", unexpected: true }])), null);
  assert.equal(parseGeneratedStructure(fixture([{ type: "anonymous_unnamed", name: "A" }])), null);
  assert.equal(parseGeneratedStructure(fixture([{ type: "performer_binding", key: "a", performerName: "A", performerId: "unsafe" }])), null);

  const mixed = parseGeneratedStructure(fixture([
    { type: "anonymous_named", name: "A", paymentType: "fix_total", quantity: 1 },
    { type: "anonymous_unnamed", compensation: 100, tax: 6 },
    { type: "performer_binding", key: "b", performerName: "B" },
  ]));
  assert.deepEqual(mixed.stages[0].tasks[0].executors.map((executor) => executor.type), ["anonymous_named", "anonymous_unnamed", "performer_binding"]);
});

test("router keeps atomic Stage edit but sends hierarchical creation to generation", () => {
  assert.equal(routeAiIntentDeterministically("Добавь этап Пост").kind, "edit_existing");
  assert.equal(routeAiIntentDeterministically("Добавь этап Продакшн: Аня моделит, Гриша делает свет, Элла визуализацию.").kind, "generate_structure");
  assert.equal(routeAiIntentDeterministically("Добавь этап Продакшн с моделингом, светом и рендером").kind, "generate_structure");
  assert.equal(routeAiIntentDeterministically("Добавь этап Съёмка, оператор снимает, режиссёр контролирует, продюсер координирует").kind, "generate_structure");
  assert.equal(routeAiIntentDeterministically("Добавь этап Продакшн с задачами моделинг и свет; Аня моделит, Гриша делает свет").kind, "generate_structure");
});
