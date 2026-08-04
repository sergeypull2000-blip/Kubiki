import { createClient } from "@supabase/supabase-js";

function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(typeof header === "string" ? header.trim() : "");
  return match?.[1]?.trim() || "";
}

export function createServerSupabaseClient(token, env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function authenticateRequest(req, { createClientForToken = createServerSupabaseClient } = {}) {
  const token = bearerToken(req?.headers?.authorization);
  if (!token) return { ok: false, status: 401, error: "Требуется авторизация" };
  try {
    const client = createClientForToken(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id) return { ok: false, status: 401, error: "Сессия недействительна или истекла" };
    return { ok: true, token, user: data.user, client };
  } catch (error) {
    console.error("AI auth verification failed", { name: error?.name || "Error" });
    return { ok: false, status: 503, error: "Не удалось проверить сессию. Попробуйте позже" };
  }
}

