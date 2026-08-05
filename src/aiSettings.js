export const AI_SETTINGS_KEY = "kubiki_ai_settings_v1";
export const AI_SETTINGS_OWNER_KEY = "kubiki_ai_settings_server_user_v1";
export const MAX_PERSONALIZATION_CHARS = 8_000;

const SECRET_ASSIGNMENT = /(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|service[_ -]?role(?:[_ -]?key)?|password|парол\p{L}*|секрет(?:ный)?[_ -]?(?:ключ|токен))\s*(?::|=|\bis\b)\s*\S+/iu;
const SECRET_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,})/u;

export function sanitizePersonalization(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => !SECRET_ASSIGNMENT.test(line) && !SECRET_VALUE.test(line)).join("\n").slice(0, MAX_PERSONALIZATION_CHARS);
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
