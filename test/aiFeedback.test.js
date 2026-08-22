import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { feedbackProjection, structuralDiff } from "../server/aiFeedback.js";

const project = () => ({ id: "project-secret", name: "Client Secret", brief: "raw prompt", activeSheetId: "sheet", sheets: [{ id: "sheet", name: "Secret sheet", stages: [{ id: "s1", name: "Production", tasks: [{ id: "t1", name: "Animation", quantity: 2, duration: 3, exportComment: "private", executors: [{ id: "e1", amount: 100, performerId: "p1", performerSnapshot: { name: "Alice", email: "a@example.com", phone: "+7" }, tags: [{ key: "role", value: "Animator" }, { key: "grade", value: "Senior" }, { key: "payment", payment: { type: "hour", rate: 50, hours: 2 } }] }] }] }] }] });

test("feedback projection keeps eval structure and removes identifying/raw fields", () => {
  const value = feedbackProjection(project()), serialized = JSON.stringify(value);
  assert.equal(value.stages[0].tasks[0].executors[0].role, "Animator");
  for (const forbidden of ["project-secret", "Client Secret", "raw prompt", "Secret sheet", "Alice", "a@example.com", "+7", "performerId", "performerSnapshot", "exportComment", "brief"]) assert.equal(serialized.includes(forbidden), false);
});

test("feedback projection keeps only estimate monetary inputs, not totals or commercial metadata", () => {
  const source = project();
  const task = source.sheets[0].stages[0].tasks[0];
  task.directCost = 1250;
  task.total = 9999;
  task.exportPrice = 7777;
  source.globalMarkup = 20;
  source.branding = { studioName: "Private studio" };
  const value = feedbackProjection(source);
  const executor = value.stages[0].tasks[0].executors[0];
  assert.deepEqual(
    { directCost: value.stages[0].tasks[0].directCost, amount: executor.amount, rate: executor.rate, units: executor.units, hours: executor.hours, shifts: executor.shifts },
    { directCost: 1250, amount: 100, rate: 50, units: null, hours: 2, shifts: null },
  );
  const serialized = JSON.stringify(value);
  for (const forbidden of ["9999", "7777", "20", "Private studio", "globalMarkup", "branding", "total", "exportPrice"]) assert.equal(serialized.includes(forbidden), false);
});

test("structural diff deterministically reports additions and estimate field changes", () => {
  const before = feedbackProjection(project()), next = project();
  next.sheets[0].stages[0].tasks[0].duration = 5;
  next.sheets[0].stages[0].tasks.push({ id: "t2", name: "Render", executors: [] });
  assert.deepEqual(structuralDiff(before, feedbackProjection(next)).changes.map((item) => item.type), ["task_added", "duration_changed"]);
});

test("feedback migration and API enforce consent, ownership, final state and revocation deletion", async () => {
  const [sql, repo, routes] = await Promise.all([
    readFile(new URL("../db/migrations/006_ai_feedback_samples.sql", import.meta.url), "utf8"),
    readFile(new URL("../server/repositories/ownerApiRepository.js", import.meta.url), "utf8"),
    readFile(new URL("../server/ownerApiRoutes.js", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /accepted_without_correction boolean/);
  assert.doesNotMatch(sql, /ai_feedback_samples \([\s\S]*?\buser_id\b/);
  assert.match(sql, /references public\.projects \(id\) on delete cascade/);
  assert.match(sql, /ai_feedback_samples_project_id_active_idx on public\.ai_feedback_samples \(project_id\) where finalized_at is null/);
  assert.match(sql, /ai_feedback_samples_request_once_idx on public\.ai_feedback_samples \(project_id, ai_request_id\) where ai_request_id is not null/);
  assert.match(repo, /revoked_at is null/);
  assert.match(repo, /insert into public\.ai_feedback_samples\(project_id,operation,ai_request_id,ai_snapshot\)/);
  assert.doesNotMatch(repo, /insert into public\.ai_feedback_samples\(user_id,/);
  assert.match(repo, /where project_id=\$1 and finalized_at is null/);
  assert.match(repo, /where id=\$1 and project_id=\$2 returning/);
  assert.match(repo, /delete from public\.ai_feedback_samples as sample using public\.projects as project where sample\.project_id=project\.id and project\.user_id=\$1/);
  assert.doesNotMatch(routes, /v\.userId|v\.user_id/);
});

test("optional consent UI stays unchecked, cancellable and uses one equal-height card contract", async () => {
  const [modal, settings, styles, legal] = await Promise.all([
    readFile(new URL("../src/components/AiDisclosureProvider.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AIPersonalizationModal.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.js", import.meta.url), "utf8"),
    readFile(new URL("../src/legalDocuments.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(modal, /useState\(false\)/);
  assert.match(settings, /Помогать делать сметы точнее/);
  assert.equal((settings.match(/className="kb-ai-history-option"/g) || []).length, 3);
  assert.match(styles, /kb-ai-settings-modal \.kb-ai-history-option\{[^}]*min-height:92px/);
  assert.match(legal, /"\/ai-improvement-consent": AiImprovementConsent/);
  assert.match(legal, /количественные и стоимостные параметры \(например, ставки, прямые затраты и итоговые значения\)/);
  assert.match(legal, /не публикуются и не предоставляются другим пользователям для анализа цен, ставок или коммерческих условий конкретной студии/);
  assert.match(legal, /включая при необходимости количественные и стоимостные параметры сметы/);
});
