export function buildAiEditContinuation({ instruction, answer = "", source = null, label = "", confirmed = {} }) {
  const continuation = source ? `\nУточнение пользователя: ${label}` : answer ? `\nУточнение пользователя: ${answer}` : "";
  const nextConfirmed = { ...confirmed, ...(source?.kind === "project" ? { projectEntityId: source.id } : {}), ...(source?.kind === "performer" ? { performerId: source.id } : {}) };
  return {
    instruction: `${instruction}${continuation}`,
    confirmed: nextConfirmed,
    ...(source?.kind === "performer" ? { knowledge: { useStudioKnowledge: false, selectedSources: [{ kind: "performer", id: source.id }] } } : {}),
  };
}
