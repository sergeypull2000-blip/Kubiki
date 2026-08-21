import { AI_PRICING_VERSION, DEFAULT_MONTHLY_LIMIT_USD, estimateCostUsd, UnknownModelError, PricingNotConfiguredError } from "./aiPricing.js";

/* Специальная ошибка превышения месячного лимита — мапится в HTTP 429. */
export class UsageLimitError extends Error {
  constructor(message = "Лимит использования ИИ в этом месяце исчерпан", { code = "usage_limit_exceeded" } = {}) {
    super(message);
    this.name = "UsageLimitError";
    this.code = code;
    this.status = 429;
  }
}

/* Приводим произвольную форму data.usage к набору токенов. Поддерживаем
   как openai-стиль (prompt/completion_tokens), так и имена input/output,
   а также явные поля cache-hit/cache-miss провайдера. */
export function extractUsage(data) {
  const usage = data?.usage;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  if (!inputTokens && !outputTokens) return null;
  const cacheHitTokens = Number(usage.prompt_cache_hit_tokens ?? usage.input_cache_hit_tokens ?? 0) || 0;
  const cacheMissTokens = Number(usage.prompt_cache_miss_tokens ?? usage.input_cache_miss_tokens ?? (inputTokens - cacheHitTokens)) || 0;
  return { input_tokens: inputTokens, output_tokens: outputTokens, cache_hit_tokens: cacheHitTokens, cache_miss_tokens: cacheMissTokens };
}

/* Начало текущего месяца в UTC — окно месячного лимита. */
export function monthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/* Эффективный месячный лимит пользователя из ai_usage_limits.
   Строки нет или ошибка чтения → дефолт DEFAULT_MONTHLY_LIMIT_USD (fail-open).
   unlimited=true → лимит не применяется (limitUsd = null). */
export async function loadEffectiveLimit(client, userId) {
  const fallback = { limitUsd: DEFAULT_MONTHLY_LIMIT_USD, unlimited: false };
  if (!client || !userId) return fallback;
  if (typeof client.loadEffectiveLimit === "function") {
    try { return await client.loadEffectiveLimit(userId); } catch { return fallback; }
  }
  const result = await client.from("ai_usage_limits")
    .select("monthly_limit_usd, unlimited")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error || !result.data) return fallback;
  const unlimited = Boolean(result.data.unlimited);
  const monthlyLimitUsd = Number(result.data.monthly_limit_usd);
  const valid = Number.isFinite(monthlyLimitUsd) && monthlyLimitUsd >= 0;
  return {
    limitUsd: unlimited ? null : (valid ? monthlyLimitUsd : DEFAULT_MONTHLY_LIMIT_USD),
    unlimited,
  };
}

/* Запись использования и проверка лимита. Сервер оперирует от имени
   пользователя (JWT), поэтому RLS «только свои строки» соблюдается. */
export function createUsageRecorder({ client, userId }) {
  if (!client) throw new Error("Server data client is required");
  if (!userId) throw new Error("User id is required");
  let reservationId = null;

  return {
    /* Проверка перед вызовом модели. Fail-open при ошибке чтения;
       бросает UsageLimitError только при уверенном превышении лимита. */
    async assertAllowed() {
      if (typeof client.reserve === "function") {
        if (reservationId) return { acquired: true };
        const reservation = await client.reserve(userId, monthStartUtc());
        if (!reservation.acquired) throw new UsageLimitError();
        reservationId = reservation.reservationId;
        return reservation;
      }
      const limit = await loadEffectiveLimit(client, userId);
      if (limit.unlimited) return { spentUsd: 0, limitUsd: null, unlimited: true };
      const result = await client.from("ai_usage_events")
        .select("cost_usd")
        .eq("user_id", userId)
        .gte("created_at", monthStartUtc());
      if (result.error) return { spentUsd: 0, limitUsd: limit.limitUsd, unlimited: false };
      const spentUsd = (result.data || []).reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
      if (spentUsd >= limit.limitUsd) throw new UsageLimitError();
      return { spentUsd, limitUsd: limit.limitUsd, unlimited: false };
    },

    /* Запись события. Вызывается сразу после получения ответа провайдера,
       ДО валидации контента; считается и при retries/repair/budget_correction. */
    async record({ model, stage = "generation", requestId = null, data }) {
      const usage = extractUsage(data);
      if (!usage) { await this.release(); return null; }
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
      if (typeof client.record === "function") {
        const currentReservation = reservationId;
        reservationId = null;
        try {
          const persisted = await client.record(userId, currentReservation, {
            model, stage, requestId, inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens, costUsd,
            pricingVersion: AI_PRICING_VERSION, pricingStatus,
          });
          return persisted ? { ...usage, costUsd, pricingStatus } : null;
        } catch (error) {
          console.error("ai_usage_events insert failed", { name: error?.name || "Error" });
          return null;
        }
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
    async release() {
      const currentReservation = reservationId;
      reservationId = null;
      if (currentReservation && typeof client.release === "function") {
        await client.release(userId, currentReservation).catch(() => {});
      }
    },
  };
}
