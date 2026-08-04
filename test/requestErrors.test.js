import test from "node:test";
import assert from "node:assert/strict";
import { requestErrorMessage, safeServerMessage } from "../src/ai/requestErrors.js";

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
