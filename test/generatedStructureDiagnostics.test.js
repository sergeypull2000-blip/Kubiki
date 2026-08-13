import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseGeneratedStructure } from "../api/_lib/estimateSchema.js";
import { runEstimateGeneration } from "../api/_lib/generationOrchestrator.js";

const valid = () => ({ schemaVersion: 2, kind: "generated_structure", generationScope: "fragment", projectName: "SECRET PROJECT", warnings: [], stages: [{ name: "SECRET STAGE", tasks: [{ name: "SECRET TASK", executors: [{ type: "anonymous_named", name: "SECRET PERSON", compensation: 123456, tax: 6 }] }] }] });

test("GeneratedStructure diagnostics identify bounded structural failures", () => {
  const cases = [
    ["missing schemaVersion", ((value) => { delete value.schemaVersion; return value; })(valid()), "$", "missing_top_level_keys", ["schemaVersion"]],
    ["missing generationScope", ((value) => { delete value.generationScope; return value; })(valid()), "$", "missing_top_level_keys", ["generationScope"]],
    ["missing Executor discriminator", ((value) => { delete value.stages[0].tasks[0].executors[0].type; return value; })(valid()), "$.stages[0].tasks[0].executors[0]", "missing_executor_discriminator", ["type"]],
    ["unknown Executor field", ((value) => { value.stages[0].tasks[0].executors[0].amount = 1; return value; })(valid()), "$.stages[0].tasks[0].executors[0]", "unknown_executor_keys", []],
    ["invalid tax type", ((value) => { value.stages[0].tasks[0].executors[0].tax = "six percent"; return value; })(valid()), "$.stages[0].tasks[0].executors[0]", "invalid_executor_fields", []],
  ];
  for (const [label, input, path, reason, missingKeys] of cases) {
    const diagnostic = diagnoseGeneratedStructure(input);
    assert.equal(diagnostic.ok, false, label); assert.equal(diagnostic.validationPath, path, label); assert.equal(diagnostic.reason, reason, label);
    if (missingKeys.length) assert.deepEqual(diagnostic.missingKeys, missingKeys, label);
  }
  assert.deepEqual(diagnoseGeneratedStructure(cases[3][1]).unknownKeys, ["amount"]);
  const executorDiagnostic = diagnoseGeneratedStructure(cases[3][1]);
  assert.equal(executorDiagnostic.rejectedExecutorType, "anonymous_named");
  assert.deepEqual(executorDiagnostic.rejectedExecutorKeys, ["amount", "compensation", "name", "tax", "type"]);
});

test("fenced response is invalid JSON and valid DTO succeeds", () => {
  assert.deepEqual(diagnoseGeneratedStructure("```json\n{}\n```"), { inputType: "string", jsonParse: "failed", ok: false, validationPath: "$", reason: "invalid_json" });
  const diagnostic = diagnoseGeneratedStructure(JSON.stringify(valid()));
  assert.equal(diagnostic.ok, true); assert.equal(diagnostic.reason, "valid"); assert.equal(diagnostic.jsonParse, "success");
});

test("diagnostics never contain protected field values", () => {
  const rejected = valid(); rejected.stages[0].tasks[0].executors[0].privateField = "SECRET EXECUTOR VALUE";
  const diagnostic = diagnoseGeneratedStructure(rejected), serialized = JSON.stringify(diagnostic);
  assert.equal(diagnostic.rejectedExecutorType, "anonymous_named");
  assert.equal(diagnostic.rejectedExecutorKeys.includes("privateField"), true);
  for (const secret of ["SECRET PROJECT", "SECRET STAGE", "SECRET TASK", "SECRET PERSON", "123456", "six percent"]) assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("SECRET EXECUTOR VALUE"), false);
});

test("raw and repair diagnostics share one request correlation id", async () => {
  const events = [], responses = ["not json", JSON.stringify(valid())];
  const result = await runEstimateGeneration({ brief: "private", systemPrompt: "private", requestId: "request-safe-1", diagnosticLogger: (event) => events.push(event),
    requestModel: async (_messages, options) => options.stage === "profile" ? "{}" : responses.shift(),
    getGenerationContext: async () => ({ shortlist: {}, personalization: "" }), allowPerformerBindings: true });
  assert.equal(Boolean(result.estimate), true);
  assert.deepEqual(events.map((event) => event.event), ["generation_model_response", "generation_parse_raw", "generation_repair_response", "generation_parse_repair"]);
  assert.equal(events.every((event) => event.requestId === "request-safe-1"), true);
  assert.equal(events[1].success, false); assert.equal(events[3].success, true);
  assert.equal(JSON.stringify(events).includes("private"), false);
});
