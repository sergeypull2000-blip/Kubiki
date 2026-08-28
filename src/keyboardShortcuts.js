export function isEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable]"));
}

export function isTextEditingActive(event, selection) {
  if (isEditableTarget(event.target)) return true;
  return Boolean(selection && !selection.isCollapsed);
}

export function shouldHandleExecutorShortcut(event, selection, code) {
  return Boolean((event.ctrlKey || event.metaKey) && event.code === code && !isTextEditingActive(event, selection));
}

export const shouldHandleExecutorCopy = (event, selection) => shouldHandleExecutorShortcut(event, selection, "KeyC");
export const shouldHandleExecutorPaste = (event, selection) => shouldHandleExecutorShortcut(event, selection, "KeyV");

export function blockGlobalUndo(event) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyZ" || isEditableTarget(event.target)) return false;
  event.preventDefault();
  return true;
}
