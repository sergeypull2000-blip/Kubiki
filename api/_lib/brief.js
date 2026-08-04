export const MAX_BRIEF_CHARS = 40_000;
export const MAX_INSTRUCTION_CHARS = 2_000;

export function cleanPlainText(value) {
  const withoutControls = [...String(value ?? "")].filter((character) => {
    const code = character.codePointAt(0);
    return code === 9 || code === 10 || code === 13 || code > 31 && code !== 127;
  }).join("");
  return withoutControls
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function validateGenerationInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "Некорректное тело запроса" };
  const brief = cleanPlainText(body.description ?? body.brief);
  const instruction = cleanPlainText(body.instruction);
  if (!brief) return { ok: false, status: 400, error: "Нет описания проекта в теле запроса" };
  if (brief.length > MAX_BRIEF_CHARS) return { ok: false, status: 413, error: `Описание проекта слишком большое. Максимум ${MAX_BRIEF_CHARS} символов` };
  if (instruction.length > MAX_INSTRUCTION_CHARS) return { ok: false, status: 413, error: `Дополнительная инструкция слишком большая. Максимум ${MAX_INSTRUCTION_CHARS} символов` };
  return { ok: true, brief, instruction };
}
