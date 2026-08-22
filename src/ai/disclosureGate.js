let gate = null;

export function installAiDisclosureGate(nextGate) {
  gate = nextGate;
  return () => { if (gate === nextGate) gate = null; };
}

export async function requireAiDisclosure() {
  // Non-UI callers still hit the mandatory server-side acceptance check.
  if (!gate) return true;
  return gate();
}
