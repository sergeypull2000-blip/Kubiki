import assert from "node:assert/strict";
import test from "node:test";
import { shouldHandleExecutorCopy } from "../src/keyboardShortcuts.js";

const event = (patch = {}) => ({ ctrlKey: true, metaKey: false, code: "KeyC", target: { closest: () => null }, ...patch });

test("executor copy shortcut yields to browser copy for fields and selected text", () => {
  assert.equal(shouldHandleExecutorCopy(event(), { isCollapsed: true }), true);
  assert.equal(shouldHandleExecutorCopy(event({ target: { closest: () => ({}) } }), { isCollapsed: true }), false);
  assert.equal(shouldHandleExecutorCopy(event(), { isCollapsed: false }), false);
  assert.equal(shouldHandleExecutorCopy(event({ metaKey: true, ctrlKey: false }), { isCollapsed: true }), true);
});
