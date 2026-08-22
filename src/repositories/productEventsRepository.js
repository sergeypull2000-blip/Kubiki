/* Product analytics — отдельно от биллинг-метрики ai_usage_events.
   Здесь события уровня «действие пользователя» (ai_generate / ai_edit),
   а не уровня «вызов модели». */

function data(result, message) { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; }

// sessionStorage-маркер, скоуп по user_id: максимум одно session_active на сессию браузера.
export const sessionActiveKey = (userId) => `kubiki:session_active:${userId}`;

export function createProductEventsRepository(client) {
  if (!client) throw new Error("Supabase client is required");
  return {
    async track(userId, eventType, meta = {}, metadata = {}) {
      const result = await client.from("product_events").insert({
        user_id: userId,
        event_type: eventType,
        request_id: meta.requestId || null,
        session_id: meta.sessionId || null,
        metadata: metadata || {},
      }).select("id,event_type,created_at").single();
      return data(result, "Не удалось записать событие продукта");
    },
    async trackSessionActive(userId) {
      const key = sessionActiveKey(userId);
      try {
        if (sessionStorage.getItem(key)) return null;
        sessionStorage.setItem(key, "1");
      } catch {}
      return this.track(userId, "session_active");
    },
  };
}
