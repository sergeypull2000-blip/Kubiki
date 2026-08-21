import test from "node:test";
import assert from "node:assert/strict";
import { GENERATED_ESTIMATE_MAX_TOKENS, runEstimateGeneration } from "../api/_lib/generationOrchestrator.js";

const profile = JSON.stringify({ projectTypes: [], deliverables: [], disciplines: [], pipelineStages: [], taskTerms: [], roleTerms: [], styleTerms: [], formats: [], platforms: [], constraints: [], keywords: [], complexity: "unknown", uncertainty: [], language: "ru", budget: { amount: null, currency: null, mode: "none" } });
const estimate = JSON.stringify({ schemaVersion: 2, kind: "generated_structure", generationScope: "whole_project", projectName: "P", stages: [{ name: "S", tasks: [{ name: "T", executors: [{ type: "anonymous_unnamed" }] }] }], warnings: [] });

test("large estimate output budget applies equally to generation and repair, not profile", async () => {
  const calls = [];
  await runEstimateGeneration({ brief: "brief", systemPrompt: "system", requestModel: async (_messages, options) => {
    calls.push(options);
    if (options.stage === "profile") return profile;
    if (options.stage === "generation") return "not json";
    return estimate;
  } });
  assert.equal(GENERATED_ESTIMATE_MAX_TOKENS, 8000);
  assert.deepEqual(calls.map(({ stage, maxTokens }) => ({ stage, maxTokens })), [
    { stage: "profile", maxTokens: 900 },
    { stage: "generation", maxTokens: 8000 },
    { stage: "repair", maxTokens: 8000 },
  ]);
});
