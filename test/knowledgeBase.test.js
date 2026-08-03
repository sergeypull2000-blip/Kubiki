import test from "node:test";
import assert from "node:assert/strict";
import { APP_SECTIONS, changeAppSection, isAppSectionActive, normalizeAppSection } from "../src/appNavigation.js";
import { buildExecutorFromPerformer, createPerformer, normalizePerformer, removePerformer, searchPerformers, updatePerformer } from "../src/performerLibrary.js";
import { addQuickAccessItem, applyQuickAccessPreference, removeQuickAccessByPerformerId } from "../src/quickAccess.js";
import { projectSum } from "../src/calculations.js";

test("по умолчанию открываются Проекты и активная вкладка определяется корректно", () => {
  assert.equal(normalizeAppSection(), APP_SECTIONS.PROJECTS);
  assert.equal(isAppSectionActive(undefined, APP_SECTIONS.PROJECTS), true);
  assert.equal(isAppSectionActive(APP_SECTIONS.KNOWLEDGE_BASE, APP_SECTIONS.PROJECTS), false);
});

test("переходы между разделами сохраняют проекты и их состояние", () => {
  const projects = [{ id: "project", name: "Смета" }];
  const first = changeAppSection({ projects, dashboardFilter: "favorites" }, APP_SECTIONS.KNOWLEDGE_BASE);
  const second = changeAppSection(first, APP_SECTIONS.PROJECTS);
  assert.equal(first.projects, projects);
  assert.equal(second.projects, projects);
  assert.equal(second.dashboardFilter, "favorites");
});

test("пустая база и пустой запрос обрабатываются безопасно", () => {
  assert.deepEqual(searchPerformers(undefined, "что-то"), []);
  const library = [normalizePerformer({ id: "p", firstName: "Анна" })];
  assert.equal(searchPerformers(library, "").length, library.length);
});

test("создание, редактирование по прежнему id и одинаковые имена", () => {
  let library = createPerformer([], { firstName: "Анна" });
  const id = library[0].id;
  library = updatePerformer(library, id, { lastName: "Иванова" });
  library = createPerformer(library, { firstName: "Анна" });
  assert.equal(library[0].id, id);
  assert.equal(library[0].lastName, "Иванова");
  assert.equal(library.length, 2);
  assert.notEqual(library[0].id, library[1].id);
});

const searchable = normalizePerformer({ id: "search", firstName: "Анна", lastName: "Иванова", primaryRole: "Режиссёр",
  additionalRoles: ["Продюсер"], specializations: ["Анимация"], grade: "Сениор", software: ["Blender"],
  phone: "+79990000000", email: "anna@example.com", telegram: "@anna" });

for (const [field, query] of [["имени", "анна"], ["основной роли", "режиссёр"], ["дополнительной роли", "продюсер"],
  ["специализации", "анимация"], ["грейду", "сениор"], ["софту", "blender"], ["телефону", "999000"],
  ["email", "example.com"], ["Telegram", "@anna"]]) {
  test(`поиск по ${field}`, () => assert.deepEqual(searchPerformers([searchable], query).map((item) => item.id), ["search"]));
}

test("повторное добавление одного Performer в быстрый доступ не создаёт копию", () => {
  let state = applyQuickAccessPreference({}, "p", true);
  state = applyQuickAccessPreference(state, "p", true);
  assert.equal(state.items.length, 1);
});

test("разные Performer с одинаковым именем могут быть в быстром доступе", () => {
  let state = addQuickAccessItem({}, { id: "q1", performerId: "p1" });
  state = addQuickAccessItem(state, { id: "q2", performerId: "p2" });
  assert.equal(state.items.length, 2);
});

test("checkbox управляет QuickAccess, не удаляя Performer", () => {
  const library = [normalizePerformer({ id: "p", firstName: "Анна" })];
  const enabled = applyQuickAccessPreference({}, "p", true);
  const disabled = removeQuickAccessByPerformerId(enabled, "p");
  assert.equal(enabled.items.length, 1);
  assert.equal(disabled.items.length, 0);
  assert.equal(library.length, 1);
});

test("удаление Performer удаляет QuickAccess, но не мутирует Executor, snapshot и сумму проекта", () => {
  const performer = normalizePerformer({ id: "p", firstName: "Анна", defaultPaymentType: "fix_total", defaultRate: 9000 });
  const executor = buildExecutorFromPerformer(performer);
  const project = { stages: [{ tasks: [{ executors: [executor] }] }] };
  const before = structuredClone(project), total = projectSum(project);
  const library = removePerformer([performer], "p");
  const quickAccess = removeQuickAccessByPerformerId(applyQuickAccessPreference({}, "p", true), "p");
  assert.deepEqual(library, []);
  assert.deepEqual(quickAccess.items, []);
  assert.deepEqual(project, before);
  assert.equal(project.stages[0].tasks[0].executors[0].performerSnapshot.name, "Анна");
  assert.equal(projectSum(project), total);
});
