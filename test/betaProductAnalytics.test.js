import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("AI import is tracked only from confirmed Excel/PDF import", () => {
  const modal = source("src/importExcel.jsx");
  const app = source("src/kubiki.jsx");
  assert.match(modal, /importFormat: isWord \? null : \(isPdf \? "pdf" : "excel"\)/);
  assert.doesNotMatch(modal, /productEventsRepository|ai_import_completed/);
  assert.match(app, /onConfirm=\{\(stages, meta\) => \{ createProjectFromEstimate\(stages, \{ \.\.\.meta, source: "import" \}\); if \(meta\?\.importFormat\) trackProductEvent\("ai_import_completed", \{\}, \{ format: meta\.importFormat \}\); \}\}/);
});

test("AI edit is tracked exactly once after a successful apply, never when requested", () => {
  const app = source("src/kubiki.jsx");
  const event = 'productEventsRepository.track(userId, "ai_edit"';
  assert.equal(app.split(event).length - 1, 1);
  const applyAt = app.indexOf("const applyCurrentAiEdit");
  const requestAt = app.indexOf("const requestCurrentAiEdit");
  const eventAt = app.indexOf(event);
  const appliedAt = app.indexOf("if (!applied) throw new Error", applyAt);
  assert.ok(eventAt > appliedAt);
  assert.ok(eventAt > applyAt);
  assert.ok(eventAt < app.indexOf("const undoCurrentAiEdit"));
  assert.equal(app.slice(requestAt, applyAt).includes(event), false);
  assert.match(app.slice(eventAt, eventAt + 180), /requestId: verified\.requestId \|\| null/);
  assert.match(app.slice(eventAt, eventAt + 220), /type: verified\.scope\?\.kind \|\| preview\.scope\?\.kind/);
});

test("AI generate remains confirmation-only and analytics payloads omit content", () => {
  const app = source("src/kubiki.jsx");
  assert.match(app, /onConfirm=\{\(stages, meta\) => \{ trackProductEvent\("ai_generate", \{ requestId: meta\?\.requestId \|\| null \}, \{ source: meta\?\.generationScope \|\| "whole_project" \}\); createProjectFromEstimate/);
  const analytics = app.match(/trackProductEvent\([^\n]+/g).join("\n");
  assert.doesNotMatch(analytics, /project_data|prompt|filename|sheet|email|instruction/);
});
