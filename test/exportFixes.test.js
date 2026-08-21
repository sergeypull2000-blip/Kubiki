import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildExportEstimateModel } from "../src/exportEstimate.js";
import { buildExcelWorkbook } from "../src/excelExport.js";
import { normalizePresentationSettings, presentationSettingsForPreset } from "../src/exportSettings.js";

const project = (vat = 0, settings = {}) => ({
  id: "p", name: "Project", globalMarkup: 0, markupMode: "embedded", tax: { percent: 0 }, vat: { percent: vat }, exportSettings: settings,
  stages: [{ id: "s", name: "Stage", tasks: [{ id: "t", name: "Task", directCost: 100, executors: [] }] }],
});

test("VAT total label changes only when VAT is positive", () => {
  assert.equal(buildExportEstimateModel(project(0)).totalLabel, "ИТОГО");
  assert.equal(buildExportEstimateModel(project(20)).totalLabel, "ИТОГО С НДС 20%");
  assert.equal(buildExportEstimateModel(project(5)).totalLabel, "ИТОГО С НДС 5%");
  assert.equal(buildExportEstimateModel(project()).summary.total, buildExportEstimateModel(project(0)).summary.total);
});

test("logo position is normalized and survives preset serialization", () => {
  for (const position of ["left", "center", "right"]) {
    const settings = normalizePresentationSettings({ branding: { logoPosition: position } });
    assert.equal(settings.branding.logoPosition, position);
    assert.equal(presentationSettingsForPreset(settings).branding.logoPosition, position);
    assert.equal(buildExportEstimateModel(project(0, settings)).brand.logoPosition, position);
  }
  assert.equal(normalizePresentationSettings({ branding: { logoPosition: "bad" } }).branding.logoPosition, "left");
});

test("Excel uses the canonical VAT total label", () => {
  const sheet = buildExcelWorkbook(buildExportEstimateModel(project(20))).worksheets[0];
  assert.equal(sheet.findRow(sheet.getColumn(2).values.findIndex((value) => value === "ИТОГО С НДС 20%")).getCell(2).value, "ИТОГО С НДС 20%");
});

test("branded export exposes the three logo position choices and uses the canonical label in PDF/preview", async () => {
  const source = await readFile(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  for (const label of ["Слева", "По центру", "Справа"]) assert.match(source, new RegExp(label));
  assert.match(source, /model\.brand\.logoPosition/);
  assert.match(source, /model\.totalLabel/);
});
