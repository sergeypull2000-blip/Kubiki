import test from "node:test";
import assert from "node:assert/strict";
import { autoMatchPerformersByRole } from "../api/_lib/roleAutoMatch.js";

const performer = (id, firstName, lastName, primaryRole, additionalRoles = [], active = true) => ({ id, firstName, lastName, primaryRole, additionalRoles, active });
const estimate = (taskName, role) => ({ projectName: "P", stages: [{ name: "S", tasks: [{ name: taskName, executors: [{ type: "anonymous_unnamed", role, paymentType: "fix_total", compensation: 50000 }] }] }], warnings: [] });

test("auto-match is a no-op without flag or performers", () => {
  const input = estimate("Анимация", "Аниматор");
  assert.equal(autoMatchPerformersByRole(input, { performers: [performer("a", "Аня", "Иванова", "Аниматор")], useStudioTemplates: false }), input);
  assert.equal(autoMatchPerformersByRole(input, { performers: [], useStudioTemplates: true }), input);
  assert.equal(autoMatchPerformersByRole(null, { performers: [performer("a", "Аня", "Иванова", "Аниматор")], useStudioTemplates: true }), null);
});

test("auto-match converts an anonymous executor to a performer_binding by exact primary role", () => {
  const out = autoMatchPerformersByRole(estimate("Анимация", "Аниматор"), { performers: [performer("a", "Аня", "Иванова", "Аниматор")], useStudioTemplates: true });
  const executor = out.stages[0].tasks[0].executors[0];
  assert.equal(executor.type, "performer_binding");
  assert.equal(executor.performerName, "Аня Иванова");
  assert.ok(executor.key);
  assert.equal(executor.role, undefined);
  assert.equal(executor.compensation, undefined);
});

test("auto-match uses the task name when the executor role is empty", () => {
  const out = autoMatchPerformersByRole(estimate("Анимация", ""), { performers: [performer("a", "Аня", "Иванова", "Аниматор")], useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].type, "performer_binding");
  assert.equal(out.stages[0].tasks[0].executors[0].performerName, "Аня Иванова");
});

test("auto-match falls back to additional roles", () => {
  const out = autoMatchPerformersByRole(estimate("Риг", "Риггер"), { performers: [performer("a", "Аня", "Иванова", "Аниматор", ["Риггер"])], useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].performerName, "Аня Иванова");
});

test("auto-match does not bind when primary and additional role matches are both available", () => {
  const performers = [performer("b", "Боря", "Боков", "Аниматор"), performer("a", "Аня", "Иванова", "Графический дизайнер", ["Аниматор"])];
  const out = autoMatchPerformersByRole(estimate("Анимация", "Аниматор"), { performers, useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].type, "anonymous_unnamed");
});

test("auto-match skips inactive performers", () => {
  const out = autoMatchPerformersByRole(estimate("Анимация", "Аниматор"), { performers: [performer("a", "Аня", "Иванова", "Аниматор", [], false)], useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].type, "anonymous_unnamed");
});

test("auto-match requires a unique display name to avoid ambiguous bindings", () => {
  const out = autoMatchPerformersByRole(estimate("Анимация", "Аниматор"), { performers: [performer("a", "Аня", "Иванова", "Аниматор"), performer("b", "Аня", "Иванова", "Графический дизайнер")], useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].type, "anonymous_unnamed");
});

test("auto-match does not break same-role ties by performer id", () => {
  const performers = [performer("z", "Зоя", "Зетова", "Аниматор"), performer("a", "Аня", "Аниматорова", "Аниматор")];
  const first = autoMatchPerformersByRole(estimate("Анимация", "Аниматор"), { performers, useStudioTemplates: true });
  const second = autoMatchPerformersByRole(estimate("Анимация", "Аниматор"), { performers: [...performers].reverse(), useStudioTemplates: true });
  assert.equal(first.stages[0].tasks[0].executors[0].type, "anonymous_unnamed");
  assert.equal(second.stages[0].tasks[0].executors[0].type, "anonymous_unnamed");
});

test("task taxonomy takes priority over a free LLM role", () => {
  const out = autoMatchPerformersByRole(estimate("AI-анимация", "AI-аниматор"), { performers: [performer("a", "Маша", "Иванова", "AI-артист")], useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].performerName, "Маша Иванова");
});

test("technical tasks do not auto-bind cross-cutting performers", () => {
  for (const taskName of ["Цветокоррекция", "Монтаж", "Моделирование"]) {
    const out = autoMatchPerformersByRole(estimate(taskName, ""), { performers: [performer("a", "Сергей", "Иванов", "Продюсер")], useStudioTemplates: true });
    assert.equal(out.stages[0].tasks[0].executors[0].type, "anonymous_unnamed", taskName);
  }
});

test("specialized performer wins without using cross-cutting fallback", () => {
  const performers = [performer("a", "Сергей", "Иванов", "Продюсер"), performer("b", "Коля", "Петров", "Колорист")];
  const out = autoMatchPerformersByRole(estimate("Цветокоррекция", ""), { performers, useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].performerName, "Коля Петров");
});

test("an ambiguous higher-priority task role prevents fallback to later roles", () => {
  const performers = [performer("a", "Маша", "Иванова", "AI-артист"), performer("b", "Катя", "Петрова", "AI-артист"), performer("c", "Петя", "Сидоров", "Аниматор")];
  const out = autoMatchPerformersByRole(estimate("AI-анимация", ""), { performers, useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].type, "anonymous_unnamed");
});

test("a single additional-role performer can be auto-bound", () => {
  const out = autoMatchPerformersByRole(estimate("AI-анимация", ""), { performers: [performer("a", "Олег", "Иванов", "Моушн-дизайнер", ["AI-артист"])], useStudioTemplates: true });
  assert.equal(out.stages[0].tasks[0].executors[0].performerName, "Олег Иванов");
});

test("an unknown task may use its free LLM role only when it has one exact performer", () => {
  const one = autoMatchPerformersByRole(estimate("Неизвестная задача", "Some Existing Studio Role"), { performers: [performer("a", "Аня", "Иванова", "Some Existing Studio Role")], useStudioTemplates: true });
  const many = autoMatchPerformersByRole(estimate("Неизвестная задача", "Some Existing Studio Role"), { performers: [performer("a", "Аня", "Иванова", "Some Existing Studio Role"), performer("b", "Боря", "Иванов", "Some Existing Studio Role")], useStudioTemplates: true });
  assert.equal(one.stages[0].tasks[0].executors[0].type, "performer_binding");
  assert.equal(many.stages[0].tasks[0].executors[0].type, "anonymous_unnamed");
});
