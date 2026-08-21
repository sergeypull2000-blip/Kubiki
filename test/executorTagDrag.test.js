import test from "node:test";
import assert from "node:assert/strict";
import { applyTagToExecutor, makeTag } from "../src/store.js";

test("tax tag drag-copy preserves a numeric value", () => {
  const copied = applyTagToExecutor([makeTag("role")], { fromExecutor: true, key: "tax", value: "6" });
  assert.equal(copied.find((tag) => tag.key === "tax")?.value, "6");
});

test("tax tag drag-copy preserves an explicit zero", () => {
  const copied = applyTagToExecutor([], { fromExecutor: true, key: "tax", value: "0" });
  assert.equal(copied.find((tag) => tag.key === "tax")?.value, "0");
});
