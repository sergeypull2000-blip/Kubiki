import test from "node:test";
import assert from "node:assert/strict";
import { generateEstimateRequest, GENERATION_REQUEST_TIMEOUT_MS } from "../src/ai/generationClient.js";

test("generation client allows the bounded two-call DeepSeek budget", () => {
  assert.equal(GENERATION_REQUEST_TIMEOUT_MS, 270_000);
  assert.ok(GENERATION_REQUEST_TIMEOUT_MS > 240_000);
  assert.ok(GENERATION_REQUEST_TIMEOUT_MS < 300_000);
});

test("generation client sends Supabase access token and JSON body", async () => {
  const expected = { projectName: "X", stages: [], warnings: [] };
  const result = await generateEstimateRequest({ description: "brief" }, {
    getAccessToken: async () => "access-token",
    fetchImpl: async (url, init) => {
      assert.equal(url, "/api/generate-estimate");
      assert.equal(init.headers.Authorization, "Bearer access-token");
      assert.deepEqual(JSON.parse(init.body), { description: "brief" });
      return { ok: true, json: async () => expected };
    },
  });
  assert.deepEqual(result, expected);
});

test("generation client surfaces safe server error", async () => {
  await assert.rejects(() => generateEstimateRequest({ description: "brief" }, {
    getAccessToken: async () => "access-token",
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: "Сессия недействительна" }) }),
  }), /Сессия недействительна/);
});

test("generation client keeps safe error observability fields", async () => {
  await assert.rejects(() => generateEstimateRequest({ description: "brief" }, {
    getAccessToken: async () => "access-token",
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({ error: "Не удалось обработать ответ. Попробуйте снова", code: "generated_structure_missing", requestId: "request-debug-1" }) }),
  }), (error) => error.code === "generated_structure_missing" && error.requestId === "request-debug-1");
});

test("generation client reads optional metadata header without changing JSON keys", async () => {
  const encoded = encodeURIComponent(JSON.stringify({ version: 1, generatedAt: "2026-08-04T12:00:00.000Z", knowledgeNames: ["Препродакшн"], profileFallbackUsed: false }));
  const result = await generateEstimateRequest({ description: "brief" }, {
    getAccessToken: async () => "token",
    fetchImpl: async () => ({ ok: true, headers: { get: () => encoded }, json: async () => ({ projectName: "P", stages: [], warnings: [] }) }),
  });
  assert.deepEqual(Object.keys(result), ["projectName", "stages", "warnings"]);
  assert.deepEqual(result.__generationMetadata.knowledgeNames, ["Препродакшн"]);
});
