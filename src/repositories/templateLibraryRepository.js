import { supabase } from "../supabaseClient.js";
import { deserializeTemplateLibraryFromServer, serializeTemplateLibraryForServer } from "../templateLibrary.js";

function data(result, message) {
  if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error });
  return result.data;
}
function row(userId, library) {
  if (!userId) throw new Error("userId is required");
  const canonical = serializeTemplateLibraryForServer(library);
  return { user_id: userId, data_version: canonical.dataVersion, library_data: canonical };
}
function owned(value, userId) {
  if (!value || value.user_id !== userId) throw new Error("Библиотека шаблонов недоступна");
  return deserializeTemplateLibraryFromServer(value);
}

export function createTemplateLibraryRepository(client = supabase) {
  return {
    async loadTemplateLibrary(userId) {
      const result = await client.from("template_libraries").select("user_id,data_version,library_data,created_at,updated_at").eq("user_id", userId).maybeSingle();
      const value = data(result, "Не удалось загрузить библиотеку шаблонов");
      return value ? { exists: true, library: owned(value, userId) } : { exists: false, library: deserializeTemplateLibraryFromServer(null) };
    },
    async createTemplateLibrary(userId, library) { const result = await client.from("template_libraries").insert(row(userId, library)).select().single(); return owned(data(result, "Не удалось создать библиотеку шаблонов"), userId); },
    async updateTemplateLibrary(userId, library) { const payload = row(userId, library); const result = await client.from("template_libraries").update({ data_version: payload.data_version, library_data: payload.library_data }).eq("user_id", userId).select().single(); return owned(data(result, "Не удалось обновить библиотеку шаблонов"), userId); },
    async upsertTemplateLibrary(userId, library) { const result = await client.from("template_libraries").upsert(row(userId, library), { onConflict: "user_id" }).select().single(); return owned(data(result, "Не удалось сохранить библиотеку шаблонов"), userId); },
    async deleteTemplateLibrary(userId) { const result = await client.from("template_libraries").delete().eq("user_id", userId).select("user_id"); const deleted = data(result, "Не удалось удалить библиотеку шаблонов"); if (!deleted?.some((item) => item.user_id === userId)) throw new Error("Библиотека шаблонов не найдена"); return true; },
  };
}
export const templateLibraryRepository = createTemplateLibraryRepository();
