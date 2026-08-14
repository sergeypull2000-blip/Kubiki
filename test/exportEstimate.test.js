import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_EXPORT_SETTINGS,
  allocateMoneyProportionally,
  buildExportEstimateModel,
  distributeMarkupAcrossTasks,
  distributeTaxAcrossTasks,
  normalizeExportSettings,
  validateExportModelTotals,
} from "../src/exportEstimate.js";
import { executorFinancialCommission, projectFinancialCommission, projectTaxBreakdown, projectTotalWithTax } from "../src/calculations.js";
import { buildExcelWorkbook, buildExcelRows } from "../src/excelExport.js";

const task = (id, name, directCost, markupOverride = null) => ({ id, name, directCost, markupOverride, executors: [] });
const project = (patch = {}) => ({
  id: "project", name: "Проект", globalMarkup: 20, markupMode: "embedded",
  tax: { type: "usn", percent: 6, visible: true }, vat: { percent: 20 },
  stages: [{ id: "stage", name: "Этап", tasks: [task("one", "Монтаж", 100), task("two", "Монтаж", 200)] }],
  ...patch,
});

test("старый проект получает версионированные безопасные defaults", () => {
  assert.deepEqual(normalizeExportSettings(), DEFAULT_EXPORT_SETTINGS);
});

test("валидные настройки сохраняются после нормализации, повреждённые заменяются defaults", () => {
  assert.deepEqual(normalizeExportSettings({ version: 99, markupPresentation: "distributed", taxPresentation: "separate_line" }), { version: 1, markupPresentation: "distributed", taxPresentation: "separate_line" });
  assert.deepEqual(normalizeExportSettings({ markupPresentation: "bad", taxPresentation: null }), DEFAULT_EXPORT_SETTINGS);
});

test("настройки проектов независимы и построение экспорта не мутирует Project", () => {
  const first = project({ exportSettings: { markupPresentation: "distributed", taxPresentation: "distributed" } });
  const second = project({ id: "second" });
  const before = structuredClone(first);
  buildExportEstimateModel(first);
  assert.deepEqual(first, before);
  assert.equal(normalizeExportSettings(first.exportSettings).markupPresentation, "distributed");
  assert.equal(normalizeExportSettings(second.exportSettings).markupPresentation, "separate_line");
});

test("маркап отдельной строкой учитывается ровно один раз", () => {
  const model = buildExportEstimateModel(project(), { markupPresentation: "separate_line", taxPresentation: "separate_line" });
  assert.equal(model.separateRows.filter((row) => row.type === "markup").length, 1);
  assert.equal(model.stages[0].rows.reduce((sum, row) => sum + row.distributedMarkupAmountMinor, 0), 0);
  assert.equal(validateExportModelTotals(model).valid, true);
});

test("фактический task-level markup используется и в сумме равен markupAmount", () => {
  const source = project({ stages: [{ id: "stage", name: "Этап", tasks: [task("one", "A", 100, 10), task("two", "B", 200, 30)] }] });
  const model = buildExportEstimateModel(source, { markupPresentation: "distributed", taxPresentation: "separate_line" });
  assert.deepEqual(model.stages[0].rows.map((row) => row.distributedMarkupAmount), [10, 60]);
  assert.equal(model.stages[0].rows.reduce((sum, row) => sum + row.distributedMarkupAmountMinor, 0), model.summary.markupAmountMinor);
  assert.equal(model.separateRows.some((row) => row.type === "markup"), false);
});

test("общий маркап распределяется пропорционально, нулевая задача получает ноль", () => {
  const source = project({ stages: [{ id: "stage", name: "Этап", tasks: [task("zero", "0", 0), task("one", "1", 100), task("three", "3", 300)] }] });
  const model = buildExportEstimateModel(source, { markupPresentation: "distributed", taxPresentation: "separate_line" });
  assert.deepEqual(model.stages[0].rows.map((row) => row.distributedMarkupAmount), [0, 20, 60]);
});

test("налоговые сущности сохраняют фактические названия, ставки, базы и суммы", () => {
  const breakdown = projectTaxBreakdown(project());
  assert.deepEqual(breakdown.map((item) => item.systemLabel), ["УСН", "НДС"]);
  assert.deepEqual(breakdown.map((item) => item.rate), [6, 20]);
  assert.ok(breakdown.every((item) => Number.isFinite(item.baseAmount) && Number.isFinite(item.amount)));
});

test("смена налоговой сущности автоматически отражается в export без формул в export-модуле", () => {
  const source = project({ tax: { type: "ausn", percent: 8 } });
  const model = buildExportEstimateModel(source);
  assert.match(model.separateRows.find((row) => row.metadata.type === "ausn").label, /АУСН.*8/);
  const exportSource = readFileSync(new URL("../src/exportEstimate.js", import.meta.url), "utf8");
  assert.doesNotMatch(exportSource, /\b(usn|ausn|osno)\b/);
});

test("несколько налоговых компонентов выводятся отдельными строками в логическом порядке", () => {
  const model = buildExportEstimateModel(project());
  assert.deepEqual(model.separateRows.filter((row) => row.type === "tax").map((row) => row.metadata.type), ["usn", "vat"]);
});

test("каждый налоговый компонент распределяется точно и не учитывается дважды", () => {
  const model = buildExportEstimateModel(project(), { markupPresentation: "separate_line", taxPresentation: "distributed" });
  for (const component of model.summary.taxBreakdown.filter((item) => item.type !== "vat")) {
    const distributed = model.stages.flatMap((stage) => stage.rows).flatMap((row) => row.distributedTaxBreakdown).filter((item) => item.id === component.id).reduce((sum, item) => sum + item.amountMinor, 0);
    assert.equal(distributed, component.amountMinor);
  }
  assert.deepEqual(model.separateRows.filter((row) => row.type === "tax").map((row) => row.metadata.type), ["vat"]);
});

test("НДС всегда остаётся отдельной строкой при любой настройке налога", () => {
  for (const taxPresentation of ["distributed", "separate_line"]) {
    const model = buildExportEstimateModel(project(), { markupPresentation: "distributed", taxPresentation });
    assert.equal(model.separateRows.filter((row) => row.metadata.type === "vat").length, 1);
    assert.equal(model.stages.flatMap((stage) => stage.rows).flatMap((row) => row.distributedTaxBreakdown).some((item) => item.type === "vat"), false);
  }
});

test("финкомиссия исполнителей выделяется из себестоимости без повторного прибавления", () => {
  const executor = { amount: "1000", tags: [{ key: "payment", payment: { type: "fix_total" } }, { key: "tax", value: "20" }] };
  const source = project({ stages: [{ id: "stage", name: "Этап", tasks: [{ id: "task", name: "Задача", executors: [executor] }] }] });
  assert.equal(executorFinancialCommission(executor), 250);
  assert.equal(projectFinancialCommission(source), 250);
});

for (const markupPresentation of ["distributed", "separate_line"]) {
  for (const taxPresentation of ["distributed", "separate_line"]) {
    test(`комбинация ${markupPresentation} + ${taxPresentation} равна canonical total`, () => {
      const source = project();
      const model = buildExportEstimateModel(source, { markupPresentation, taxPresentation });
      assert.equal(model.summary.total, projectTotalWithTax(source));
      assert.equal(model.validation.valid, true);
    });
  }
}

test("minor-unit allocation сохраняет копейки и deterministic largest remainder", () => {
  assert.deepEqual(allocateMoneyProportionally(1, [{ weight: 1 }, { weight: 1 }]), [1, 0]);
  assert.deepEqual(allocateMoneyProportionally(10001, [{ weight: 1 }, { weight: 2 }, { weight: 3 }]), [1667, 3334, 5000]);
  assert.equal(allocateMoneyProportionally(10001, [{ weight: 1 }, { weight: 2 }, { weight: 3 }]).reduce((a, b) => a + b), 10001);
});

test("нулевые веса не создают NaN/Infinity и сигнализируют о невозможности распределения", () => {
  assert.equal(allocateMoneyProportionally(1, [{ weight: 0 }, { weight: 0 }]), null);
  assert.equal(distributeMarkupAcrossTasks(1, [{ actualMarkupMinor: 0, baseAmountMinor: 0 }]), null);
  assert.equal(distributeTaxAcrossTasks(1, [{ preTaxAmountMinor: 0 }]), null);
});

test("stage subtotal равен задачам, и одинаковые имена не объединяются", () => {
  const model = buildExportEstimateModel(project(), { markupPresentation: "distributed", taxPresentation: "distributed" });
  assert.equal(model.stages[0].exportedSubtotalMinor, model.stages[0].rows.reduce((sum, row) => sum + row.exportedAmountMinor, 0));
  assert.equal(model.stages[0].rows.length, 2);
  assert.deepEqual(model.stages[0].rows.map((row) => row.sourceTaskId), ["one", "two"]);
});

test("распределение существует только на Task, не на Stage или Executor", () => {
  const model = buildExportEstimateModel(project(), { markupPresentation: "distributed", taxPresentation: "distributed" });
  assert.equal("distributedMarkupAmount" in model.stages[0], false);
  assert.equal("executors" in model.stages[0].rows[0], false);
  assert.ok("distributedTaxAmount" in model.stages[0].rows[0]);
});

test("PDF, Excel и preview получают один ExportEstimateModel без собственных финансовых вызовов", () => {
  const source = readFileSync(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  assert.match(source, /exportExcel\(model/);
  assert.match(source, /exportPdf\(model/);
  assert.match(source, /ExportPreview model=\{model\}/);
  assert.doesNotMatch(source, /projectTaxAmount|projectVatAmount|projectMarkupAmount|taskPrice|projectTotalWithTax/);
});

test("все денежные Excel cells являются числами с рублёвым number format", () => {
  const model = buildExportEstimateModel(project(), { markupPresentation: "separate_line", taxPresentation: "separate_line" });
  const workbook = buildExcelWorkbook(model);
  const sheet = workbook.worksheets[0];
  const expectedMoneyCells = buildExcelRows(model).rows.length + 1;
  const moneyCells = [];
  sheet.eachRow((row) => {
    const cell = row.getCell(2);
    if (cell.numFmt?.includes("₽")) moneyCells.push(cell);
  });
  assert.equal(moneyCells.length, expectedMoneyCells);
  assert.ok(moneyCells.every((cell) => typeof cell.value === "number" && Number.isFinite(cell.value)));
});

test("Executor name и role получают гибкую ширину, ellipsis и полный title", () => {
  const component = readFileSync(new URL("../src/components/Executor.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.js", import.meta.url), "utf8");
  assert.match(component, /kb-tag-\$\{tag\.key\}/);
  assert.match(component, /title=\{\["name", "role"\]\.includes\(tag\.key\)/);
  assert.match(styles, /\.kb-tag-name,\.kb-tag-role\{[^}]*flex:1 1 220px;[^}]*min-width:0;[^}]*max-width:280px/);
  assert.match(styles, /\.kb-erow-tags\{[^}]*min-width:0/);
  assert.match(styles, /\.kb-tag-val,\.kb-tag-placeholder\{[^}]*overflow:hidden; text-overflow:ellipsis/);
});

test("настройка брендинга доступна из модалки экспорта и используется обоими форматами", () => {
  const source = readFileSync(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  assert.match(source, /aria-label="Настроить брендинг сметы"/);
  assert.match(source, /<BrandingSettings branding=\{project\.branding\}/);
  assert.match(source, /buildExcelWorkbook\(model, addExcelLogo\)/);
  assert.match(source, /model\.brand\?\.logo/);
});

test("legacy external estimate сохраняется, но не влияет на runtime export", () => {
  const canonical = project();
  const legacy = { ...canonical, externalEstimate: { total: 1, stages: [{ id: "legacy" }] }, clientEstimate: { total: 2 }, tax: { ...canonical.tax, visible: false } };
  const before = structuredClone(legacy);
  const model = buildExportEstimateModel(legacy);
  assert.deepEqual(legacy.externalEstimate, before.externalEstimate);
  assert.deepEqual(legacy.clientEstimate, before.clientEstimate);
  assert.equal(model.summary.total, projectTotalWithTax(canonical));
});
