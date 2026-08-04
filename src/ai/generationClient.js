import { attachGenerationMetadata, decodeGenerationMetadataHeader } from "./generationMetadata.js";
import { requestErrorMessage } from "./requestErrors.js";

const REQUEST_TIMEOUT_MS = 55_000;

export async function generateEstimateRequest(payload, { fetchImpl = fetch, getAccessToken } = {}) {
  const resolveToken = getAccessToken || (async () => {
    const { supabase } = await import("../supabaseClient.js");
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error("Сессия недействительна. Войдите снова.");
    return data.session.access_token;
  });
  const token = await resolveToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl("/api/generate-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(requestErrorMessage(response.status, error.error));
    }
    const estimate = await response.json().catch(() => { throw new Error("Сервер вернул некорректный ответ. Попробуйте ещё раз."); });
    const metadata = decodeGenerationMetadataHeader(response.headers?.get?.("X-Kubiki-Generation-Metadata"));
    return attachGenerationMetadata(estimate, metadata);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(requestErrorMessage(504));
    if (error instanceof TypeError) throw new Error("Нет связи с сервером. Проверьте подключение и попробуйте снова.");
    throw error;
  } finally { clearTimeout(timer); }
}
