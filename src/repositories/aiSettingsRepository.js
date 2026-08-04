import { normalizeAiSettings } from "../aiSettings.js";

function data(result, message) { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; }
const row = (userId, settings) => { const value = normalizeAiSettings(settings); return { user_id: userId, personalization: value.personalization, use_project_history: value.useProjectHistory }; };
const owned = (value, userId) => { if (!value || value.user_id !== userId) throw new Error("Настройки ИИ недоступны"); return normalizeAiSettings(value); };

export function createAiSettingsRepository(client) {
  if (!client) throw new Error("Supabase client is required");
  return {
    async loadAiSettings(userId) {
      const result = await client.from("ai_settings").select("user_id,personalization,use_project_history,created_at,updated_at").eq("user_id", userId).maybeSingle();
      const value = data(result, "Не удалось загрузить настройки ИИ");
      return value ? { exists: true, settings: owned(value, userId) } : { exists: false, settings: normalizeAiSettings() };
    },
    async upsertAiSettings(userId, settings) {
      const result = await client.from("ai_settings").upsert(row(userId, settings), { onConflict: "user_id" }).select().single();
      return owned(data(result, "Не удалось сохранить настройки ИИ"), userId);
    },
  };
}

const withDefaultRepository = async (operation, ...args) => {
  const { supabase } = await import("../supabaseClient.js");
  return createAiSettingsRepository(supabase)[operation](...args);
};

export const aiSettingsRepository = {
  loadAiSettings: (...args) => withDefaultRepository("loadAiSettings", ...args),
  upsertAiSettings: (...args) => withDefaultRepository("upsertAiSettings", ...args),
};
