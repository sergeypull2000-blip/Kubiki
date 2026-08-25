export function isTextEditingActive(event, selection) {
  const target = event.target;
  if (target?.closest?.("input, textarea, select, [contenteditable]")) return true;
  return Boolean(selection && !selection.isCollapsed);
}

export function shouldHandleExecutorShortcut(event, selection, code) {
  return Boolean((event.ctrlKey || event.metaKey) && event.code === code && !isTextEditingActive(event, selection));
}

export const shouldHandleExecutorCopy = (event, selection) => shouldHandleExecutorShortcut(event, selection, "KeyC");
export const shouldHandleExecutorPaste = (event, selection) => shouldHandleExecutorShortcut(event, selection, "KeyV");
