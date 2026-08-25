import ExcelJS from "exceljs";

const moneyValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError("Excel money value must be finite");
  return numeric;
};
const excelColor = (value, fallback) => `FF${String(value || fallback).replace("#", "").toUpperCase()}`;

const NUMERIC_FMT = "#,##0.00";
const RUB_FMT = '#,##0.00" ₽"';

// Branded full-row fills (Stage/Total/task color) must end at the last used
// column. Apply the fill per-cell 1..lastColumn only — never set the row-level
// fill (ExcelJS would spread the row style across empty Excel columns to the right).
const paintRow = (row, lastColumn, argb) => {
  const fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  for (let col = 1; col <= lastColumn; col += 1) row.getCell(col).fill = fill;
};

export function buildExcelRows(model) {
  const rows = [];
  for (const stage of model.stages) {
    rows.push({ type: "stage", number: stage.number, label: stage.name, amount: stage.exportedSubtotal, color: stage.color });
    for (const task of stage.rows) {
      rows.push({ type: "task", number: task.number, label: task.name, amount: task.exportedAmount, sourceTaskId: task.sourceTaskId, comment: task.comment, color: task.color });
      for (const performer of task.performers) rows.push({ ...performer, label: performer.label });
    }
  }
  for (const row of model.separateRows) rows.push({ type: row.type, label: row.label, amount: row.amount });
  return { rows, total: model.summary.total };
}

export function buildExcelWorkbook(model, addLogo) {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties = { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true };
  const sheet = workbook.addWorksheet("Смета", { views: [{ showGridLines: false }] });
  const showComments = model.settings?.content?.showComments;
  // Excel columns: № | Наименование | [Комментарии] | Сумма
  const commentColumn = showComments ? 3 : null;
  const amountColumn = showComments ? 4 : 3;
  sheet.columns = [{ width: 8 }, { width: 48 }, ...(showComments ? [{ width: 40 }] : []), { width: 20 }];
  const brand = model.brand || {};
  const brandRow = brand.companyName ? sheet.addRow([brand.companyName]) : sheet.addRow([]);
  sheet.mergeCells(brandRow.number, 1, brandRow.number, sheet.columnCount);
  brandRow.getCell(1).alignment = { horizontal: brand.companyPosition || "left", vertical: "top" };
  if (brand.companyName) brandRow.getCell(1).font = { bold: true, size: 12, name: brand.fontFamily || "Roboto" };
  if (brand.logoUrl && addLogo) addLogo(workbook, sheet, brand.logoUrl, brand.logoPosition);
  const contacts = [brand.phone, brand.email, brand.website].filter(Boolean).join(" · ");
  if (contacts) { sheet.addRow([contacts]); sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, sheet.columnCount); }
  sheet.addRow([model.proposal?.title || model.projectName]); sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, sheet.columnCount);
  sheet.getCell(`A${sheet.rowCount}`).font = { bold: true, size: model.typography?.title?.size || 15, name: brand.fontFamily || "Roboto" };
  if (model.sheetName) { sheet.addRow([model.sheetName]); sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, sheet.columnCount); sheet.getCell(`A${sheet.rowCount}`).font = { size: model.typography?.stage?.size || 11, name: brand.fontFamily || "Roboto", color: { argb: "FF64748B" } }; }
  const dateRow = sheet.addRow([new Date().toLocaleDateString("ru-RU")]);
  sheet.mergeCells(dateRow.number, 1, dateRow.number, amountColumn);
  sheet.getCell(dateRow.number, 1).alignment = { horizontal: "left" };
  sheet.addRow([]);
  const headerRow = sheet.addRow(showComments ? ["№", "Наименование", "Комментарии", "Сумма"] : ["№", "Наименование", "Сумма"]);
  headerRow.font = { bold: true, size: brand.headerFontSize || 10, name: brand.fontFamily || "Roboto", color: { argb: excelColor(brand.colors?.headerText, "#64748B") } };
  paintRow(headerRow, amountColumn, excelColor(brand.colors?.header, "#F7FAFC"));
  const totalReferences = [];
  const derivedBaseReferences = [];
  let derivedBaseAmount = 0;
  for (const stage of model.stages) {
    const stageRow = sheet.addRow([stage.number, stage.name, ...(showComments ? [""] : []), null]);
    stageRow.font = { bold: true, size: model.typography?.stage?.size || 11, name: brand.fontFamily || "Roboto", color: { argb: excelColor(stage.textColor ?? brand.colors?.stageText, "#1A2230") } };
    paintRow(stageRow, amountColumn, excelColor(stage.color, "#EEF2F7"));
    const taskReferences = [];
    for (const task of stage.rows) {
      const taskRow = sheet.addRow([task.number, task.name, ...(showComments ? [task.comment || ""] : []), moneyValue(task.exportedAmount)]);
      taskRow.getCell(amountColumn).numFmt = NUMERIC_FMT;
      taskRow.font = { size: model.typography?.task?.size || 10, name: brand.fontFamily || "Roboto", color: { argb: excelColor(task.textColor ?? brand.colors?.taskText, "#1A2230") } };
      paintRow(taskRow, amountColumn, excelColor(task.color, "#FFFFFF"));
      if (showComments) taskRow.getCell(commentColumn).alignment = { wrapText: true, vertical: "top" };
      taskReferences.push(taskRow.getCell(amountColumn).address);
      for (const performer of task.performers || []) {
        const performerRow = sheet.addRow([performer.number ? String(performer.number) : null, `    ${performer.label}`, ...(showComments ? [""] : []), moneyValue(performer.amount)]);
        performerRow.getCell(amountColumn).numFmt = NUMERIC_FMT;
        performerRow.font = { size: model.typography?.task?.size || 10, name: brand.fontFamily || "Roboto", color: { argb: "64748B" } };
      }
    }
    const stageCell = stageRow.getCell(amountColumn);
    const hasPerformerRows = stage.rows.some((task) => task.performers?.length);
    stageCell.value = { formula: hasPerformerRows ? `SUM(${taskReferences.join(",")})` : `SUM(${taskReferences[0]}:${taskReferences.at(-1)})` };
    stageCell.numFmt = NUMERIC_FMT;
    totalReferences.push(stageCell.address);
    derivedBaseReferences.push(stageCell.address);
    derivedBaseAmount += stage.exportedSubtotal;
  }
  for (const row of model.separateRows) {
    const rate = Number(row.metadata?.rate);
    const baseAmount = Number(row.metadata?.baseAmount);
    if (!Number.isFinite(rate) || !Number.isFinite(baseAmount)) throw new TypeError("Derived Excel money row requires canonical rate and base metadata");
    if (Math.round(baseAmount * 100) !== Math.round(derivedBaseAmount * 100)) throw new TypeError("Derived Excel money row base does not match preceding canonical rows");
    const separateRow = sheet.addRow([null, row.label, ...(showComments ? [""] : []), { formula: `ROUND(SUM(${derivedBaseReferences.join(",")})*${rate}/100,2)` }]);
    separateRow.font = { italic: true, name: "Inter" };
    separateRow.getCell(amountColumn).numFmt = NUMERIC_FMT;
    totalReferences.push(separateRow.getCell(amountColumn).address);
    derivedBaseReferences.push(separateRow.getCell(amountColumn).address);
    derivedBaseAmount += row.amount;
  }
  sheet.addRow([]);
  const totalRow = sheet.addRow([null, model.totalLabel || "ИТОГО", ...(showComments ? [""] : []), { formula: `SUM(${totalReferences.join(",")})` }]);
  totalRow.font = { bold: true, size: model.typography?.total?.size || 13, name: brand.fontFamily || "Roboto", color: { argb: excelColor(model.settings?.branding?.colors?.totalText, "#1A2230") } }; totalRow.getCell(amountColumn).numFmt = RUB_FMT;
  paintRow(totalRow, amountColumn, excelColor(model.settings?.branding?.colors?.total, "#E8EEF7"));
  for (const serviceText of model.serviceBlocks || []) { const row = sheet.addRow([serviceText]); sheet.mergeCells(row.number, 1, row.number, sheet.columnCount); row.font = { size: model.typography?.service?.size || 8, name: brand.fontFamily || "Roboto" }; }
  sheet.eachRow((row) => row.eachCell((cell) => { cell.font = { name: brand.fontFamily || "Roboto", ...(cell.font || {}) }; }));
  return workbook;
}
