import ExcelJS from "exceljs";

const moneyValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError("Excel money value must be finite");
  return numeric;
};

export function buildExcelRows(model) {
  const rows = [];
  for (const stage of model.stages) {
    rows.push({ type: "stage", label: stage.name, amount: stage.exportedSubtotal });
    for (const task of stage.rows) rows.push({ type: "task", label: task.name, amount: task.exportedAmount, sourceTaskId: task.sourceTaskId });
  }
  for (const row of model.separateRows) rows.push({ type: row.type, label: row.label, amount: row.amount });
  return { rows, total: model.summary.total };
}

export function buildExcelWorkbook(model, addLogo) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Смета", { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 60 }, { width: 20 }];
  const brand = model.brand || {};
  if (brand.logo && addLogo) addLogo(workbook, sheet, brand.logo);
  if (brand.studioName) { sheet.addRow([brand.studioName, ""]); sheet.mergeCells("A1:B1"); }
  if (brand.contacts) { sheet.addRow([brand.contacts, ""]); sheet.mergeCells(`A${sheet.rowCount}:B${sheet.rowCount}`); }
  sheet.addRow([model.projectName, ""]); sheet.mergeCells(`A${sheet.rowCount}:B${sheet.rowCount}`);
  sheet.getCell(`A${sheet.rowCount}`).font = { bold: true, size: 15, name: "Inter" };
  sheet.addRow([new Date().toLocaleDateString("ru-RU"), ""]); sheet.addRow([]);
  for (const row of buildExcelRows(model).rows) {
    const excelRow = sheet.addRow([row.type === "task" ? `  ${row.label}` : row.label, moneyValue(row.amount)]);
    excelRow.getCell(2).numFmt = '#,##0.00" ₽"';
    if (row.type === "stage") excelRow.font = { bold: true, name: "Inter" };
    if (row.type === "markup" || row.type === "tax") excelRow.font = { italic: true, name: "Inter" };
  }
  sheet.addRow([]);
  const totalRow = sheet.addRow(["ИТОГО", moneyValue(model.summary.total)]);
  totalRow.font = { bold: true, size: 13, name: "Inter" }; totalRow.getCell(2).numFmt = '#,##0.00" ₽"';
  sheet.eachRow((row) => row.eachCell((cell) => { cell.font = { name: "Inter", ...(cell.font || {}) }; }));
  return workbook;
}
