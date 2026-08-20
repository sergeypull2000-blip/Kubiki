export const AI_SETTINGS_KEY = "kubiki_ai_settings_v1";
export const AI_SETTINGS_OWNER_KEY = "kubiki_ai_settings_server_user_v1";
export const MAX_PERSONALIZATION_CHARS = 8_000;
export const DEFAULT_AI_PERSONALIZATION = "Когда я называю исполнителя по имени, сначала ищи его в моей базе исполнителей";

const SECRET_ASSIGNMENT = /(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|service[_ -]?role(?:[_ -]?key)?|password|парол\p{L}*|секрет(?:ный)?[_ -]?(?:ключ|токен))\s*(?::|=|\bis\b)\s*\S+/iu;
const SECRET_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,})/u;

export function sanitizePersonalization(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => !SECRET_ASSIGNMENT.test(line) && !SECRET_VALUE.test(line)).join("\n").slice(0, MAX_PERSONALIZATION_CHARS);
}

export function normalizeAiSettings(value, { defaults = false } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const personalization = Object.hasOwn(source, "personalization") ? source.personalization : defaults ? DEFAULT_AI_PERSONALIZATION : "";
  const hasTemplatesChoice = Object.hasOwn(source, "useStudioTemplates") || Object.hasOwn(source, "use_studio_templates");
  /* Дефолт true — только для нового пользователя без сохранённых настроек. При сбое
     чтения из БД сервер обязан применять fail-closed настройки (useStudioTemplates: false)
     через failClosedServerAiSettings/loadServerAiSettings в api/_lib/aiSettings.js. */
  return { personalization: sanitizePersonalization(personalization), useProjectHistory: source.useProjectHistory === true || source.use_project_history === true, useStudioTemplates: hasTemplatesChoice ? (source.useStudioTemplates === true || source.use_studio_templates === true) : true };
}

export function loadLocalAiSettings(userId, storage = globalThis.localStorage) {
  if (!storage || storage.getItem(AI_SETTINGS_OWNER_KEY) && storage.getItem(AI_SETTINGS_OWNER_KEY) !== userId) return normalizeAiSettings(undefined, { defaults: true });
  const stored = storage.getItem(AI_SETTINGS_KEY);
  if (!stored) return normalizeAiSettings(undefined, { defaults: true });
  try { return normalizeAiSettings(JSON.parse(stored)); } catch { return normalizeAiSettings(undefined, { defaults: true }); }
}

export function saveLocalAiSettings(settings, userId, storage = globalThis.localStorage) {
  const value = normalizeAiSettings(settings);
  try { storage?.setItem(AI_SETTINGS_KEY, JSON.stringify(value)); if (userId) storage?.setItem(AI_SETTINGS_OWNER_KEY, userId); } catch { /* local fallback unavailable */ }
  return value;
}
