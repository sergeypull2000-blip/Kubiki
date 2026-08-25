export function resolveAppSessionView({ isPending, hasResolved, recoveryMode, resetCompleted, hasUser }) {
  const sessionHasResolved = hasResolved || !isPending;

  if (!sessionHasResolved) return { view: "loading", sessionHasResolved };
  if (recoveryMode && !resetCompleted) return { view: "reset", sessionHasResolved };
  if (!hasUser) return { view: "auth", sessionHasResolved };
  return { view: "app", sessionHasResolved };
}
