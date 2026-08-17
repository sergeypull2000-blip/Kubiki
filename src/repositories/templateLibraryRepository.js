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
function toLibrary(value, userId) {
  return value ? { exists: true, library: owned(value, userId) } : { exists: false, library: deserializeTemplateLibraryFromServer(null) };
}

// PostgREST rejects a JWT whose `iat` is ahead of the server clock with
// "JWT issued at future" (PGRST303). On a fresh startup this is transient:
// refreshing the session once and retrying the same request resolves it.
function isJwtIssuedAtFuture(result) {
  const error = result && result.error;
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return code === "PGRST303" || /issued at future/i.test(message);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createTemplateLibraryRepository(client, { retryDelayMs = 1500 } = {}) {
  if (!client) throw new Error("Supabase client is required");
  const queryTemplateLibrary = (userId) => client.from("template_libraries").select("user_id,data_version,library_data,created_at,updated_at").eq("user_id", userId).maybeSingle();

  async function loadTemplateLibrary(userId) {
    const result = await queryTemplateLibrary(userId);
    if (!isJwtIssuedAtFuture(result)) return toLibrary(data(result, "Не удалось загрузить библиотеку шаблонов"), userId);

    // One-time recovery for the transient "JWT issued at future" failure:
    // refresh the session once (best effort), wait briefly, then retry the
    // same request once. A failed refresh must not replace the load error,
    // so it is swallowed and the retry still runs.
    try {
      await client.auth?.refreshSession();
    } catch {
      // Ignore a failed refresh and proceed to the retry below.
    }
    await wait(retryDelayMs);
    return toLibrary(data(await queryTemplateLibrary(userId), "Не удалось загрузить библиотеку шаблонов"), userId);
  }

  return {
    loadTemplateLibrary,
    async createTemplateLibrary(userId, library) { const result = await client.from("template_libraries").insert(row(userId, library)).select().single(); return owned(data(result, "Не удалось создать библиотеку шаблонов"), userId); },
    async updateTemplateLibrary(userId, library) { const payload = row(userId, library); const result = await client.from("template_libraries").update({ data_version: payload.data_version, library_data: payload.library_data }).eq("user_id", userId).select().single(); return owned(data(result, "Не удалось обновить библиотеку шаблонов"), userId); },
    async upsertTemplateLibrary(userId, library) { const result = await client.from("template_libraries").upsert(row(userId, library), { onConflict: "user_id" }).select().single(); return owned(data(result, "Не удалось сохранить библиотеку шаблонов"), userId); },
    async deleteTemplateLibrary(userId) { const result = await client.from("template_libraries").delete().eq("user_id", userId).select("user_id"); const deleted = data(result, "Не удалось удалить библиотеку шаблонов"); if (!deleted?.some((item) => item.user_id === userId)) throw new Error("Библиотека шаблонов не найдена"); return true; },
  };
}
const withDefaultRepository = async (operation, ...args) => {
  const { supabase } = await import("../supabaseClient.js");
  return createTemplateLibraryRepository(supabase)[operation](...args);
};

export const templateLibraryRepository = {
  loadTemplateLibrary: (...args) => withDefaultRepository("loadTemplateLibrary", ...args),
  createTemplateLibrary: (...args) => withDefaultRepository("createTemplateLibrary", ...args),
  updateTemplateLibrary: (...args) => withDefaultRepository("updateTemplateLibrary", ...args),
  upsertTemplateLibrary: (...args) => withDefaultRepository("upsertTemplateLibrary", ...args),
  deleteTemplateLibrary: (...args) => withDefaultRepository("deleteTemplateLibrary", ...args),
};
