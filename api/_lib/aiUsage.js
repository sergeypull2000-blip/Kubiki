import { AI_PRICING_VERSION, MONTHLY_LIMIT_USD, estimateCostUsd, UnknownModelError, PricingNotConfiguredError } from "./aiPricing.js";

/* Специальная ошибка превышения месячного лимита — мапится в HTTP 429. */
export class UsageLimitError extends Error {
  constructor(message = "Лимит использования ИИ в этом месяце исчерпан", { code = "usage_limit_exceeded" } = {}) {
    super(message);
    this.name = "UsageLimitError";
    this.code = code;
    this.status = 429;
  }
}

/* Приводим произвольную форму data.usage к паре токенов. Поддерживаем
   как openai-стиль (prompt/completion_tokens), так и имена input/output. */
export function extractUsage(data) {
  const usage = data?.usage;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  if (!inputTokens && !outputTokens) return null;
  const cacheHitTokens = Number(usage.prompt_cache_hit_tokens ?? usage.input_cache_hit_tokens ?? 0) || 0;
  return { input_tokens: inputTokens, output_tokens: outputTokens, cache_hit_tokens: cacheHitTokens };
}

/* Начало текущего месяца в UTC — окно месячного лимита. */
export function monthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/* Запись использования и проверка лимита. Сервер оперирует от имени
   пользователя (JWT), поэтому RLS «только свои строки» соблюдается. */
export function createUsageRecorder({ client, userId }) {
  if (!client) throw new Error("Supabase client is required");
  if (!userId) throw new Error("User id is required");

  return {
    /* Проверка перед вызовом модели. Fail-open при ошибке чтения;
       бросает UsageLimitError только при уверенном превышении лимита. */
    async assertAllowed() {
      const result = await client.from("ai_usage_events")
        .select("cost_usd")
        .eq("user_id", userId)
        .gte("created_at", monthStartUtc());
      if (result.error) return { spentUsd: 0, limitUsd: MONTHLY_LIMIT_USD };
      const spentUsd = (result.data || []).reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
      if (spentUsd >= MONTHLY_LIMIT_USD) throw new UsageLimitError();
      return { spentUsd, limitUsd: MONTHLY_LIMIT_USD };
    },

    /* Запись события. Вызывается сразу после получения ответа провайдера,
       ДО валидации контента; считается и при retries/repair/budget_correction. */
    async record({ model, stage = "generation", requestId = null, data }) {
      const usage = extractUsage(data);
      if (!usage) return null;
      let costUsd = null;
      let pricingStatus = "ok";
      try {
        costUsd = estimateCostUsd(model, usage);
      } catch (error) {
        if (error instanceof UnknownModelError) pricingStatus = "unknown_model";
        else if (error instanceof PricingNotConfiguredError) pricingStatus = "pricing_not_configured";
        else throw error;
        console.error("[aiUsage] стоимость не учтена", { model, stage, pricingStatus, code: error.code });
      }
      const result = await client.from("ai_usage_events").insert({
        user_id: userId,
        model,
        stage,
        request_id: requestId,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd: costUsd,
        pricing_version: AI_PRICING_VERSION,
        pricing_status: pricingStatus,
      });
      if (result.error) {
        console.error("ai_usage_events insert failed", { name: result.error?.name || "Error", message: result.error?.message });
        return null;
      }
      return { ...usage, costUsd, pricingStatus };
    },
  };
}
