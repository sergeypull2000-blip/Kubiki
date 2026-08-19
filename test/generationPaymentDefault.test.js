import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runEstimateGeneration } from "../api/_lib/generationOrchestrator.js";
import { parseGeneratedStructure, resolveGeneratedStructure, compileGeneratedStructure } from "../api/_lib/generatedStructure.js";
import { stagesFromGeneratedEstimate } from "../src/ai/estimateInsertion.js";

const lists = { projectTypes: [], deliverables: [], disciplines: [], pipelineStages: [], taskTerms: [], roleTerms: [], styleTerms: [], formats: [], platforms: [], constraints: [], keywords: [], complexity: "unknown", uncertainty: [], language: "ru", budget: { amount: null, currency: null, mode: "none" } };
const profile = () => JSON.stringify({ ...lists, pricingMode: "estimate_missing", performerRateMode: "inherit_defaults" });
const structure = (generationScope, executors) => ({ schemaVersion: 2, kind: "generated_structure", generationScope, projectName: "Ролик 30 сек", stages: [{ name: "Съёмка", tasks: [{ name: "Съёмка", executors }] }], warnings: [] });
const request = () => ({ requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" }, instruction: "Добавь структуру", knowledge: { selectedSources: [] }, idPool: { stages: ["s"], tasks: ["t"], executors: ["e1", "e2", "e3"], tags: Array.from({ length: 12 }, (_, index) => `g${index}`) } });
const compiledOps = (parsed) => compileGeneratedStructure({ resolved: resolveGeneratedStructure({ draft: parsed, performers: [] }), request: request(), project: { id: "p", stages: [] }, performers: [] }).operations;

test("generic estimate without payment instructions normalizes every generated executor to fix_total", async () => {
  const calls = [], responses = [profile(), JSON.stringify(structure("whole_project", [
    { type: "anonymous_named", name: "Оператор", role: "Оператор", compensation: 30000 },
    { type: "anonymous_named", name: "Монтажёр", role: "Монтажёр", compensation: 20000 },
    { type: "anonymous_unnamed", role: "Режиссёр", compensation: 40000 },
  ]))];
  const result = await runEstimateGeneration({ brief: "Смета для ролика о вреде наркотиков 30 сек", systemPrompt: "SYSTEM", requestModel: async (messages) => { calls.push(messages); return responses.shift(); } });
  assert.deepEqual(result.estimate.stages[0].tasks[0].executors.map((executor) => executor.paymentType), ["fix_total", "fix_total", "fix_total"]);
  assert.deepEqual(result.estimate.stages[0].tasks[0].executors.map((executor) => executor.compensation), [30000, 20000, 40000]);
  const prompt = calls[1][1].content;
  assert.match(prompt, /fix_total/);
  assert.match(prompt, /Фиксированная ставка/);
  assert.match(prompt, /только если пользователь явно указал/);
});

test("generated fixed amount is written into the fixed monetary field (Initial and Global paths)", () => {
  const parsed = parseGeneratedStructure(structure("fragment", [{ type: "anonymous_named", name: "Оператор", compensation: 30000 }]));
  assert.equal(parsed.stages[0].tasks[0].executors[0].paymentType, "fix_total");
  const initial = stagesFromGeneratedEstimate(parsed)[0].tasks[0].executors[0];
  assert.equal(initial.amount, "30000");
  assert.deepEqual(initial.tags.find((tag) => tag.key === "payment").payment, { type: "fix_total", rate: "", units: "", hours: "", shifts: "" });
  const ops = compiledOps(parsed);
  assert.equal(ops.some((operation) => operation.type === "executor.amount.set" && operation.value.value === "30000"), true);
  assert.equal(ops.some((operation) => operation.type === "executor.payment.setRate"), false);
});

test("explicit shift payment keeps type, rate and quantity in the shift fields", () => {
  const parsed = parseGeneratedStructure(structure("fragment", [{ type: "anonymous_named", name: "Оператор", paymentType: "shift", compensation: 12000, quantity: 2 }]));
  const initial = stagesFromGeneratedEstimate(parsed)[0].tasks[0].executors[0];
  assert.deepEqual(initial.tags.find((tag) => tag.key === "payment").payment, { type: "shift", rate: "12000", units: "", hours: "", shifts: "2" });
  assert.equal(initial.amount, "");
  const ops = compiledOps(parsed).filter((operation) => operation.targetId === "e1");
  assert.equal(ops.some((operation) => operation.type === "executor.payment.setType" && operation.value.type === "shift"), true);
  assert.equal(ops.some((operation) => operation.type === "executor.payment.setRate" && operation.value.value === "12000"), true);
  assert.equal(ops.some((operation) => operation.type === "executor.payment.setQuantity" && operation.value.field === "shifts" && operation.value.value === "2"), true);
  assert.equal(ops.some((operation) => operation.type === "executor.amount.set"), false);
});

test("explicit hourly payment keeps type and hours", () => {
  const parsed = parseGeneratedStructure(structure("fragment", [{ type: "anonymous_named", name: "Монтажёр", paymentType: "hourly", compensation: 3000, quantity: 10 }]));
  const initial = stagesFromGeneratedEstimate(parsed)[0].tasks[0].executors[0];
  assert.deepEqual(initial.tags.find((tag) => tag.key === "payment").payment, { type: "hourly", rate: "3000", units: "", hours: "10", shifts: "" });
  const ops = compiledOps(parsed).filter((operation) => operation.targetId === "e1");
  assert.equal(ops.some((operation) => operation.type === "executor.payment.setType" && operation.value.type === "hourly"), true);
  assert.equal(ops.some((operation) => operation.type === "executor.payment.setRate" && operation.value.value === "3000"), true);

test("both generation system prompts mandate fix_total default unless payment type is explicit", () => {
  for (const source of [
    readFileSync(new URL("../api/generate-estimate.js", import.meta.url), "utf8"),
    readFileSync(new URL("../api/edit-estimate.js", import.meta.url), "utf8"),
  ]) {
    assert.match(source, /fix_total/);
    assert.match(source, /Фиксированная ставка/);
    assert.match(source, /never pick a payment type on your own|по собственному усмотрению/);
  }
});

  assert.equal(ops.some((operation) => operation.type === "executor.payment.setQuantity" && operation.value.field === "hours" && operation.value.value === "10"), true);
});
