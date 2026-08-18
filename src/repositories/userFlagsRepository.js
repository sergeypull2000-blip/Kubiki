function data(result, message) { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; }

export function createUserFlagsRepository(client) {
  if (!client) throw new Error("Supabase client is required");
  return {
    async getFlags(userId) {
      const result = await client.from("user_flags").select("user_id,beta_welcome_seen,created_at,updated_at").eq("user_id", userId).maybeSingle();
      const value = data(result, "Не удалось загрузить флаги пользователя");
      return value && value.user_id === userId ? value : null;
    },
    async ensureFlags(userId) {
      // Создаём строку только если её ещё нет (свежая регистрация).
      const result = await client.from("user_flags").insert(
        { user_id: userId, beta_welcome_seen: false },
        { onConflict: "user_id", ignoreDuplicates: true },
      ).select().maybeSingle();
      return data(result, "Не удалось создать флаги пользователя");
    },
    async markBetaWelcomeSeen(userId) {
      const result = await client.from("user_flags").upsert(
        { user_id: userId, beta_welcome_seen: true },
        { onConflict: "user_id" },
      ).select().single();
      return data(result, "Не удалось сохранить флаги пользователя");
    },
  };
}

const withDefaultRepository = async (operation, ...args) => {
  const { supabase } = await import("../supabaseClient.js");
  return createUserFlagsRepository(supabase)[operation](...args);
};

export const userFlagsRepository = {
  getFlags: (...args) => withDefaultRepository("getFlags", ...args),
  ensureFlags: (...args) => withDefaultRepository("ensureFlags", ...args),
  markBetaWelcomeSeen: (...args) => withDefaultRepository("markBetaWelcomeSeen", ...args),
};
