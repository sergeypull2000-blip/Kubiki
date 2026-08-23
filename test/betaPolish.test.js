import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildExportEstimateModel } from "../src/exportEstimate.js";
import { buildExcelWorkbook } from "../src/excelExport.js";
import { normalizePresentationSettings, presentationSettingsForPreset } from "../src/exportSettings.js";
import { dismissOnBackdrop } from "../src/components/modalDismiss.js";

const project = (branding = {}) => ({ id: "p", name: "Project", globalMarkup: 0, markupMode: "embedded", tax: { percent: 0 }, vat: { percent: 0 }, exportSettings: { branding }, stages: [{ id: "s", name: "Stage", tasks: [{ id: "t", name: "Task", directCost: 100, executors: [] }] }] });

test("backdrop dismisses while a content-originated event does not", () => {
  let closes = 0;
  const backdrop = {};
  const dismiss = dismissOnBackdrop(() => { closes += 1; });
  dismiss({ target: {}, currentTarget: backdrop });
  dismiss({ target: backdrop, currentTarget: backdrop });
  assert.equal(closes, 1);
});

test("dismissible modal primitive owns one stacked Escape listener with cleanup", async () => {
  const source = await readFile(new URL("../src/components/modalDismiss.js", import.meta.url), "utf8");
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /dismissStack\.at\(-1\)/);
  assert.match(source, /window\.removeEventListener\("keydown", onKeyDown\)/);
  assert.match(source, /return \(\) =>/);
});

test("AI disclosure Escape and backdrop share Cancel and cannot continue AI", async () => {
  const source = await readFile(new URL("../src/components/AiDisclosureModal.jsx", import.meta.url), "utf8");
  assert.match(source, /useModalDismiss\(onCancel/);
  assert.match(source, /dismissOnBackdrop\(onCancel\)/);
  assert.doesNotMatch(source, /useModalDismiss\(onContinue|dismissOnBackdrop\(onContinue/);
});

test("export Cancel paths discard draft and only explicit export commits settings", async () => {
  const source = await readFile(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  assert.match(source, /const save = \(next\) => setDraft\(next\)/);
  assert.match(source, /const run = async \(\) => \{[\s\S]*dispatch\(\(current\).*exportSettings/);
  assert.match(source, /useModalDismiss\(onClose\)/);
});

test("company position is canonical in preview, PDF and Excel", async () => {
  const source = await readFile(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  for (const position of ["left", "center", "right"]) {
    const model = buildExportEstimateModel(project({ companyName: "Kubiki", companyPosition: position }));
    assert.equal(model.brand.companyPosition, position);
    assert.equal(buildExcelWorkbook(model).worksheets[0].getCell("A1").alignment.horizontal, position);
  }
  assert.match(source, /model\.brand\.companyPosition === "left"/);
  assert.match(source, /model\.brand\.companyPosition === "center"/);
  assert.match(source, /model\.brand\.companyPosition === "right"/);
  assert.match(source, /alignment: model\.brand\.companyPosition/);
});

test("header branding persists and reaches preview, PDF and Excel", async () => {
  const branding = { colors: { header: "#123456", headerText: "#abcdef" }, headerFontSize: 14 };
  const normalized = normalizePresentationSettings({ branding });
  const preset = presentationSettingsForPreset(normalized);
  assert.equal(preset.branding.colors.header, "#123456");
  assert.equal(preset.branding.colors.headerText, "#abcdef");
  assert.equal(preset.branding.headerFontSize, 14);
  const model = buildExportEstimateModel(project(branding));
  const sheet = buildExcelWorkbook(model).worksheets[0];
  const header = sheet.findRow(sheet.getColumn(1).values.findIndex((value) => value === "№"));
  assert.deepEqual([header.getCell(1).fill.fgColor.argb, header.font.color.argb, header.font.size], ["FF123456", "FFABCDEF", 14]);
  const source = await readFile(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  assert.match(source, /background: model\.brand\.colors\.header/);
  assert.match(source, /fillColor: model\.brand\.colors\.header/);
  assert.match(source, /fontSize: model\.brand\.headerFontSize/);
});

test("legacy profiles retain the previous table-header appearance", () => {
  const settings = normalizePresentationSettings({ branding: { colors: {} } });
  assert.deepEqual([settings.branding.colors.header, settings.branding.colors.headerText, settings.branding.headerFontSize], ["#F7FAFC", "#64748B", 10]);
});

test("public legal copy contains no internal risk phrasing", async () => {
  const publicCopy = await Promise.all(["../src/legalDocuments.jsx", "../src/components/AiDisclosureModal.jsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.doesNotMatch(publicCopy.join("\n"), /принятый риск|осознанный риск|забить на трансгранич|юридическ(?:ий|ого) риск/i);
});
