import { normalizeAiSettings } from "../../src/aiSettings.js";

export function normalizeServerAiSettings(value, options) {
  return normalizeAiSettings(value, options);
}

export async function loadOwnAiSettings(client, userId) {
  if (typeof client?.loadAiSettings === "function") {
    const row = await client.loadAiSettings(userId);
    return row ? normalizeServerAiSettings(row) : normalizeServerAiSettings(undefined, { defaults: true });
  }
  const result = await client.from("ai_settings").select("user_id,personalization,use_project_history,use_studio_templates").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("Не удалось загрузить настройки ИИ", { cause: result.error });
  if (!result.data) return normalizeServerAiSettings(undefined, { defaults: true });
  if (result.data.user_id !== userId) throw new Error("Настройки ИИ недоступны");
  return normalizeServerAiSettings(result.data);
}

/* Fail-closed настройки для сбоя чтения из БД: ошибка сервера не должна молча
   включать «шаблоны студии». Дефолт normalizeAiSettings (useStudioTemplates: true)
   применим только к новому пользователю без сохранённых настроек. */
export function failClosedServerAiSettings() {
  return normalizeAiSettings({ use_studio_templates: false }, { defaults: false });
}

/* Загрузка настроек с безопасным отказом: ошибка чтения логируется с деталями
   (включая cause.code PostgREST, например 42703) и превращается в fail-closed
   настройки вместо normalizeServerAiSettings() с useStudioTemplates=true. */
export async function loadServerAiSettings(client, userId, { logger = console } = {}) {
  try {
    return await loadOwnAiSettings(client, userId);
  } catch (error) {
    logger.error("AI settings loading failed", {
      name: error?.name || "Error",
      message: error?.message || String(error),
      code: error?.cause?.code || error?.code || "unknown",
      serverMessage: error?.cause?.message || undefined,
    });
    return failClosedServerAiSettings();
  }
}
