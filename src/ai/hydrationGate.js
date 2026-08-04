const BLOCKING_STATES = new Set(["loading", "waiting", "migrating"]);

export function isAiHydrationReady({ projects, performers, templates, aiSettings } = {}) {
  return [projects, performers, templates, aiSettings].every((state) => typeof state === "string" && !BLOCKING_STATES.has(state));
}
