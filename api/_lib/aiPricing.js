/* ============================================================
   Единый источник правды по тарифам DeepSeek и лимиту Beta.

   Модель для Beta — только "deepseek-v4-flash". Тариф раскладывается на:
     - входные токены: cache-hit (дешевле) и cache-miss (полная цена);
     - выходные токены: peak (день) и off-peak (ночь, со скидкой);
     - effectiveFrom (дата вступления в силу) и providerTimezone (для
       определения peak/off-peak окна по времени провайдера).

   Ставки заполняются реальными значениями провайдера ПЕРЕД деплоем.
   Пока ставки не заданы (null) — стоимость НЕ считается, состояние
   помечается как "pricing_not_configured", система работает fail-safe
   (не блокирует генерацию), но никогда не молчит об этом.
   ============================================================ */

export const AI_PRICING_VERSION = 1;

// Лимит на одного пользователя в месяц, USD (Beta).
export const MONTHLY_LIMIT_USD = 5;

/* Явная ошибка: модель отсутствует в прайс-конфиге (unknown_model). */
export class UnknownModelError extends Error {
  constructor(model) { super(`Неизвестная модель в прайсе: ${model}`); this.name = "UnknownModelError"; this.code = "unknown_model"; }
}

/* Явная ошибка: ставки модели ещё не заполнены перед деплоем. */
export class PricingNotConfiguredError extends Error {
  constructor() { super("Ставки модели ещё не заполнены"); this.name = "PricingNotConfiguredError"; this.code = "pricing_not_configured"; }
}

export const AI_PRICING = {
  version: AI_PRICING_VERSION,
  effectiveFrom: "2026-08-18",
  providerTimezone: "Asia/Shanghai", // часовой пояс провайдера (UTC+8)
  peak: { startHour: 8, endHour: 22 }, // peak-окно в локальном времени провайдера
  // Цена за 1 000 000 токенов, USD. TODO(deploy): заполнить перед релизом.
  models: {
    "deepseek-v4-flash": {
      inputCacheHitPerMillionTokens: null,
      inputCacheMissPerMillionTokens: null,
      outputPeakPerMillionTokens: null,
      outputOffPeakPerMillionTokens: null,
    },
  },
};

/* Час суток в часовом поясе провайдера (для peak/off-peak). */
function providerHour(now, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).formatToParts(now);
  const part = parts.find((item) => item.type === "hour");
  return part ? Number(part.value) : 12;
}

function isPeak(now, pricing) {
  const hour = providerHour(now, pricing.providerTimezone);
  return hour >= pricing.peak.startHour && hour < pricing.peak.endHour;
}

/* Полностью ли заполнены ставки для модели (иначе — pricing_not_configured). */
export function isPricingConfigured(model = "deepseek-v4-flash") {
  const rates = AI_PRICING.models[model];
  if (!rates) return false;
  return [rates.inputCacheHitPerMillionTokens, rates.inputCacheMissPerMillionTokens, rates.outputPeakPerMillionTokens, rates.outputOffPeakPerMillionTokens]
    .every((value) => value != null);
}

/* Стоимость вызова. Бросает UnknownModelError / PricingNotConfiguredError
   вместо молчаливого null — состояние всегда явное. */
export function estimateCostUsd(model, usage, { now = new Date() } = {}) {
  const rates = AI_PRICING.models[model];
  if (!rates) throw new UnknownModelError(model);
  if ([rates.inputCacheHitPerMillionTokens, rates.inputCacheMissPerMillionTokens, rates.outputPeakPerMillionTokens, rates.outputOffPeakPerMillionTokens]
    .some((value) => value == null)) {
    throw new PricingNotConfiguredError();
  }
  const inputTokens = Number(usage?.input_tokens || 0);
  const outputTokens = Number(usage?.output_tokens || 0);
  const hitTokens = Math.min(inputTokens, Number(usage?.cache_hit_tokens || 0));
  const missTokens = inputTokens - hitTokens;
  const outputRate = isPeak(now, AI_PRICING) ? rates.outputPeakPerMillionTokens : rates.outputOffPeakPerMillionTokens;
  return (
    hitTokens * rates.inputCacheHitPerMillionTokens +
    missTokens * rates.inputCacheMissPerMillionTokens +
    outputTokens * outputRate
  ) / 1_000_000;
}
