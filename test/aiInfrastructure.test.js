import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { authenticateRequest } from "../api/_lib/auth.js";
import { MAX_BRIEF_CHARS, cleanPlainText, validateGenerationInput } from "../api/_lib/brief.js";
import { createDeepSeekClient, DEEPSEEK_ATTEMPT_TIMEOUT_MS, DEEPSEEK_RETRIES, DeepSeekError } from "../api/_lib/deepseek.js";
import { parseEstimate } from "../api/_lib/estimateSchema.js";
import { runEstimateGeneration } from "../api/_lib/generationOrchestrator.js";
import { fallbackProfile, parseProfile } from "../api/_lib/profile.js";
import { createRequestBudget, GENERATION_FUNCTION_BUDGET_MS, RequestDeadlineError } from "../api/_lib/requestBudget.js";

const validProfile = () => JSON.stringify({ projectTypes: ["3D"], deliverables: [], disciplines: ["CG"], pipelineStages: [], taskTerms: ["Моделинг"], roleTerms: [], styleTerms: [], formats: [], platforms: [], constraints: [], keywords: ["продукт"], complexity: "medium", uncertainty: [], language: "ru" });
const validEstimate = () => JSON.stringify({ projectName: "Проект", stages: [{ name: "CG", tasks: [{ name: "Моделинг", cost: 100000 }] }], warnings: [] });

test("AI auth rejects missing token and verifies bearer JWT with getUser", async () => {
  assert.equal((await authenticateRequest({ headers: {} })).status, 401);
  let receivedToken = "";
  const result = await authenticateRequest({ headers: { authorization: "Bearer user-jwt" } }, {
    createClientForToken(token) {
      receivedToken = token;
      return { auth: { getUser: async (jwt) => ({ data: { user: { id: jwt === token ? "u1" : "" } }, error: null }) } };
    },
  });
  assert.equal(receivedToken, "user-jwt");
  assert.equal(result.ok, true);
  assert.equal(result.user.id, "u1");
});

test("AI auth rejects invalid JWT and maps verifier outage without exposing details", async () => {
  const invalid = await authenticateRequest({ headers: { authorization: "Bearer bad" } }, { createClientForToken: () => ({ auth: { getUser: async () => ({ data: {}, error: new Error("bad") }) } }) });
  assert.equal(invalid.status, 401);
  const unavailable = await authenticateRequest({ headers: { authorization: "Bearer jwt" } }, { createClientForToken: () => { throw new Error("secret connection detail"); } });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(unavailable.error, /secret/);
});

test("brief cleanup is deterministic and request limits are enforced", () => {
  assert.equal(cleanPlainText("  A\u0000\t  B\r\n\r\n\r\n\r\nC  "), "A B\n\n\nC");
  assert.equal(validateGenerationInput({ description: "  brief " }).brief, "brief");
  assert.equal(validateGenerationInput({ description: "" }).status, 400);
  assert.equal(validateGenerationInput({ description: "x".repeat(MAX_BRIEF_CHARS + 1) }).status, 413);
});

test("profile parser accepts only bounded schema and fallback stays deterministic", () => {
  assert.equal(parseProfile(validProfile()).complexity, "medium");
  assert.equal(parseProfile('{"projectTypes":[]}'), null);
  assert.deepEqual(fallbackProfile("Видео продукт продукт анимация"), fallbackProfile("Видео продукт продукт анимация"));
  assert.deepEqual(fallbackProfile("Видео продукт продукт анимация").keywords, ["видео", "продукт", "анимация"]);
});

test("estimate parser enforces current schema and safety bounds", () => {
  assert.equal(parseEstimate(validEstimate()).stages[0].tasks[0].cost, 100000);
  assert.equal(parseEstimate(JSON.stringify({ projectName: "X", stages: [], warnings: [] })), null);
  assert.equal(parseEstimate(JSON.stringify({ projectName: "X", stages: [{ name: "S", tasks: [{ name: "T", cost: 1000000001 }] }], warnings: [] })), null);
});

test("orchestrator performs analysis then final generation on normal path", async () => {
  const calls = [];
  const responses = [validProfile(), validEstimate()];
  const result = await runEstimateGeneration({ brief: "3D ролик", instruction: "Без звука", systemPrompt: "ORIGINAL", requestModel: async (messages, options) => { calls.push({ messages, options }); return responses.shift(); } });
  assert.equal(calls.length, 2);
  assert.match(calls[0].messages[0].content, /анализируешь бриф/);
  assert.equal(calls[0].options.maxTokens, 900);
  assert.equal(calls[1].messages[0].content, "ORIGINAL");
  assert.match(calls[1].messages[1].content, /<brief>/);
  assert.match(calls[1].messages[1].content, /<current_user_instruction>/);
  assert.match(calls[1].messages[1].content, /<studio_knowledge>/);
  assert.match(calls[1].messages[1].content, /Не назначай исполнителей/);
  assert.equal(result.estimate.projectName, "Проект");
  assert.equal(result.profileFallbackUsed, false);
});

test("orchestrator inserts deterministic shortlist only into final request", async () => {
  const calls = [];
  const shortlist = { projectTemplates: [], stageTemplates: [], taskTemplates: [{ ref: "taskTemplate:t", name: "Моделинг" }], performers: [] };
  const result = await runEstimateGeneration({ brief: "3D", systemPrompt: "ORIGINAL", requestModel: async (messages) => { calls.push(messages); return calls.length === 1 ? validProfile() : validEstimate(); }, getKnowledgeContext: async (profile) => { assert.equal(profile.complexity, "medium"); return shortlist; } });
  assert.doesNotMatch(calls[0][1].content, /taskTemplate/);
  assert.match(calls[1][1].content, /taskTemplate:t/);
  assert.deepEqual(result.shortlist, shortlist);
});

test("personalization is absent from analysis and mandatory in final prompt", async () => {
  const calls = [];
  await runEstimateGeneration({ brief: "Brief", systemPrompt: "ORIGINAL", requestModel: async (messages) => { calls.push(messages); return calls.length === 1 ? validProfile() : validEstimate(); }, getGenerationContext: async () => ({ personalization: "Не дробить задачи", shortlist: { projectTemplates: [], stageTemplates: [], taskTemplates: [], performers: [], historicalProjects: [] } }) });
  assert.doesNotMatch(calls[0][1].content, /Не дробить задачи|ai_personalization/);
  assert.match(calls[1][1].content, /<ai_personalization>\nНе дробить задачи/);
});

test("multiline financial personalization is passed unchanged only to the second model request", async () => {
  const calls = [];
  const personalization = "Этапы дроби подробно\n\nДля всех исполнителей добавлять 6% налога\nСтавки брать из карточек";
  await runEstimateGeneration({ brief: "Brief", systemPrompt: "ORIGINAL", requestModel: async (messages) => { calls.push(messages); return calls.length === 1 ? validProfile() : validEstimate(); }, getGenerationContext: async () => ({ personalization, shortlist: { projectTemplates: [], stageTemplates: [], taskTemplates: [], performers: [], historicalProjects: [] } }) });
  assert.doesNotMatch(calls[0][1].content, /6% налога|ai_personalization/);
  assert.match(calls[1][1].content, new RegExp(`<ai_personalization>\\n${personalization}\\n</ai_personalization>`));
});

test("analysis failure uses deterministic fallback without blocking final generation", async () => {
  let call = 0;
  const result = await runEstimateGeneration({ brief: "Продуктовая анимация", systemPrompt: "ORIGINAL", requestModel: async () => { call += 1; if (call === 1) throw new DeepSeekError("analysis failed"); return validEstimate(); } });
  assert.equal(call, 2);
  assert.equal(result.profileFallbackUsed, true);
  assert.ok(result.profile.keywords.length > 0);
  assert.ok(result.estimate);
});

test("invalid final JSON receives exactly one repair attempt", async () => {
  const responses = [validProfile(), "not-json", validEstimate()];
  const calls = [];
  const result = await runEstimateGeneration({ brief: "Brief", systemPrompt: "ORIGINAL", requestModel: async (messages, options) => { calls.push({ messages, options }); return responses.shift(); } });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].messages.at(-2).role, "assistant");
  assert.equal(calls[2].options.retries, 0);
  assert.ok(result.estimate);
});

test("DeepSeek transport retries transient status once and does not log response body", async () => {
  let calls = 0;
  const client = createDeepSeekClient({ apiKey: "server-key", retries: 1, fetchImpl: async (_url, init) => {
    calls += 1;
    assert.equal(init.headers.Authorization, "Bearer server-key");
    if (calls === 1) return { ok: false, status: 503, text: async () => "sensitive upstream body" };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }] }) };
  } });
  assert.equal(await client([], { maxTokens: 10 }), "{}");
  assert.equal(calls, 2);
});

test("DeepSeek retries an empty response once and returns the second valid response", async () => {
  const logs = [];
  const responses = [
    { choices: [{ message: { content: "" } }] },
    { choices: [{ message: { content: validEstimate() } }] },
  ];
  const client = createDeepSeekClient({ apiKey: "key", logger: (entry) => logs.push(entry), fetchImpl: async () => ({ ok: true, status: 200, json: async () => responses.shift() }) });
  assert.equal(await client([], { stage: "generation" }), validEstimate());
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map(({ stage, httpStatus, hasChoices, hasMessage, hasContent }) => ({ stage, httpStatus, hasChoices, hasMessage, hasContent })), [
    { stage: "generation", httpStatus: 200, hasChoices: true, hasMessage: true, hasContent: true },
    { stage: "generation", httpStatus: 200, hasChoices: true, hasMessage: true, hasContent: true },
  ]);
  assert.equal(Object.hasOwn(logs[0], "durationMs"), true);
  assert.equal(JSON.stringify(logs).includes(validEstimate()), false);
});

test("DeepSeek returns empty_response when both bounded attempts are empty", async () => {
  let calls = 0;
  const client = createDeepSeekClient({ apiKey: "key", logger: () => {}, fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "   " } }] }) }; } });
  await assert.rejects(() => client([], { stage: "generation" }), (error) => error instanceof DeepSeekError && error.code === "empty_response" && /пустой ответ/i.test(error.message));
  assert.equal(calls, 2);
});

test("empty profile retries then uses deterministic fallback", async () => {
  let transportCalls = 0;
  const client = createDeepSeekClient({ apiKey: "key", logger: () => {}, fetchImpl: async () => {
    transportCalls += 1;
    const content = transportCalls <= 2 ? "" : validEstimate();
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
  } });
  const result = await runEstimateGeneration({ brief: "Продуктовая анимация", systemPrompt: "ORIGINAL", requestModel: client });
  assert.equal(transportCalls, 3);
  assert.equal(result.profileFallbackUsed, true);
  assert.deepEqual(result.profile, fallbackProfile("Продуктовая анимация"));
  assert.ok(result.estimate);
});

test("empty final generation after retry returns empty_response without repair", async () => {
  let transportCalls = 0;
  const stages = [];
  const client = createDeepSeekClient({ apiKey: "key", logger: (entry) => stages.push(entry.stage), fetchImpl: async () => {
    transportCalls += 1;
    const content = transportCalls === 1 ? validProfile() : "";
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
  } });
  await assert.rejects(() => runEstimateGeneration({ brief: "Brief", systemPrompt: "ORIGINAL", requestModel: client }), (error) => error instanceof DeepSeekError && error.code === "empty_response");
  assert.equal(transportCalls, 3);
  assert.deepEqual(stages, ["profile", "generation", "generation"]);
});

test("DeepSeek transport maps timeout after bounded retry", async () => {
  let calls = 0;
  const client = createDeepSeekClient({ apiKey: "key", retries: 1, fetchImpl: async () => { calls += 1; const error = new Error("aborted"); error.name = "AbortError"; throw error; } });
  await assert.rejects(() => client([]), (error) => error instanceof DeepSeekError && error.code === "timeout");
  assert.equal(calls, 2);
});

test("DeepSeek timeout budget fits two sequential calls with one bounded retry each", () => {
  assert.equal(DEEPSEEK_ATTEMPT_TIMEOUT_MS, 60_000);
  assert.equal(DEEPSEEK_RETRIES, 1);
  assert.equal(DEEPSEEK_ATTEMPT_TIMEOUT_MS * (DEEPSEEK_RETRIES + 1) * 2, 240_000);
});

test("DeepSeek does not start an attempt when the request budget is exhausted", async () => {
  let calls = 0;
  const client = createDeepSeekClient({ apiKey: "key", budget: { remainingMs: () => 999 }, fetchImpl: async () => { calls += 1; } });
  await assert.rejects(() => client([]), (error) => error instanceof DeepSeekError && error.code === "request_deadline");
  assert.equal(calls, 0);
});

test("generation function has one hard budget below frontend and Vercel limits", async () => {
  assert.equal(GENERATION_FUNCTION_BUDGET_MS, 260_000);
  assert.ok(GENERATION_FUNCTION_BUDGET_MS < 270_000);
  assert.ok(GENERATION_FUNCTION_BUDGET_MS < 300_000);
  const budget = createRequestBudget({ timeoutMs: 5 });
  await assert.rejects(() => budget.run(new Promise(() => {})), RequestDeadlineError);
});

test("professional SYSTEM_PROMPT remains byte-for-byte unchanged", () => {
  const source = readFileSync(new URL("../api/generate-estimate.js", import.meta.url), "utf8");
  const start = source.indexOf("const SYSTEM_PROMPT = `") + "const SYSTEM_PROMPT = `".length;
  const end = source.indexOf("`;", start);
  const prompt = source.slice(start, end);
  assert.equal(prompt.length, 12927);
  assert.equal(createHash("sha256").update(prompt).digest("hex"), "86ed287f7347f09df9a64bfdd2f88022413f895a75771ef0e27ce767d896510e");
});
