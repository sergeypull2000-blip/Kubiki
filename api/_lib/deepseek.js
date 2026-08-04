const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class DeepSeekError extends Error {
  constructor(message, { status = 502, code = "deepseek_error" } = {}) { super(message); this.name = "DeepSeekError"; this.status = status; this.code = code; }
}

export function createDeepSeekClient({ apiKey, fetchImpl = fetch, url = "https://api.deepseek.com/chat/completions", model = "deepseek-v4-flash", timeoutMs = 20_000, retries = 1 } = {}) {
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY не задан в переменных окружения Vercel");
  return async function request(messages, { maxTokens = 4000 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, temperature: 0, max_tokens: maxTokens }),
          signal: controller.signal,
        });
        if (!response.ok) {
          await response.text().catch(() => "");
          const error = new DeepSeekError(`DeepSeek API ответил ${response.status}. Попробуйте позже.`, { status: 502, code: `upstream_${response.status}` });
          if (!TRANSIENT_STATUS.has(response.status) || attempt === retries) throw error;
          lastError = error;
          continue;
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) throw new DeepSeekError("DeepSeek вернул пустой ответ", { code: "empty_response" });
        return content;
      } catch (error) {
        const normalized = error?.name === "AbortError" ? new DeepSeekError("DeepSeek не ответил вовремя. Попробуйте позже.", { code: "timeout" }) : error;
        if (!(normalized instanceof DeepSeekError) || attempt === retries || !["timeout"].includes(normalized.code)) throw normalized;
        lastError = normalized;
      } finally { clearTimeout(timer); }
    }
    throw lastError || new DeepSeekError("Не удалось получить ответ DeepSeek");
  };
}

