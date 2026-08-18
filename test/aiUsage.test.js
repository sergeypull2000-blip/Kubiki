import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_PRICING, MONTHLY_LIMIT_USD, estimateCostUsd, isPricingConfigured, PricingNotConfiguredError, UnknownModelError } from "../api/_lib/aiPricing.js";
import { UsageLimitError, createUsageRecorder, extractUsage } from "../api/_lib/aiUsage.js";

test("extractUsage reads both token field naming conventions and cache hit", () => {
  assert.deepEqual(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 20 } }), { input_tokens: 10, output_tokens: 20, cache_hit_tokens: 0 });
  assert.deepEqual(extractUsage({ usage: { input_tokens: 7, output_tokens: 9, prompt_cache_hit_tokens: 3 } }), { input_tokens: 7, output_tokens: 9, cache_hit_tokens: 3 });
  assert.equal(extractUsage({ usage: { total_tokens: 30 } }), null);
  assert.equal(extractUsage({}), null);
});

test("estimateCostUsd fails explicitly on unknown model", () => {
  assert.throws(() => estimateCostUsd("unknown-model", { input_tokens: 1, output_tokens: 1 }), UnknownModelError);
});

test("estimateCostUsd fails with pricing_not_configured while rates are null", () => {
  assert.throws(() => estimateCostUsd("deepseek-v4-flash", { input_tokens: 1000, output_tokens: 1000 }), PricingNotConfiguredError);
});

test("isPricingConfigured reflects null rates", () => {
  assert.equal(isPricingConfigured("deepseek-v4-flash"), false);
  assert.equal(isPricingConfigured("unknown-model"), false);
});

test("estimateCostUsd computes cache-aware peak/off-peak cost once rates are filled", () => {
  const original = AI_PRICING.models["deepseek-v4-flash"];
  AI_PRICING.models["deepseek-v4-flash"] = {
    inputCacheHitPerMillionTokens: 0.07,
    inputCacheMissPerMillionTokens: 0.14,
    outputPeakPerMillionTokens: 0.28,
    outputOffPeakPerMillionTokens: 0.14,
  };
  try {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_hit_tokens: 500_000 };
    // 12:00 UTC = 20:00 в Asia/Shanghai (peak)
    const peak = new Date("2026-08-18T12:00:00Z");
    assert.ok(Math.abs(estimateCostUsd("deepseek-v4-flash", usage, { now: peak }) - 0.385) < 1e-9);
    // 23:00 UTC = 07:00 следующего дня в Asia/Shanghai (off-peak)
    const offPeak = new Date("2026-08-18T23:00:00Z");
    assert.ok(Math.abs(estimateCostUsd("deepseek-v4-flash", usage, { now: offPeak }) - 0.245) < 1e-9);
  } finally {
    AI_PRICING.models["deepseek-v4-flash"] = original;
  }
});

test("MONTHLY_LIMIT_USD is five dollars", () => {
  assert.equal(MONTHLY_LIMIT_USD, 5);
});

test("monthly limit is enforced by assertAllowed", async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: [{ cost_usd: 4.9 }, { cost_usd: 0.2 }], error: null }) }) }) }) };
  const recorder = createUsageRecorder({ client, userId: "u1" });
  await assert.rejects(() => recorder.assertAllowed(), UsageLimitError);
});

test("usage recorder persists provider response and marks pricing_not_configured while rates are null", async () => {
  let inserted = null;
  const client = { from: (table) => { assert.equal(table, "ai_usage_events"); return { insert: (row) => { inserted = row; return Promise.resolve({ error: null, data: [row] }); } }; } };
  const recorder = createUsageRecorder({ client, userId: "u1" });
  const result = await recorder.record({ model: "deepseek-v4-flash", stage: "repair", data: { usage: { prompt_tokens: 120, completion_tokens: 30 } } });
  assert.equal(result.input_tokens, 120);
  assert.equal(result.pricingStatus, "pricing_not_configured");
  assert.equal(inserted.user_id, "u1");
  assert.equal(inserted.stage, "repair");
  assert.equal(inserted.input_tokens, 120);
  assert.equal(inserted.output_tokens, 30);
  assert.equal(inserted.pricing_status, "pricing_not_configured");
});

test("deepseek client records usage before content validation", () => {
  const source = readFileSync(new URL("../api/_lib/deepseek.js", import.meta.url), "utf8");
  assert.match(source, /usageGate\.record\(\{ model, stage, requestId, data \}\)/);
  assert.match(source, /usageGate\.assertAllowed\(\)/);
  const record = source.indexOf("usageGate.record");
  const validation = source.indexOf("message.content.missing");
  assert.ok(record >= 0 && validation > record, "usage must be recorded before content validation");
});

test("all model endpoints thread usage gating", () => {
  for (const path of ["../api/generate-estimate.js", "../api/edit-estimate.js", "../api/parse-excel.js"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /createUsageRecorder/);
  }
});
