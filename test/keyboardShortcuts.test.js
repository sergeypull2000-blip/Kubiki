import assert from "node:assert/strict";
import test from "node:test";
import { blockGlobalUndo, shouldHandleExecutorCopy, shouldHandleExecutorPaste } from "../src/keyboardShortcuts.js";

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

const undoEvent = (editableSelector = null, patch = {}) => {
  let prevented = false;
  const value = event({
    code: "KeyZ",
    target: { closest: (selector) => editableSelector && selector.includes(editableSelector) ? {} : null },
    preventDefault: () => { prevented = true; },
    ...patch,
  });
  return { value, wasPrevented: () => prevented };
};

test("global undo yields to native browser undo in editable fields", () => {
  for (const selector of ["input", "textarea", "[contenteditable]"]) {
    const undo = undoEvent(selector);
    assert.equal(blockGlobalUndo(undo.value), false, selector);
    assert.equal(undo.wasPrevented(), false, selector);
  }
});

test("global undo is blocked outside editable context without a state action", () => {
  const project = { name: "unchanged" };
  const before = structuredClone(project);
  const undo = undoEvent();

  assert.equal(blockGlobalUndo(undo.value), true);
  assert.equal(undo.wasPrevented(), true);
  assert.deepEqual(project, before);
});

test("global undo supports Cmd and ignores unrelated shortcuts", () => {
  const commandUndo = undoEvent(null, { ctrlKey: false, metaKey: true });
  assert.equal(blockGlobalUndo(commandUndo.value), true);
  assert.equal(commandUndo.wasPrevented(), true);

  const copy = undoEvent(null, { code: "KeyC" });
  assert.equal(blockGlobalUndo(copy.value), false);
  assert.equal(copy.wasPrevented(), false);
});
