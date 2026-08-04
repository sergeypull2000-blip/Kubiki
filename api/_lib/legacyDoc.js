import WordExtractor from "word-extractor";
import { cleanPlainText, MAX_BRIEF_CHARS } from "./brief.js";

export const MAX_LEGACY_DOC_BYTES = 3 * 1024 * 1024;
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function decodeLegacyDocPayload(body) {
  if (!/\.doc$/i.test(String(body?.filename || ""))) return { ok: false, status: 400, error: "Ожидается файл .doc" };
  const encoded = typeof body?.contentBase64 === "string" ? body.contentBase64 : "";
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return { ok: false, status: 400, error: "Некорректное содержимое .doc" };
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) return { ok: false, status: 400, error: "Файл .doc пуст" };
  if (buffer.length > MAX_LEGACY_DOC_BYTES) return { ok: false, status: 413, error: "Файл .doc слишком большой. Максимальный размер — 3 МБ" };
  if (buffer.length < OLE_SIGNATURE.length || !buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE)) {
    return { ok: false, status: 422, error: "Файл не похож на старый документ Word. Пересохраните его в .docx" };
  }
  return { ok: true, buffer };
}

export async function extractLegacyDoc(buffer, { createExtractor = () => new WordExtractor() } = {}) {
  try {
    const document = await createExtractor().extract(buffer);
    const text = cleanPlainText(document?.getBody?.());
    if (!text) return { ok: false, status: 422, error: "В .doc не найден текст. Пересохраните документ в .docx" };
    if (text.length > MAX_BRIEF_CHARS) return { ok: false, status: 413, error: `Текст документа слишком большой. Максимум ${MAX_BRIEF_CHARS} символов` };
    return { ok: true, text };
  } catch {
    return { ok: false, status: 422, error: "Не удалось прочитать старый .doc. Пересохраните документ в .docx и попробуйте снова" };
  }
}
