import { attachGenerationMetadata, decodeGenerationMetadataHeader } from "./generationMetadata.js";
import { requestErrorMessage } from "./requestErrors.js";
import { kubikiApiUrl, notifyKubikiUnauthorized } from "../backend/apiTransport.js";

export const GENERATION_REQUEST_TIMEOUT_MS = 270_000;

export async function generateEstimateRequest(payload, { fetchImpl = fetch, getAccessToken } = {}) {
  const token = getAccessToken ? await getAccessToken() : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(kubikiApiUrl("/api/generate-estimate"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      notifyKubikiUnauthorized(response.status);
      const body = await response.json().catch(() => ({}));
      const error = new Error(requestErrorMessage(response.status, body.error));
      if (typeof body.code === "string") error.code = body.code;
      if (typeof body.requestId === "string") error.requestId = body.requestId;
      throw error;
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
