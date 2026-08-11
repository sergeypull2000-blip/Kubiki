export function buildAiEditContinuation({ instruction, answer = "", source = null, label = "" }) {
  const continuation = source
    ? `\n[confirmed_source kind=${source.kind} id=${source.id}]\nУточнение пользователя: ${label}`
    : answer ? `\nУточнение пользователя: ${answer}` : "";
  return {
    instruction: `${instruction}${continuation}`,
    ...(source?.kind === "performer" ? { knowledge: { useStudioKnowledge: false, selectedSources: [{ kind: "performer", id: source.id }] } } : {}),
  };
}
