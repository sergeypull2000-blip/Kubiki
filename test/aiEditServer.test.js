import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../api/edit-estimate.js";
import { AI_EDIT_SYSTEM_PROMPT, buildAiEditMessages } from "../api/_lib/editPrompt.js";
import { needsClarificationForBareInput, resolveExplicitPerformers } from "../api/_lib/performerResolver.js";

function responseRecorder() { return { headers: {}, statusCode: 0, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }

test("AI-edit endpoint without JWT returns 401 and performs no model request", async () => {
  const res = responseRecorder(); await handler({ method: "POST", headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 401); assert.match(res.body.error, /авторизац/i);
});

test("ambiguous explicit Performer returns one clarification candidate set", () => {
  const performers = [{ id: "1", firstName: "Миша", lastName: "Иванов" }, { id: "2", firstName: "Миша", lastName: "Петров" }];
  const result = resolveExplicitPerformers("Назначь Мишу на моделинг", performers);
  assert.equal(result.performers.length, 0); assert.match(result.clarification.question, /какого исполнителя/i); assert.equal(result.clarification.choices.length, 2);
  assert.deepEqual(resolveExplicitPerformers("Увеличь детализацию", performers).performers, []);
});

test("replace resolves target only among Project Executors and replacement only among active Performer", () => {
  const project = { stages: [{ id: "s", name: "Preprod", tasks: [{ id: "t", name: "Art", executors: [{ id: "e-anya", tags: [{ key: "name", value: "Аня" }] }] }] }] };
  const performers = [{ id: "anya-db", firstName: "Аня", lastName: "Орлова" }, { id: "m1", firstName: "Миша", lastName: "Иванов" }, { id: "m2", firstName: "Миша", lastName: "Петров" }];
  const ambiguous = resolveExplicitPerformers("Замени Аня на Миша из базы", performers, [], project);
  assert.match(ambiguous.clarification.question, /какого исполнителя из базы/i);
  assert.deepEqual(ambiguous.clarification.choices.map((choice) => choice.source.id), ["m1", "m2"]);
  const resolved = resolveExplicitPerformers("Замени Аня на Миша Иванов из базы", performers, [], project);
  assert.equal(resolved.targetExecutorId, "e-anya"); assert.deepEqual(resolved.performers.map((item) => item.id), ["m1"]);
});

test("ambiguous replace target clarifies Executor before resolving replacement", () => {
  const project = { stages: [{ id: "s", name: "S", tasks: [{ id: "t1", name: "T1", executors: [{ id: "e1", tags: [{ key: "name", value: "Аня" }] }] }, { id: "t2", name: "T2", executors: [{ id: "e2", tags: [{ key: "name", value: "Аня" }] }] }] }] };
  const result = resolveExplicitPerformers("Замени Аня на Миша", [{ id: "m", firstName: "Миша" }], [], project);
  assert.match(result.clarification.question, /в текущей смете/i); assert.deepEqual(result.clarification.choices.map((choice) => choice.source.id), ["e1", "e2"]);
});

test("bare name is clarification-worthy and database add never invents missing Performer", () => {
  assert.equal(needsClarificationForBareInput("Миша"), true);
  const missing = resolveExplicitPerformers("Добавь Николая из базы", [], [], { stages: [] });
  assert.match(missing.clarification.question, /не найден/i); assert.deepEqual(missing.performers, []);
});

test("editor prompt fixes priorities, strict JSON, no arbitrary patch and no implicit Performer", () => {
  assert.match(AI_EDIT_SYSTEM_PROMPT, /Текущий запрос всегда может отменить персонализацию/);
  assert.match(AI_EDIT_SYSTEM_PROMPT, /set\/path\/patch\/replaceProject/);
  assert.match(AI_EDIT_SYSTEM_PROMPT, /Не назначай и не заменяй Performer без прямого запроса/);
  assert.match(AI_EDIT_SYSTEM_PROMPT, /только один завершённый JSON/);
  const messages = buildAiEditMessages({ request: { schemaVersion: 1, requestId: "r", baseRevision: "x", scope: { kind: "project", projectId: "p" }, instruction: "Переименуй", idPool: { stages: [], tasks: [], executors: [], tags: [] } }, project: { id: "p", stages: [], branding: { contacts: "secret" } }, personalization: "Всегда сториборд", performers: [], knowledge: [] });
  assert.doesNotMatch(messages[1].content, /secret/); assert.match(messages[1].content, /<studio_knowledge>\[\]/);
});

test("endpoint is read-only, owner-scoped and does not log Project content", () => {
  const endpoint = readFileSync(new URL("../api/edit-estimate.js", import.meta.url), "utf8"), repository = readFileSync(new URL("../api/_lib/editProject.js", import.meta.url), "utf8");
  assert.match(repository, /\.eq\("user_id", userId\)\.eq\("client_id", projectId\)/);
  assert.doesNotMatch(endpoint, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(endpoint, /console\.(?:info|error|warn)\([^\n]*(?:project|instruction|raw)/i);
});

test("DeepSeek ai_edit stage has thinking disabled", () => {
  const source = readFileSync(new URL("../api/_lib/deepseek.js", import.meta.url), "utf8");
  assert.match(source, /stage === "ai_edit"/);
});
