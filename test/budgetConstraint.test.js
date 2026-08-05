import test from "node:test";
import assert from "node:assert/strict";
import { runEstimateGeneration, sumTaskCosts, TARGET_BUDGET_WARNING_DEVIATION } from "../api/_lib/generationOrchestrator.js";
import { fallbackProfile, parseProfile } from "../api/_lib/profile.js";
import { createDeepSeekClient } from "../api/_lib/deepseek.js";

const lists = { projectTypes: [], deliverables: [], disciplines: [], pipelineStages: [], taskTerms: [], roleTerms: [], styleTerms: [], formats: [], platforms: [], constraints: [], keywords: [], complexity: "unknown", uncertainty: [], language: "ru" };
const profile = (budget) => JSON.stringify({ ...lists, budget });
const estimate = (costs, warnings = []) => JSON.stringify({ projectName: "Проект", stages: [{ name: "Работы", tasks: costs.map((cost, index) => ({ name: `Задача ${index + 1}`, cost })) }], warnings });

test("budget profile accepts hard, target and explicit none without inventing a fallback budget", () => {
  assert.deepEqual(parseProfile(profile({ amount: 1_000_000, currency: "RUB", mode: "hard" })).budget, { amount: 1_000_000, currency: "RUB", mode: "hard" });
  assert.deepEqual(parseProfile(profile({ amount: 900_000, currency: "rub", mode: "target" })).budget, { amount: 900_000, currency: "RUB", mode: "target" });
  assert.deepEqual(parseProfile(profile({ amount: null, currency: null, mode: "none" })).budget, { amount: null, currency: null, mode: "none" });
  assert.equal(fallbackProfile("Ролик без указанного бюджета").budget.mode, "none");
});

test("task costs are summed directly without markup or taxes", () => {
  assert.equal(sumTaskCosts(JSON.parse(estimate([100_000, 250_000]))), 350_000);
});

test("hard estimate within limit is accepted without correction and gets a separate constraint block", async () => {
  const calls = [];
  const responses = [profile({ amount: 1_000_000, currency: "RUB", mode: "hard" }), estimate([400_000, 500_000])];
  const result = await runEstimateGeneration({ brief: "Уложиться в миллион", systemPrompt: "ORIGINAL", requestModel: async (messages, options) => { calls.push({ messages, options }); return responses.shift(); } });
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages[1].content, /<budget_constraint>[\s\S]*сумма всех task\.cost[\s\S]*не должна превышать/);
  assert.equal(sumTaskCosts(result.estimate), 900_000);
});

test("hard overrun triggers exactly one no-retry correction and revalidates its total", async () => {
  const calls = [];
  const responses = [profile({ amount: 1_000_000, currency: "RUB", mode: "hard" }), estimate([700_000, 600_000]), estimate([500_000, 450_000], ["Сокращён объём работ"] )];
  const result = await runEstimateGeneration({ brief: "Не больше миллиона", systemPrompt: "ORIGINAL", remainingRequestMs: () => 60_000, requestModel: async (messages, options) => { calls.push({ messages, options }); return responses.shift(); } });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].options, { maxTokens: 4000, retries: 0, stage: "budget_correction" });
  assert.equal(calls[2].messages[0].content, "ORIGINAL");
  assert.match(calls[2].messages[1].content, /1 300 000 ₽/);
  assert.equal(sumTaskCosts(result.estimate), 950_000);
});

test("second hard overrun is returned with a clear warning", async () => {
  const responses = [profile({ amount: 1_000_000, currency: "RUB", mode: "hard" }), estimate([1_300_000]), estimate([1_100_000])];
  const result = await runEstimateGeneration({ brief: "Лимит миллион", systemPrompt: "ORIGINAL", remainingRequestMs: () => 60_000, requestModel: async () => responses.shift() });
  assert.equal(sumTaskCosts(result.estimate), 1_100_000);
  assert.match(result.estimate.warnings.join(" "), /лимит.*превышен/i);
});

test("hard correction is skipped when request budget is insufficient", async () => {
  let calls = 0;
  const responses = [profile({ amount: 1_000_000, currency: "RUB", mode: "hard" }), estimate([1_300_000])];
  const result = await runEstimateGeneration({ brief: "Лимит миллион", systemPrompt: "ORIGINAL", remainingRequestMs: () => 59_999, requestModel: async () => { calls += 1; return responses.shift(); } });
  assert.equal(calls, 2);
  assert.match(result.estimate.warnings.join(" "), /не хватило.*времени/i);
});

test("target budget never triggers correction and warns only beyond the fixed 20 percent threshold", async () => {
  assert.equal(TARGET_BUDGET_WARNING_DEVIATION, 0.2);
  let calls = 0;
  const responses = [profile({ amount: 1_000_000, currency: "RUB", mode: "target" }), estimate([700_000])];
  const result = await runEstimateGeneration({ brief: "Ориентир миллион", systemPrompt: "ORIGINAL", requestModel: async () => { calls += 1; return responses.shift(); } });
  assert.equal(calls, 2);
  assert.match(result.estimate.warnings.join(" "), /существенно отклоняется/);
});

test("budget correction transport disables thinking", async () => {
  let body;
  const client = createDeepSeekClient({ apiKey: "key", logger: () => {}, fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: estimate([900_000]) } }] }) };
  } });
  await client([], { stage: "budget_correction", retries: 0 });
  assert.deepEqual(body.thinking, { type: "disabled" });
});
