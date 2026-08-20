import test from "node:test";
import assert from "node:assert/strict";
import { CROSS_CUTTING_ROLES, STUDIO_ROLES, isStudioRole, matchTaskToRoles, normalizeRoleText } from "../src/cgTaskRoleTaxonomy.js";

test("studio role taxonomy is a stable, unique canonical list", () => {
  assert.equal(STUDIO_ROLES.length, 28);
  assert.equal(new Set(STUDIO_ROLES).size, STUDIO_ROLES.length);
  assert.ok(CROSS_CUTTING_ROLES.every((role) => STUDIO_ROLES.includes(role)));
});

test("normalizeRoleText folds case, punctuation and yo deterministically", () => {
  assert.equal(normalizeRoleText("  3D-Артист  "), "3d артист");
  assert.equal(normalizeRoleText("Звукорежиссёр"), "звукорежиссер");
  assert.equal(normalizeRoleText("Motion Designer"), "motion designer");
  assert.equal(normalizeRoleText(""), "");
});

test("isStudioRole matches canonical roles ignoring case and whitespace", () => {
  assert.equal(isStudioRole("Аниматор"), true);
  assert.equal(isStudioRole("3D-артист"), true);
  assert.equal(isStudioRole("3D-моделлер"), true);
  assert.equal(isStudioRole("аниматор"), true);
  assert.equal(isStudioRole("  Колорист "), true);
  assert.equal(isStudioRole("Монтажёр"), true);
  assert.equal(isStudioRole("Неизвестная роль"), false);
  assert.equal(isStudioRole(""), false);
});

test("matchTaskToRoles maps task names to roles by priority and appends cross-cutting roles", () => {
  assert.equal(matchTaskToRoles("Озвучка")[0], "Звукорежиссёр");
  assert.equal(matchTaskToRoles("Логотип")[0], "Граф-дизайнер");
  assert.equal(matchTaskToRoles("Анимация персонажа")[0], "Аниматор");
  assert.equal(matchTaskToRoles("Моушн-дизайн")[0], "Моушн-дизайнер");
  assert.equal(matchTaskToRoles("Моделинг")[0], "3D-моделлер");
  assert.equal(matchTaskToRoles("Монтаж")[0], "Монтажер");
  assert.equal(matchTaskToRoles("Симуляция дыма")[0], "VFX-артист");
  assert.deepEqual(matchTaskToRoles("Цветокоррекция", { includeCrossCutting: false }), ["Колорист", "Композер"]);
  assert.deepEqual(matchTaskToRoles("Титры", { includeCrossCutting: false }), ["Граф-дизайнер", "Моушн-дизайнер", "2D-артист"]);
});

test("AI-артист — единственная специализированная AI-роль", () => {
  assert.equal(isStudioRole("AI-артист"), true);
  // Дополнительных AI-ролей быть не должно.
  assert.equal(isStudioRole("AI Motion Designer"), false);
  assert.equal(isStudioRole("Prompt Engineer"), false);
  assert.equal(isStudioRole("GenAI Specialist"), false);
  assert.equal(isStudioRole("AI Designer"), false);
  // AI-артист — основной исполнитель для всех AI-задач (формальные названия).
  for (const task of ["AI-генерация", "AI-анимация", "AI-видео", "Image-to-video", "Video-to-video", "GenAI production", "text to image", "text to video"]) {
    assert.equal(matchTaskToRoles(task)[0], "AI-артист");
  }
  // Естественно-языковые варианты пользовательского ввода.
  for (const task of ["генерация нейронкой", "сделать видео через нейронку", "сделать через ИИ", "ИИшка"]) {
    assert.equal(matchTaskToRoles(task)[0], "AI-артист");
  }
  // Задачи с анимацией/сборкой дополнительно привлекают Моушн-дизайнера.
  assert.ok(matchTaskToRoles("AI-анимация").includes("Моушн-дизайнер"));
  assert.ok(matchTaskToRoles("Image-to-video").includes("Моушн-дизайнер"));
  // Голое «ai» убрано: без других AI-ключевых слов эти задачи не попадают на AI-артиста.
  for (const task of ["AI cleanup", "AI concept", "AI storyboard", "AI previz", "AI asset"]) {
    assert.ok(!matchTaskToRoles(task).includes("AI-артист"));
  }
});

test("cross-cutting roles are appended by default and can be disabled", () => {
  assert.deepEqual(matchTaskToRoles(""), CROSS_CUTTING_ROLES);
  assert.deepEqual(matchTaskToRoles("Бухгалтерия", { includeCrossCutting: false }), []);
  const withCross = matchTaskToRoles("Логотип");
  assert.equal(withCross[0], "Граф-дизайнер");
  assert.ok(CROSS_CUTTING_ROLES.every((role) => withCross.includes(role)));
});
