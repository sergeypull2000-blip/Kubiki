export const AI_SETTINGS_KEY = "kubiki_ai_settings_v1";
export const AI_SETTINGS_OWNER_KEY = "kubiki_ai_settings_server_user_v1";
export const MAX_PERSONALIZATION_CHARS = 8_000;

const FORBIDDEN_LINE = /(?:ндс|налог\p{L}*|маркап\p{L}*|наценк\p{L}*|валют\p{L}*|курс валют|exportsettings|service[_ -]?role|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|секрет\p{L}*|парол\p{L}*|ставк(?:а|и|у|ой|е))|[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+?\d[\s().-]*){7,}|(?:^|\s)@[a-zA-Z0-9_]{3,}|https?:\/\//iu;

export function sanitizePersonalization(value) {
  return String(value ?? "").normalize("NFKC").replace(/\r\n?/g, "\n").split("\n").filter((line) => !FORBIDDEN_LINE.test(line)).join("\n").replace(/[\t ]{2,}/g, " ").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, MAX_PERSONALIZATION_CHARS);
}

export function normalizeAiSettings(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return { personalization: sanitizePersonalization(source.personalization), useProjectHistory: source.useProjectHistory === true || source.use_project_history === true };
}

export function loadLocalAiSettings(userId, storage = globalThis.localStorage) {
  if (!storage || storage.getItem(AI_SETTINGS_OWNER_KEY) && storage.getItem(AI_SETTINGS_OWNER_KEY) !== userId) return normalizeAiSettings();
  try { return normalizeAiSettings(JSON.parse(storage.getItem(AI_SETTINGS_KEY) || "{}")); } catch { return normalizeAiSettings(); }
}

export function saveLocalAiSettings(settings, userId, storage = globalThis.localStorage) {
  const value = normalizeAiSettings(settings);
  try { storage?.setItem(AI_SETTINGS_KEY, JSON.stringify(value)); if (userId) storage?.setItem(AI_SETTINGS_OWNER_KEY, userId); } catch { /* local fallback unavailable */ }
  return value;
}
