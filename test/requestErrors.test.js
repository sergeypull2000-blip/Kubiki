import test from "node:test";
import assert from "node:assert/strict";
import { aiEditErrorMessage, requestErrorMessage, safeServerMessage } from "../src/ai/requestErrors.js";

test("AI semantic errors use human-readable messages without exposing technical details", () => {
  const invalidSchema = aiEditErrorMessage("ai_semantic_invalid_schema", "schema validation failed");
  assert.equal(invalidSchema, "Не удалось выполнить эту правку целиком. Попробуйте разбить её на несколько изменений.");
  assert.doesNotMatch(invalidSchema, /semantic|schema|JSON|compiler|DeepSeek/i);
  assert.match(aiEditErrorMessage("ai_semantic_invalid_json", "Unexpected token"), /сформулировать её проще/);
  assert.match(aiEditErrorMessage("ai_semantic_unknown_command", "unknown command"), /сформулировать её проще/);
});

test("non-semantic AI edit errors retain their product-specific message", () => {
  assert.equal(aiEditErrorMessage("project_not_found", "Смета не найдена"), "Смета не найдена");
  assert.equal(aiEditErrorMessage("stale_revision", "Смета изменилась"), "Смета изменилась");
});

test("request errors map common statuses to actionable messages", () => {
  assert.match(requestErrorMessage(401), /Сессия/);
  assert.match(requestErrorMessage(413), /слишком большой/);
  assert.match(requestErrorMessage(502), /корректную смету/);
  assert.match(requestErrorMessage(504), /слишком много времени/);
});

test("safe server messages are single-line and bounded", () => {
  assert.equal(safeServerMessage("  Ошибка\n\tсервера  "), "Ошибка сервера");
  assert.equal(safeServerMessage("x".repeat(500)).length, 240);
  assert.equal(safeServerMessage({ error: "secret" }), "");
  assert.equal(requestErrorMessage(500, ""), "Не удалось выполнить запрос. Попробуйте ещё раз.");
});
