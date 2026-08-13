export function drainProjectSaveQueue({ project, pending, inFlight, persist }) {
  if (!project?.id) return Promise.resolve(false);
  const projectId = project.id;
  const active = inFlight.get(projectId);
  if (active) return active;

  const drain = (async () => {
    let snapshot = project;
    while (snapshot) {
      await persist(snapshot);
      if (pending.get(projectId) === snapshot) pending.delete(projectId);
      snapshot = pending.get(projectId) || null;
    }
    return true;
  })();

  const tracked = drain.finally(() => {
    if (inFlight.get(projectId) === tracked) inFlight.delete(projectId);
  });
  inFlight.set(projectId, tracked);
  return tracked;
}
