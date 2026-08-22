import test from "node:test";
import assert from "node:assert/strict";
import { addPerformerToTask, buildExecutorFromPerformer, buildPerformerFromExecutor, createPerformer, linkExecutorToPerformer, loadPerformerLibrary, normalizePerformer, normalizePerformerLibrary, updatePerformer } from "../src/performerLibrary.js";

test("grade сохраняется в существующей модели исполнителя", () => {
  const performer = createPerformer([], { id: "p", grade: "Мидл", additionalRoles: ["Риггер", "Аниматор"], software: ["Maya", "Blender"] })[0];
  const updated = updatePerformer([performer], "p", { grade: "Сеньор" })[0];
  assert.equal(updated.grade, "Сеньор");
  assert.deepEqual(updated.additionalRoles, ["Риггер", "Аниматор"]);
  assert.deepEqual(updated.software, ["Maya", "Blender"]);
});

test("карточка может содержать только имя", () => { const p = createPerformer([], { firstName: "Миша" })[0]; assert.equal(p.firstName, "Миша"); assert.equal(p.primaryRole, ""); });
test("карточка может содержать только роль", () => assert.equal(createPerformer([], { primaryRole: "Артист" })[0].primaryRole, "Артист"));
test("карточка может содержать только тип оплаты", () => assert.equal(createPerformer([], { defaultPaymentType: "hourly" })[0].defaultPaymentType, "hourly"));
test("карточка может содержать только ставку", () => assert.equal(createPerformer([], { defaultRate: 1200 })[0].defaultRate, 1200));
test("нормализация не мутирует input, сохраняет id и создаёт отсутствующий", () => { const source = { id: "p", primaryRole: "Role", additionalRoles: ["Role", "Other"] }; const copy = structuredClone(source), p = normalizePerformer(source); assert.deepEqual(source, copy); assert.equal(p.id, "p"); assert.ok(normalizePerformer({}).id); assert.deepEqual(p.additionalRoles, ["Other"]); });
test("normalizePerformerLibrary безопасен", () => assert.deepEqual(normalizePerformerLibrary(null), []));
test("повреждённая база загружается безопасно", () => assert.deepEqual(loadPerformerLibrary({ getItem: () => "{" }), []));
test("buildPerformerFromExecutor читает теги и ставку", () => { const p = buildPerformerFromExecutor({ tags: [{ key: "name", value: "Анна" }, { key: "role", value: "Режиссёр" }, { key: "payment", payment: { type: "fix_total" } }], amount: "50000" }); assert.equal(p.firstName, "Анна"); assert.equal(p.defaultRate, 50000); });
test("buildExecutorFromPerformer создаёт независимый snapshot", () => { const performer = normalizePerformer({ id: "p", firstName: "Иван", primaryRole: "Artist", defaultPaymentType: "hourly", defaultRate: 1000 }); const executor = buildExecutorFromPerformer(performer); executor.tags[0].value = "Other"; assert.equal(performer.primaryRole, "Artist"); performer.firstName = "Пётр"; assert.equal(executor.performerSnapshot.name, "Иван"); });
test("удаление тега у исполнителя в смете не меняет его карточку", () => { const performer = normalizePerformer({ id: "p", firstName: "Иван", primaryRole: "Artist", specializations: ["CG"] }); const executor = buildExecutorFromPerformer(performer); executor.tags = executor.tags.filter((tag) => tag.key !== "role" && tag.key !== "spec"); assert.equal(executor.tags.some((tag) => tag.key === "role" || tag.key === "spec"), false); assert.equal(performer.primaryRole, "Artist"); assert.deepEqual(performer.specializations, ["CG"]); });
test("click без Task не меняет проект, DnD в указанную Task добавляет Executor", () => { const performer = normalizePerformer({ id: "p", firstName: "Иван" }), project = { stages: [{ id: "s", tasks: [{ id: "t", executors: [] }] }] }; assert.equal(addPerformerToTask(project, null, null, performer), project); const next = addPerformerToTask(project, "s", "t", performer); assert.equal(next.stages[0].tasks[0].executors.length, 1); assert.equal(performer.id, "p"); });
test("изменение Performer не меняет существующий Executor", () => { const performer = normalizePerformer({ id: "p", firstName: "Иван" }), executor = buildExecutorFromPerformer(performer); const changed = updatePerformer([performer], "p", { firstName: "Пётр" }); assert.equal(executor.performerSnapshot.name, "Иван"); assert.equal(changed[0].firstName, "Пётр"); });
test("link Executor сохраняет сумму проекта и редактирование использует existing id", () => { const project = { stages: [{ tasks: [{ executors: [{ id: "e", tags: [], amount: "9000" }] }] }] }, performer = normalizePerformer({ id: "p", firstName: "Иван" }); const next = linkExecutorToPerformer(project, "e", performer); assert.equal(next.stages[0].tasks[0].executors[0].amount, "9000"); assert.equal(next.stages[0].tasks[0].executors[0].performerId, "p"); assert.equal(updatePerformer([performer], "p", { notes: "edit" }).length, 1); });
