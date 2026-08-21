import test from "node:test";
import assert from "node:assert/strict";
import { DeepSeekError } from "../api/_lib/deepseek.js";
import { createDeepSeekClient } from "../api/_lib/deepseek.js";
import { generatedStructureMissingResponse, generationErrorResponse } from "../api/generate-estimate.js";
import { runEstimateGeneration } from "../api/_lib/generationOrchestrator.js";

test("parse failure response is a correlated 502 with a machine-readable code", () => {
  assert.deepEqual(generatedStructureMissingResponse("request-parse-1"), {
    status: 502,
    body: { error: "Не удалось обработать ответ. Попробуйте снова", code: "generated_structure_missing", requestId: "request-parse-1" },
  });
});

test("unexpected generation error is a correlated internal 500", () => {
  assert.deepEqual(generationErrorResponse(new Error("private failure"), "request-internal-1"), {
    status: 500,
    body: { error: "Не удалось обработать ответ. Попробуйте снова", code: "generation_internal_error", requestId: "request-internal-1" },
  });
});

test("provider errors preserve their existing machine-readable code", () => {
  const result = generationErrorResponse(new DeepSeekError("upstream failure", { status: 502, code: "upstream_503" }), "request-provider-1");
  assert.deepEqual(result, { status: 502, body: { error: "upstream failure", code: "upstream_503", requestId: "request-provider-1" } });
});

test("one requestId reaches profile, raw, repair and their safe diagnostics", async () => {
  const calls = [], events = [];
  const response = JSON.stringify({ schemaVersion: 2, kind: "generated_structure", generationScope: "whole_project", projectName: "P", warnings: [], stages: [{ name: "S", tasks: [{ name: "T", executors: [{ type: "anonymous_unnamed" }] }] }] });
  await runEstimateGeneration({
    brief: "private", systemPrompt: "private", requestId: "request-correlation-1", diagnosticLogger: (event) => events.push(event),
    requestModel: async (_messages, options) => { calls.push(options); return options.stage === "generation" ? "not json" : options.stage === "repair" ? response : "{}"; },
    getGenerationContext: async () => ({ shortlist: {}, personalization: "" }),
  });
  assert.deepEqual(calls.map((item) => item.requestId), ["request-correlation-1", "request-correlation-1", "request-correlation-1"]);
  assert.deepEqual(events.map((item) => item.requestId), ["request-correlation-1", "request-correlation-1", "request-correlation-1", "request-correlation-1"]);
  assert.equal(events[1].diagnostic.reason, "invalid_json");
});

test("provider attempt logs carry the same requestId", async () => {
  const logs = [];
  const client = createDeepSeekClient({ apiKey: "test-key", logger: (event) => logs.push(event), fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }) }) });
  await client([], { requestId: "request-provider-log-1", retries: 0 });
  assert.equal(logs[0].requestId, "request-provider-log-1");
  assert.equal(logs[0].finishReason, "stop");
  assert.equal(logs[0].contentLength, 2);
});
