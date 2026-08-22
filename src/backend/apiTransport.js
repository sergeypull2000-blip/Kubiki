export class KubikiApiError extends Error {
  constructor(status, code, body) {
    super(code || `HTTP ${status}`);
    this.name = "KubikiApiError";
    this.status = status;
    this.code = code || "request_failed";
    this.body = body;
  }
}

export function resolveKubikiApiBaseUrl(value = import.meta.env?.VITE_KUBIKI_API_BASE_URL) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function requestUrl(baseUrl, path) {
  if (!path.startsWith("/")) throw new TypeError("Kubiki API path must start with /");
  return `${baseUrl}${path}`;
}

export function kubikiApiUrl(path, baseUrl = resolveKubikiApiBaseUrl()) {
  return requestUrl(resolveKubikiApiBaseUrl(baseUrl), path);
}

export function notifyKubikiUnauthorized(status) {
  if (status === 401) globalThis.dispatchEvent?.(new Event("kubiki:unauthorized"));
}

async function responseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { throw new KubikiApiError(response.status, "invalid_json_response", { text }); }
}

export function createKubikiApiTransport({ baseUrl = resolveKubikiApiBaseUrl(), fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
  const normalizedBaseUrl = resolveKubikiApiBaseUrl(baseUrl);

  return async function kubikiApiRequest(path, options = {}) {
    const { json, headers: inputHeaders, ...requestOptions } = options;
    const headers = new Headers(inputHeaders);
    let body = requestOptions.body;
    if (json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(json);
    }

    const response = await fetchImpl(requestUrl(normalizedBaseUrl, path), {
      ...requestOptions,
      headers,
      body,
      credentials: "include",
    });
    const bodyValue = await responseBody(response);
    if (!response.ok) {
      const code = typeof bodyValue?.error === "string" ? bodyValue.error : "request_failed";
      notifyKubikiUnauthorized(response.status);
      throw new KubikiApiError(response.status, code, bodyValue);
    }
    return bodyValue;
  };
}

export const kubikiApiRequest = createKubikiApiTransport();
