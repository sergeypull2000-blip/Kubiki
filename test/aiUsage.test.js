import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_MONTHLY_LIMIT_USD, estimateCostUsd, isPricingConfigured, PricingNotConfiguredError, UnknownModelError } from "../api/_lib/aiPricing.js";
import { UsageLimitError, createUsageRecorder, extractUsage, loadEffectiveLimit, usageCycleBounds } from "../api/_lib/aiUsage.js";

const PRICING_ENV = {
  DEEPSEEK_FLASH_CACHE_HIT_PER_1M_USD: "0.07",
  DEEPSEEK_FLASH_CACHE_MISS_PER_1M_USD: "0.14",
  DEEPSEEK_FLASH_OUTPUT_PER_1M_USD: "0.28",
};

async function withEnv(values, run) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const withPricingEnv = (run) => withEnv(PRICING_ENV, run);
const withoutPricingEnv = (run) => withEnv({
  DEEPSEEK_FLASH_CACHE_HIT_PER_1M_USD: undefined,
  DEEPSEEK_FLASH_CACHE_MISS_PER_1M_USD: undefined,
  DEEPSEEK_FLASH_OUTPUT_PER_1M_USD: undefined,
}, run);

/* Мок Supabase-клиента для quota-тестов: роутит по таблицам. */
function quotaClient({ limitRow = null, limitError = null, spent = [] } = {}) {
  const activeLimitRow = limitRow ? { cycle_anchor_at: new Date(Date.now() - 86400000).toISOString(), ...limitRow } : { cycle_anchor_at: new Date(Date.now() - 86400000).toISOString() };
  return {
    from(table) {
      if (table === "ai_usage_limits") {
        return { select: (columns) => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: columns === "cycle_anchor_at" ? activeLimitRow : limitRow, error: limitError }) }) }) };
      }
      if (table === "ai_usage_events") {
        return { select: () => ({ eq: () => ({ gte: () => ({ lt: () => Promise.resolve({ data: spent, error: null }) }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

test("usage cycles keep calendar-month anchor semantics across short months", () => {
  const anchor = "2026-01-31T14:37:00.000Z";
  assert.deepEqual(usageCycleBounds(anchor, "2026-02-15T00:00:00Z"), { startsAt: anchor, resetsAt: "2026-02-28T14:37:00.000Z" });
  assert.deepEqual(usageCycleBounds(anchor, "2026-03-15T00:00:00Z"), { startsAt: "2026-02-28T14:37:00.000Z", resetsAt: "2026-03-31T14:37:00.000Z" });
  assert.deepEqual(usageCycleBounds("2026-08-22T14:37:00Z", "2026-09-22T14:37:00Z"), { startsAt: "2026-09-22T14:37:00.000Z", resetsAt: "2026-10-22T14:37:00.000Z" });
});

test("extractUsage reads token field conventions and cache hit/miss", () => {
  assert.deepEqual(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 20 } }), { input_tokens: 10, output_tokens: 20, cache_hit_tokens: 0, cache_miss_tokens: 10 });
  assert.deepEqual(extractUsage({ usage: { input_tokens: 7, output_tokens: 9, prompt_cache_hit_tokens: 3, prompt_cache_miss_tokens: 4 } }), { input_tokens: 7, output_tokens: 9, cache_hit_tokens: 3, cache_miss_tokens: 4 });
  assert.equal(extractUsage({ usage: { total_tokens: 30 } }), null);
  assert.equal(extractUsage({}), null);
});

test("estimateCostUsd fails explicitly on unknown model", () => {
  assert.throws(() => estimateCostUsd("unknown-model", { input_tokens: 1, output_tokens: 1 }), UnknownModelError);
});

test("estimateCostUsd fails with pricing_not_configured while env missing", async () => {
  await withoutPricingEnv(() => {
    assert.throws(() => estimateCostUsd("deepseek-v4-flash", { input_tokens: 1000, output_tokens: 1000 }), PricingNotConfiguredError);
  });
});

test("estimateCostUsd fails with pricing_not_configured when env invalid", async () => {
  await withEnv({ ...PRICING_ENV, DEEPSEEK_FLASH_OUTPUT_PER_1M_USD: "not-a-number" }, () => {
    assert.throws(() => estimateCostUsd("deepseek-v4-flash", { input_tokens: 1000, output_tokens: 1000 }), PricingNotConfiguredError);
  });
});

test("isPricingConfigured reflects env presence and unknown model", async () => {
  assert.equal(isPricingConfigured("unknown-model"), false);
  await withPricingEnv(() => {
    assert.equal(isPricingConfigured("deepseek-v4-flash"), true);
  });
  await withoutPricingEnv(() => {
    assert.equal(isPricingConfigured("deepseek-v4-flash"), false);
  });
});

test("estimateCostUsd computes cache-aware cost from env rates", async () => {
  await withPricingEnv(() => {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_hit_tokens: 500_000, cache_miss_tokens: 500_000 };
    // 500k*0.07 + 500k*0.14 + 1M*0.28 = 0.035 + 0.07 + 0.28 = 0.385
    assert.ok(Math.abs(estimateCostUsd("deepseek-v4-flash", usage) - 0.385) < 1e-9);
  });
});

test("estimateCostUsd derives cache miss from input minus hit when miss not reported", async () => {
  await withPricingEnv(() => {
    const usage = { input_tokens: 1_000_000, output_tokens: 0, cache_hit_tokens: 500_000 };
    // miss = 500k → 500k*0.07 + 500k*0.14 = 0.035 + 0.07 = 0.105
    assert.ok(Math.abs(estimateCostUsd("deepseek-v4-flash", usage) - 0.105) < 1e-9);
  });
});

test("DEFAULT_MONTHLY_LIMIT_USD is five dollars", () => {
  assert.equal(DEFAULT_MONTHLY_LIMIT_USD, 5);
});

test("loadEffectiveLimit falls back to default when row missing or error", async () => {
  assert.deepEqual(await loadEffectiveLimit(quotaClient({ limitRow: null }), "u1"), { limitUsd: 5, unlimited: false });
  assert.deepEqual(await loadEffectiveLimit(quotaClient({ limitRow: null, limitError: { message: "boom" } }), "u1"), { limitUsd: 5, unlimited: false });
});

test("loadEffectiveLimit reads override and unlimited rows", async () => {
  assert.deepEqual(await loadEffectiveLimit(quotaClient({ limitRow: { monthly_limit_usd: 20, unlimited: false } }), "u1"), { limitUsd: 20, unlimited: false });
  assert.deepEqual(await loadEffectiveLimit(quotaClient({ limitRow: { monthly_limit_usd: 5, unlimited: true } }), "u1"), { limitUsd: null, unlimited: true });
});

test("assertAllowed enforces default five-dollar limit when no override", async () => {
  const recorder = createUsageRecorder({ client: quotaClient({ spent: [{ cost_usd: 4.9 }, { cost_usd: 0.2 }] }), userId: "u1" });
  await assert.rejects(() => recorder.assertAllowed(), UsageLimitError);
});

test("assertAllowed enforces a custom override limit", async () => {
  const recorder = createUsageRecorder({ client: quotaClient({ limitRow: { monthly_limit_usd: 20, unlimited: false }, spent: [{ cost_usd: 20 }] }), userId: "u1" });
  await assert.rejects(() => recorder.assertAllowed(), UsageLimitError);
});

test("assertAllowed allows usage under a custom override limit", async () => {
  const recorder = createUsageRecorder({ client: quotaClient({ limitRow: { monthly_limit_usd: 20, unlimited: false }, spent: [{ cost_usd: 19.9 }] }), userId: "u1" });
  const result = await recorder.assertAllowed();
  assert.equal(result.limitUsd, 20);
  assert.equal(result.unlimited, false);
});

test("assertAllowed never blocks unlimited users", async () => {
  const recorder = createUsageRecorder({ client: quotaClient({ limitRow: { monthly_limit_usd: 5, unlimited: true }, spent: [{ cost_usd: 9999 }] }), userId: "u1" });
  const result = await recorder.assertAllowed();
  assert.equal(result.unlimited, true);
  assert.equal(result.limitUsd, null);
});

test("usage recorder persists provider response and marks pricing_not_configured while env missing", async () => {
  await withoutPricingEnv(async () => {
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
});

test("only a successful billable usage commit initializes the persistent cycle", async () => {
  await withPricingEnv(async () => {
    let commits = 0;
    const client = { rpc: async (name) => { assert.equal(name, "commit_ai_usage"); commits += 1; return { error: null }; } };
    const recorder = createUsageRecorder({ client, userId: "u1" });
    await recorder.release();
    assert.equal(commits, 0, "failed/released requests must not initialize a cycle");
    await recorder.record({ model: "deepseek-v4-flash", data: { usage: { prompt_tokens: 1, completion_tokens: 1 } } });
    assert.equal(commits, 1);
  });
});

test("OpenAI-compatible client records usage before content validation", () => {
  const source = readFileSync(new URL("../api/_lib/openAiCompatibleProvider.js", import.meta.url), "utf8");
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
