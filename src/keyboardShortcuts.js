export function shouldHandleExecutorCopy(event, selection) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyC") return false;
  const target = event.target;
  if (target?.closest?.("input, textarea, select, [contenteditable]")) return false;
  if (selection && !selection.isCollapsed) return false;
  return true;
}
