const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export const DEEPSEEK_ATTEMPT_TIMEOUT_MS = 60_000;
export const DEEPSEEK_RETRIES = 1;
export const MIN_DEEPSEEK_ATTEMPT_BUDGET_MS = 1_000;

export class DeepSeekError extends Error {
  constructor(message, { status = 502, code = "deepseek_error" } = {}) { super(message); this.name = "DeepSeekError"; this.status = status; this.code = code; }
}

export function createDeepSeekClient({ apiKey, fetchImpl = fetch, url = "https://api.deepseek.com/chat/completions", model = "deepseek-v4-flash", timeoutMs = DEEPSEEK_ATTEMPT_TIMEOUT_MS, retries = DEEPSEEK_RETRIES, budget, logger = console.info } = {}) {
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY не задан в переменных окружения Vercel");
  return async function request(messages, { maxTokens = 4000, retries: requestRetries = retries, stage = "generation" } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
      const remainingMs = budget?.remainingMs() ?? timeoutMs;
      if (remainingMs < MIN_DEEPSEEK_ATTEMPT_BUDGET_MS) throw new DeepSeekError("Недостаточно времени для завершения генерации. Попробуйте снова.", { status: 504, code: "request_deadline" });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remainingMs));
      const startedAt = Date.now();
      let httpStatus = null;
      let hasChoices = false;
      let hasMessage = false;
      let hasContent = false;
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, temperature: 0, max_tokens: maxTokens }),
          signal: controller.signal,
        });
        httpStatus = response.status;
        if (!response.ok) {
          await response.text().catch(() => "");
          const error = new DeepSeekError(`DeepSeek API ответил ${response.status}. Попробуйте позже.`, { status: 502, code: `upstream_${response.status}` });
          if (!TRANSIENT_STATUS.has(response.status) || attempt === requestRetries) throw error;
          lastError = error;
          continue;
        }
        const data = await response.json();
        hasChoices = Array.isArray(data?.choices) && data.choices.length > 0;
        hasMessage = Boolean(data?.choices?.[0]?.message);
        hasContent = data?.choices?.[0]?.message?.content != null;
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) throw new DeepSeekError("DeepSeek вернул пустой ответ", { code: "empty_response" });
        return content;
      } catch (error) {
        const normalized = error?.name === "AbortError" ? new DeepSeekError("DeepSeek не ответил вовремя. Попробуйте позже.", { code: "timeout" }) : error;
        if (!(normalized instanceof DeepSeekError) || attempt === requestRetries || !["timeout", "empty_response"].includes(normalized.code)) throw normalized;
        lastError = normalized;
      } finally {
        clearTimeout(timer);
        try { logger({ event: "deepseek_attempt", stage, httpStatus, hasChoices, hasMessage, hasContent, durationMs: Date.now() - startedAt }); } catch {}
      }
    }
    throw lastError || new DeepSeekError("Не удалось получить ответ DeepSeek");
  };
}
