import { presentationSettingsForPreset } from "../exportSettings.js";

const data = (result, message) => { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; };
const own = (row, userId) => { if (!row || row.user_id !== userId) throw new Error("Пресет экспорта недоступен"); return { id: row.id, name: row.name, settings: presentationSettingsForPreset(row.preset_json), createdAt: row.created_at, updatedAt: row.updated_at }; };
export function createExportPresetsRepository(client) {
  if (!client) throw new Error("Supabase client is required");
  return {
    async list(userId) { return data(await client.from("export_presets").select("*").eq("user_id", userId).order("updated_at", { ascending: false }), "Не удалось загрузить пресеты").map((row) => own(row, userId)); },
    async create(userId, name, settings) { return own(data(await client.from("export_presets").insert({ user_id: userId, name: String(name).trim(), preset_json: presentationSettingsForPreset(settings) }).select().single(), "Не удалось создать пресет"), userId); },
    async update(userId, id, name, settings) { return own(data(await client.from("export_presets").update({ name: String(name).trim(), preset_json: presentationSettingsForPreset(settings), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id).select().single(), "Не удалось обновить пресет"), userId); },
    async remove(userId, id) { const rows = data(await client.from("export_presets").delete().eq("user_id", userId).eq("id", id).select("id"), "Не удалось удалить пресет"); if (!rows?.length) throw new Error("Пресет не найден или недоступен"); return true; },
    async duplicate(userId, preset) { return this.create(userId, `${preset.name} — копия`, preset.settings); },
  };
}
