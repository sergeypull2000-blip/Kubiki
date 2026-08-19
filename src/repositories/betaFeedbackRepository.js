/* Бета-фидбэк: текстовые отзывы пользователей, вставляются из приложения
   в beta_feedback. RLS на таблице — только INSERT собственного фидбэка
   (auth.uid() = user_id); SELECT клиент не делает. */

function data(result, message) { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; }

export function createBetaFeedbackRepository(client) {
  if (!client) throw new Error("Supabase client is required");
  return {
    async insert({ userId, message, context = null, projectId = null, sheetId = null }) {
      const result = await client.from("beta_feedback").insert({
        user_id: userId,
        message,
        context: context || null,
        project_id: projectId || null,
        sheet_id: sheetId || null,
      }).select("id,created_at").single();
      return data(result, "Не удалось отправить отзыв");
    },
  };
}

const withDefaultRepository = async (operation, ...args) => {
  const { supabase } = await import("../supabaseClient.js");
  return createBetaFeedbackRepository(supabase)[operation](...args);
};

export const betaFeedbackRepository = {
  insert: (...args) => withDefaultRepository("insert", ...args),
};
