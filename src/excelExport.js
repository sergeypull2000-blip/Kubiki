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
  workbook.calcProperties = { calcMode: "auto", fullCalcOnLoad: true, forceFullCalc: true };
  const sheet = workbook.addWorksheet("Смета", { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 60 }, { width: 20 }];
  const brand = model.brand || {};
  if (brand.logo && addLogo) addLogo(workbook, sheet, brand.logo);
  if (brand.studioName) { sheet.addRow([brand.studioName, ""]); sheet.mergeCells("A1:B1"); }
  if (brand.contacts) { sheet.addRow([brand.contacts, ""]); sheet.mergeCells(`A${sheet.rowCount}:B${sheet.rowCount}`); }
  sheet.addRow([model.projectName, ""]); sheet.mergeCells(`A${sheet.rowCount}:B${sheet.rowCount}`);
  sheet.getCell(`A${sheet.rowCount}`).font = { bold: true, size: 15, name: "Inter" };
  sheet.addRow([new Date().toLocaleDateString("ru-RU"), ""]); sheet.addRow([]);
  const totalReferences = [];
  for (const stage of model.stages) {
    const stageRow = sheet.addRow([stage.name, null]);
    stageRow.font = { bold: true, name: "Inter" };
    const firstTaskRow = stageRow.number + 1;
    for (const task of stage.rows) {
      const taskRow = sheet.addRow([`  ${task.name}`, moneyValue(task.exportedAmount)]);
      taskRow.getCell(2).numFmt = '#,##0.00" ₽"';
    }
    const lastTaskRow = sheet.rowCount;
    const stageCell = stageRow.getCell(2);
    stageCell.value = { formula: `SUM(B${firstTaskRow}:B${lastTaskRow})` };
    stageCell.numFmt = '#,##0.00" ₽"';
    totalReferences.push(stageCell.address);
  }
  for (const row of model.separateRows) {
    const separateRow = sheet.addRow([row.label, moneyValue(row.amount)]);
    separateRow.font = { italic: true, name: "Inter" };
    separateRow.getCell(2).numFmt = '#,##0.00" ₽"';
    totalReferences.push(separateRow.getCell(2).address);
  }
  sheet.addRow([]);
  const totalRow = sheet.addRow(["ИТОГО", { formula: `SUM(${totalReferences.join(",")})` }]);
  totalRow.font = { bold: true, size: 13, name: "Inter" }; totalRow.getCell(2).numFmt = '#,##0.00" ₽"';
  sheet.eachRow((row) => row.eachCell((cell) => { cell.font = { name: "Inter", ...(cell.font || {}) }; }));
  return workbook;
}
