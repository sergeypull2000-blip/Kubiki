import { normalizeAiSettings } from "../../src/aiSettings.js";

export function normalizeServerAiSettings(value, options) {
  return normalizeAiSettings(value, options);
}

export async function loadOwnAiSettings(client, userId) {
  const result = await client.from("ai_settings").select("user_id,personalization,use_project_history,use_studio_templates").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("Не удалось загрузить настройки ИИ", { cause: result.error });
  if (!result.data) return normalizeServerAiSettings(undefined, { defaults: true });
  if (result.data.user_id !== userId) throw new Error("Настройки ИИ недоступны");
  return normalizeServerAiSettings(result.data);
}
