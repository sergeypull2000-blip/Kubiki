import { requestErrorMessage } from "./requestErrors.js";
import { kubikiApiUrl, notifyKubikiUnauthorized } from "../backend/apiTransport.js";

export const MAX_WORD_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_WORD_TEXT_CHARS = 40_000;

export function wordExtension(filename) {
  const match = String(filename || "").toLocaleLowerCase("en-US").match(/\.(docx|doc)$/);
  return match?.[1] || "";
}

export function normalizeExtractedWordText(value) {
  const text = String(value || "")
    .replaceAll(String.fromCharCode(0), "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("В документе не найден текст.");
  if (text.length > MAX_WORD_TEXT_CHARS) throw new Error(`Текст документа слишком большой. Максимум ${MAX_WORD_TEXT_CHARS} символов.`);
  return text;
}

function validateWordFile(file, expectedExtension) {
  if (!file || typeof file.arrayBuffer !== "function") throw new Error("Не удалось прочитать Word-файл.");
  if (wordExtension(file.name) !== expectedExtension) throw new Error(`Ожидается файл .${expectedExtension}.`);
  if (!(file.size > 0)) throw new Error("Word-файл пуст.");
  if (file.size > MAX_WORD_FILE_BYTES) throw new Error("Word-файл слишком большой. Максимальный размер — 3 МБ.");
}

export async function extractDocxText(file, { extractRawText } = {}) {
  validateWordFile(file, "docx");
  try {
    const extract = extractRawText || (await import("mammoth")).extractRawText;
    const result = await extract({ arrayBuffer: await file.arrayBuffer() });
    return normalizeExtractedWordText(result?.value);
  } catch (error) {
    if (/текст документа слишком большой|не найден текст/i.test(error?.message || "")) throw error;
    throw new Error("Не удалось извлечь текст из .docx. Проверьте файл или пересохраните его в новом формате Word.");
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function extractLegacyDocText(file, { fetchImpl = fetch, getAccessToken } = {}) {
  validateWordFile(file, "doc");
  const token = getAccessToken ? await getAccessToken() : null;
  const response = await fetchImpl(kubikiApiUrl("/api/extract-doc"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
    body: JSON.stringify({ filename: file.name, contentBase64: arrayBufferToBase64(await file.arrayBuffer()) }),
  });
  const body = await response.json().catch(() => ({}));
  notifyKubikiUnauthorized(response.status);
  if (!response.ok) throw new Error(requestErrorMessage(response.status, body.error, "Не удалось прочитать старый .doc. Пересохраните документ в .docx и попробуйте снова."));
  return normalizeExtractedWordText(body.text);
}

export async function extractWordBrief(file, dependencies) {
  const extension = wordExtension(file?.name);
  if (extension === "docx") return extractDocxText(file, dependencies);
  if (extension === "doc") return extractLegacyDocText(file, dependencies);
  throw new Error("Поддерживаются только файлы .docx и .doc.");
}
