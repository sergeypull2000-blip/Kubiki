import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAiHydrationReady } from "../src/ai/hydrationGate.js";

test("AI hydration gate blocks every unresolved knowledge source", () => {
  const ready = { projects: "ready", performers: "ready", templates: "ready", aiSettings: "ready" };
  assert.equal(isAiHydrationReady(ready), true);
  for (const key of Object.keys(ready)) assert.equal(isAiHydrationReady({ ...ready, [key]: "loading" }), false, key);
  assert.equal(isAiHydrationReady({ ...ready, performers: "migrating" }), false);
  assert.equal(isAiHydrationReady({ ...ready, templates: "waiting" }), false);
});

test("completed local fallback states allow generation", () => {
  assert.equal(isAiHydrationReady({ projects: "local-deferred", performers: "error", templates: "save-error", aiSettings: "error" }), true);
  assert.equal(isAiHydrationReady({ projects: "ready", performers: "migration-offer", templates: "migration-offer", aiSettings: "ready" }), true);
});

test("Kubiki gates modal mounting and passes readiness to entry points", () => {
  const source = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  assert.match(source, /aiGenerationReady && projectSource\?\.file/);
  assert.match(source, /aiGenerationReady && projectSource && !projectSource\.file/);
  assert.ok((source.match(/aiGenerationReady=\{aiGenerationReady\}/g) || []).length >= 3);
});
