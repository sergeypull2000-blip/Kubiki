import assert from "node:assert/strict";
import test from "node:test";
import { shouldHandleExecutorCopy, shouldHandleExecutorPaste } from "../src/keyboardShortcuts.js";

const event = (patch = {}) => ({ ctrlKey: true, metaKey: false, code: "KeyC", target: { closest: () => null }, ...patch });

test("executor copy shortcut yields to browser copy for fields and selected text", () => {
  assert.equal(shouldHandleExecutorCopy(event(), { isCollapsed: true }), true);
  assert.equal(shouldHandleExecutorCopy(event({ target: { closest: () => ({}) } }), { isCollapsed: true }), false);
  assert.equal(shouldHandleExecutorCopy(event(), { isCollapsed: false }), false);
  assert.equal(shouldHandleExecutorCopy(event({ metaKey: true, ctrlKey: false }), { isCollapsed: true }), true);
});

test("executor paste shortcut yields to browser paste for fields and selected text", () => {
  assert.equal(shouldHandleExecutorPaste(event({ code: "KeyV" }), { isCollapsed: true }), true);
  assert.equal(shouldHandleExecutorPaste(event({ code: "KeyV", target: { closest: () => ({}) } }), { isCollapsed: true }), false);
  assert.equal(shouldHandleExecutorPaste(event({ code: "KeyV" }), { isCollapsed: false }), false);
  assert.equal(shouldHandleExecutorPaste(event({ code: "KeyC" }), { isCollapsed: true }), false);
});
