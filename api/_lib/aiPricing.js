/* ============================================================
   Единый источник правды по тарифам DeepSeek и лимиту Beta.

   Модель для Beta — только "deepseek-v4-flash". Тариф раскладывается на:
     - входные токены: cache-hit (дешевле) и cache-miss (полная цена);
     - выходные токены.

   Ставки задаются ТОЛЬКО server-side через переменные окружения Vercel:
     DEEPSEEK_FLASH_CACHE_HIT_PER_1M_USD
     DEEPSEEK_FLASH_CACHE_MISS_PER_1M_USD
     DEEPSEEK_FLASH_OUTPUT_PER_1M_USD
   (USD за 1 000 000 токенов). В бизнес-логике нет hardcoded цен.

   Если переменные отсутствуют или невалидны — стоимость НЕ считается,
   состояние помечается как "pricing_not_configured", система работает
   fail-safe (не блокирует генерацию), но никогда не молчит об этом.
   ============================================================ */

export const AI_PRICING_VERSION = 2;

// Лимит на одного пользователя в месяц по умолчанию, USD (Beta).
export const DEFAULT_MONTHLY_LIMIT_USD = 5;

const MODEL = "deepseek-v4-flash";

/* Явная ошибка: модель отсутствует в прайсе (unknown_model). */
export class UnknownModelError extends Error {
  constructor(model) { super(`Неизвестная модель в прайсе: ${model}`); this.name = "UnknownModelError"; this.code = "unknown_model"; }
}

/* Явная ошибка: ставки модели ещё не заданы в переменных окружения. */
export class PricingNotConfiguredError extends Error {
  constructor() { super("Ставки модели ещё не заданы в переменных окружения"); this.name = "PricingNotConfiguredError"; this.code = "pricing_not_configured"; }
}

/* Читает и валидирует ставки deepseek-v4-flash из process.env.
   Возвращает null, если хотя бы одна переменная отсутствует или невалидна. */
function readPricingRates(env = process.env) {
  const cacheHit = toNonNegativeNumber(env.DEEPSEEK_FLASH_CACHE_HIT_PER_1M_USD);
  const cacheMiss = toNonNegativeNumber(env.DEEPSEEK_FLASH_CACHE_MISS_PER_1M_USD);
  const output = toNonNegativeNumber(env.DEEPSEEK_FLASH_OUTPUT_PER_1M_USD);
  if (cacheHit == null || cacheMiss == null || output == null) return null;
  return { cacheHitPerMillionTokens: cacheHit, cacheMissPerMillionTokens: cacheMiss, outputPerMillionTokens: output };
}

function toNonNegativeNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

/* Полностью ли заданы ставки для модели (иначе — pricing_not_configured). */
export function isPricingConfigured(model = MODEL) {
  if (model !== MODEL) return false;
  return readPricingRates() != null;
}

/* Стоимость вызова в USD:
   prompt_cache_hit_tokens × cache_hit_rate
   + prompt_cache_miss_tokens × cache_miss_rate
   + output_tokens × output_rate.
   Бросает UnknownModelError / PricingNotConfiguredError вместо молчаливого null. */
export function estimateCostUsd(model, usage, { env = process.env } = {}) {
  if (model !== MODEL) throw new UnknownModelError(model);
  const rates = readPricingRates(env);
  if (!rates) throw new PricingNotConfiguredError();
  const inputTokens = Number(usage?.input_tokens || 0);
  const outputTokens = Number(usage?.output_tokens || 0);
  const hitTokens = Math.min(inputTokens, Number(usage?.cache_hit_tokens || 0));
  const missTokens = usage?.cache_miss_tokens != null ? Number(usage.cache_miss_tokens) : inputTokens - hitTokens;
  return (
    hitTokens * rates.cacheHitPerMillionTokens +
    missTokens * rates.cacheMissPerMillionTokens +
    outputTokens * rates.outputPerMillionTokens
  ) / 1_000_000;
}
