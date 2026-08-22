/* Бета-фидбэк: текстовые отзывы пользователей, вставляются из приложения
   в beta_feedback. RLS на таблице — только INSERT собственного фидбэка
   (auth.uid() = user_id); SELECT-запрос после INSERT не выполняется:
   insert-only политика заблокирует возврат строки. */

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
      });
      return data(result, "Не удалось отправить отзыв") ?? { ok: true };
    },
  };
}
