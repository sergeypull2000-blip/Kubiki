import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGenerationMetadata, serializeGenerationMetadata } from "../api/_lib/generationMetadata.js";
import { attachGenerationMetadata, decodeGenerationMetadataHeader, normalizeGenerationMetadata } from "../src/ai/generationMetadata.js";

test("generation metadata contains only bounded safe display names", () => {
  const metadata = buildGenerationMetadata({
    shortlist: {
      projectTemplates: [{ name: "3D Product Video" }, { name: "3D Product Video" }],
      stageTemplates: [{ name: "Препродакшн" }],
      taskTemplates: [],
      performers: [{ displayName: "Миша", roles: ["3D Artist"] }],
      historicalProjects: [{ name: "Прошлый ролик" }],
    },
    profileFallbackUsed: true,
    now: () => new Date("2026-08-04T12:00:00.000Z"),
  });
  assert.deepEqual(metadata, { version: 1, generatedAt: "2026-08-04T12:00:00.000Z", knowledgeNames: ["3D Product Video", "Препродакшн", "Миша", "Прошлый ролик"], profileFallbackUsed: true });
  assert.equal("shortlist" in metadata, false);
  assert.equal("id" in metadata, false);
});

test("metadata header round-trip is safe and malformed input is ignored", () => {
  const original = { version: 1, generatedAt: "2026-08-04T12:00:00.000Z", knowledgeNames: ["Шаблон"], profileFallbackUsed: false };
  assert.deepEqual(decodeGenerationMetadataHeader(serializeGenerationMetadata(original)), original);
  assert.equal(decodeGenerationMetadataHeader("%broken"), null);
  assert.equal(normalizeGenerationMetadata({ version: 2, knowledgeNames: ["x"] }), null);
});

test("client metadata does not change the enumerable estimate JSON schema", () => {
  const estimate = { projectName: "Test", stages: [], warnings: [] };
  const metadata = normalizeGenerationMetadata({ version: 1, knowledgeNames: ["Template"] });
  attachGenerationMetadata(estimate, metadata);
  assert.deepEqual(Object.keys(estimate), ["projectName", "stages", "warnings"]);
  assert.equal(estimate.__generationMetadata.knowledgeNames[0], "Template");
  assert.equal(JSON.stringify(estimate), '{"projectName":"Test","stages":[],"warnings":[]}');
});

test("endpoint keeps estimate body unchanged and Project persists only display metadata", () => {
  const endpoint = readFileSync(new URL("../api/generate-estimate.js", import.meta.url), "utf8");
  const kubiki = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/components/Workspace.jsx", import.meta.url), "utf8");
  assert.match(endpoint, /setHeader\("X-Kubiki-Generation-Metadata"/);
  assert.match(endpoint, /body: result\.estimate/);
  assert.match(endpoint, /json\(response\.body\)/);
  assert.match(kubiki, /project\.metadata = \{ \.\.\.project\.metadata, aiGeneration: meta\.generationMetadata \}/);
  assert.match(workspace, /Использованы знания студии/);
  assert.doesNotMatch(workspace, /performerSnapshot|phone|telegram|email/i);
});
