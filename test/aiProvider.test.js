import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAiProvider, resolveAiProviderConfig } from "../api/_lib/aiProvider.js";

test("legacy environment resolves current DeepSeek credentials, URL and model", () => {
  assert.deepEqual(resolveAiProviderConfig({ DEEPSEEK_API_KEY: "legacy-key" }), {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash",
    apiKey: "legacy-key",
  });
});

test("AI base URL, model and API key independently override legacy defaults", () => {
  assert.equal(resolveAiProviderConfig({ AI_BASE_URL: "https://ai.example/v1/chat/completions" }).baseUrl, "https://ai.example/v1/chat/completions");
  assert.equal(resolveAiProviderConfig({ AI_MODEL: "future-model" }).model, "future-model");
  assert.equal(resolveAiProviderConfig({ AI_API_KEY: "new-key", DEEPSEEK_API_KEY: "legacy-key" }).apiKey, "new-key");
});

test("provider sends resolved transport configuration without exposing it to callers", async () => {
  let call;
  const provider = createAiProvider({
    env: { AI_BASE_URL: "https://ai.example/chat", AI_MODEL: "future-model", AI_API_KEY: "secret" },
    fetchImpl: async (url, init) => { call = { url, init }; return { ok: true, status: 200 }; },
  });
  await provider.requestCompletion({ messages: [], temperature: 0, maxTokens: 123 });
  assert.equal(call.url, "https://ai.example/chat");
  assert.equal(call.init.headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(call.init.body), { model: "future-model", messages: [], temperature: 0, max_tokens: 123 });
});

test("generate, edit and import endpoints use the shared provider", () => {
  for (const path of ["../api/generate-estimate.js", "../api/edit-estimate.js", "../api/parse-excel.js"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /createAiProvider/);
    assert.doesNotMatch(source, /api\.deepseek\.com|deepseek-v4-flash/);
  }
});

test("ee1dcca model payload minimization guards remain present", () => {
  const editPrompt = readFileSync(new URL("../api/_lib/editPrompt.js", import.meta.url), "utf8");
  const generation = readFileSync(new URL("../api/generate-estimate.js", import.meta.url), "utf8");
  assert.match(editPrompt, /projectData\(project, request\.scope\)/);
  assert.doesNotMatch(editPrompt, /<confirmed_state>/);
  assert.match(generation, /if \(!settings\.useStudioTemplates\)/);
  assert.doesNotMatch(generation, /autoMatchedNames:/);
});
