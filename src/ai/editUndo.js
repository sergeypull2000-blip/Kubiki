export function createAiEditUndoStore() {
  const entries = new Map();
  return {
    has: (projectId) => entries.has(projectId),
    get: (projectId) => entries.get(projectId) || null,
    record(projectId, entry) { entries.set(projectId, { beforeProject: structuredClone(entry.beforeProject), appliedRevision: entry.appliedRevision, requestId: entry.requestId }); },
    invalidate(projectId) { return entries.delete(projectId); },
    clear() { entries.clear(); },
  };
}
