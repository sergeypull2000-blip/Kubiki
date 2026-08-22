import test from "node:test";
import assert from "node:assert/strict";
import { normalizePresentationSettings } from "../src/exportSettings.js";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("template interactions keep creation and edit actions separate", () => {
  const dashboard = source("../src/components/Dashboard.jsx");
  const leftPanel = source("../src/components/LeftPanel.jsx");
  assert.match(dashboard, /onOpen=\{\(\) => onCreate\(template\)\}/);
  assert.match(dashboard, /onEdit=\{onEditTemplate\}/);
  assert.match(leftPanel, /onClick=\{\(\) => onOpenTemplate\?\.\(template\.id\)\}/);
  assert.match(leftPanel, /kb-template-drag-handle/);
  assert.match(leftPanel, /Переименовать шаблон/);
});

test("branding keeps independent positions and normalizes them", () => {
  const settings = normalizePresentationSettings({ branding: { logoPosition: "right", companyPosition: "center" } });
  assert.equal(settings.branding.logoPosition, "right");
  assert.equal(settings.branding.companyPosition, "center");
  const fallback = normalizePresentationSettings({ branding: { logoPosition: "bad", companyPosition: "bad" } });
  assert.equal(fallback.branding.logoPosition, "left");
  assert.equal(fallback.branding.companyPosition, "left");
});

test("same branding zone is represented as one non-overlapping zone group", () => {
  const files = source("../src/exportFiles.jsx");
  assert.match(files, /kb-export-preview-brand/);
  assert.match(files, /companyPosition === "left"/);
  assert.match(files, /companyPosition === "center"/);
  assert.match(files, /companyPosition === "right"/);
});

test("branding editor uses labels, compact remove and inline position controls", () => {
  const files = source("../src/exportFiles.jsx");
  assert.match(files, /kb-export-brand-label/);
  assert.match(files, /Название компании/);
  assert.match(files, /kb-brand-remove/);
  assert.match(files, /PositionSegmented/);
  assert.doesNotMatch(files, /KubikiDropdown value=\{draft\.branding\.(logoPosition|companyPosition)/);
});
