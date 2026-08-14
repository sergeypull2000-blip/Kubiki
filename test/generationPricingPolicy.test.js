import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runEstimateGeneration } from "../api/_lib/generationOrchestrator.js";
import { parseProfile } from "../api/_lib/profile.js";
import { compileGeneratedStructure, resolveGeneratedStructure } from "../api/_lib/generatedStructure.js";
import { stagesFromGeneratedEstimate } from "../src/ai/estimateInsertion.js";

const lists = { projectTypes: [], deliverables: [], disciplines: [], pipelineStages: [], taskTerms: [], roleTerms: [], styleTerms: [], formats: [], platforms: [], constraints: [], keywords: [], complexity: "unknown", uncertainty: [], language: "ru", budget: { amount: null, currency: null, mode: "none" } };
const profile = (pricingMode, performerRateMode = pricingMode === "leave_missing_blank" ? "leave_blank" : "inherit_defaults") => JSON.stringify({ ...lists, pricingMode, performerRateMode });
const estimate = (generationScope, executors) => ({ schemaVersion: 2, kind: "generated_structure", generationScope, projectName: "P", stages: [{ name: "S", tasks: [{ name: "T", executors }] }], warnings: [] });

test("generation profile exposes a bounded financial policy", () => {
  assert.equal(parseProfile(profile("estimate_missing")).pricingMode, "estimate_missing");
  assert.equal(parseProfile(profile("leave_missing_blank")).pricingMode, "leave_missing_blank");
  assert.equal(parseProfile(JSON.stringify({ ...lists, pricingMode: "invent", performerRateMode: "leave_blank" })), null);
});

test("generation contract separates an unnamed profession from an explicitly named person", async () => {
  for (const [brief, taskName, draft, expectedType, expectedName] of [
    ["нужен графический дизайнер", "Графический дизайн", { type: "anonymous_unnamed", role: "Графический дизайнер" }, "anonymous_unnamed", undefined],
    ["Нужны UI-дизайн лендинга и адаптивная верстка", "UI-дизайн лендинга", { type: "anonymous_unnamed", role: "UI-дизайнер" }, "anonymous_unnamed", undefined],
    ["Нужна адаптивная верстка", "Адаптивная верстка", { type: "anonymous_unnamed", role: "Frontend-разработчик" }, "anonymous_unnamed", undefined],
    ["Нужна разработка логотипа", "Разработка логотипа", { type: "anonymous_unnamed", role: "Дизайнер айдентики" }, "anonymous_unnamed", undefined],
    ["Миша делает дизайн", "Дизайн", { type: "anonymous_named", name: "Миша", role: "Графический дизайнер" }, "anonymous_named", "Миша"],
  ]) {
    const calls = [], generated = estimate("fragment", [draft]); generated.stages[0].tasks[0].name = taskName;
    const responses = [profile("estimate_missing"), JSON.stringify(generated)];
    const result = await runEstimateGeneration({ brief, systemPrompt: "SYSTEM", requestModel: async (messages) => { calls.push(messages); return responses.shift(); } });
    assert.match(calls[1][1].content, /anonymous_named допустим только когда имя конкретного человека, команды или компании явно присутствует/);
    assert.match(calls[1][1].content, /профессиональную role из смысла его Task, если её можно разумно определить/);
    assert.match(calls[1][1].content, /отсутствие имени не является причиной оставлять role пустой/);
    assert.match(calls[1][1].content, /Никогда не копируй профессию или role в name/);
    const executor = result.estimate.stages[0].tasks[0].executors[0];
    assert.equal(executor.type, expectedType); assert.equal(executor.name, expectedName); assert.equal(Boolean(executor.role), true);
  }
});

test("whole-project and fragment examples teach optional tax and unnamed roles", () => {
  for (const source of [
    readFileSync(new URL("../api/generate-estimate.js", import.meta.url), "utf8"),
    readFileSync(new URL("../api/edit-estimate.js", import.meta.url), "utf8"),
  ]) {
    assert.doesNotMatch(source, /"tax"\s*:\s*6/);
    assert.match(source, /"type":"anonymous_unnamed","role":"\.\.\."/);
    assert.match(source, /tax (?:опционально|is optional)/i);
  }
});

test("tax is absent by default and preserves explicit zero or six in both scopes", async () => {
  for (const scope of ["whole_project", "fragment"]) {
    for (const [brief, tax] of [["Нужна профессиональная работа", undefined], ["Налог исполнителя 6%", 6], ["Налог исполнителя 0%", 0]]) {
      const draft = { type: "anonymous_unnamed", role: "Специалист", ...(tax === undefined ? {} : { tax }) };
      const calls = [], responses = [profile("estimate_missing"), JSON.stringify(estimate(scope, [draft]))];
      const result = await runEstimateGeneration({ brief, systemPrompt: "SYSTEM", requestModel: async (messages) => { calls.push(messages); return responses.shift(); } });
      assert.match(calls[1][1].content, /Поле tax опционально/);
      assert.equal(result.estimate.stages[0].tasks[0].executors[0].tax, tax);
    }
  }
});

test("default and explicit blank pricing policies reach whole_project and fragment generation", async () => {
  for (const [scope, mode, drafts] of [
    ["whole_project", "estimate_missing", [{ type: "anonymous_named", name: "A", paymentType: "fix_total", compensation: 120000 }]],
    ["fragment", "leave_missing_blank", [{ type: "anonymous_named", name: "A" }]],
  ]) {
    const calls = [], responses = [profile(mode), JSON.stringify(estimate(scope, drafts))];
    const result = await runEstimateGeneration({ brief: "Brief", instruction: mode === "leave_missing_blank" ? "Ставки не заполняй" : "", systemPrompt: "SYSTEM", requestModel: async (messages) => { calls.push(messages); return responses.shift(); } });
    assert.match(calls[1][1].content, new RegExp(`pricingMode=${mode}`));
    assert.equal(result.estimate.stages[0].tasks[0].executors[0].compensation, mode === "estimate_missing" ? 120000 : undefined);
  }
});

test("explicit compensation survives no-pricing while other compensation stays absent", async () => {
  const generated = estimate("fragment", [{ type: "anonymous_named", name: "A", compensation: 300000 }, { type: "anonymous_named", name: "B" }]); delete generated.projectName;
  const responses = [profile("leave_missing_blank"), JSON.stringify(generated)];
  const result = await runEstimateGeneration({ brief: "Добавь двух исполнителей по 300к, остальные ставки не заполняй", systemPrompt: "SYSTEM", requestModel: async () => responses.shift() });
  assert.deepEqual(result.estimate.stages[0].tasks[0].executors.map((draft) => draft.compensation), [300000, undefined]);
  assert.equal(Object.hasOwn(result.estimate, "projectName"), false);
});

test("no-pricing suppresses Performer defaults equally in Initial and Global", () => {
  const draft = estimate("fragment", [{ type: "performer_binding", key: "m", performerName: "Миша" }]);
  const performers = [{ id: "pf", firstName: "Миша", defaultPaymentType: "fix_total", defaultRate: 90000, active: true }];
  const policy = { pricingMode: "leave_missing_blank", performerRateMode: "leave_blank" };
  const initial = stagesFromGeneratedEstimate(draft, performers, policy)[0].tasks[0].executors[0];
  assert.equal(initial.amount, "");
  assert.equal(initial.tags.some((tag) => tag.key === "payment"), false);
  const request = { requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" }, instruction: "Мишу из базы, без ставок", knowledge: { selectedSources: [] }, idPool: { stages: ["s"], tasks: ["t"], executors: ["e"], tags: ["g1", "g2", "g3", "g4"] } };
  const diff = compileGeneratedStructure({ resolved: resolveGeneratedStructure({ draft, performers }), request, project: { id: "p", stages: [] }, performers, pricingPolicy: policy });
  assert.equal(diff.operations.find((operation) => operation.type === "executor.addFromPerformer").value.inheritFinancials, false);
});
