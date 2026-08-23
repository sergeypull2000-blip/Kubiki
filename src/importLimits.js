export const MAX_EXCEL_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXCEL_SHEETS = 20;
export const MAX_EXCEL_ROWS_PER_SHEET = 10_000;
export const MAX_EXCEL_COLUMNS_PER_SHEET = 200;
export const MAX_EXCEL_CELLS_TOTAL = 200_000;
export const MAX_PDF_PAGES = 200;
export const MAX_PDF_TEXT_ITEMS = 100_000;

export function assertImportFileSize(file) {
  const name = String(file?.name || "");
  const size = Number(file?.size) || 0;
  const limit = /\.pdf$/i.test(name) ? MAX_PDF_FILE_BYTES : /\.(xlsx|xls|csv)$/i.test(name) ? MAX_EXCEL_FILE_BYTES : null;
  if (limit !== null && size > limit) throw new Error(`Файл слишком большой. Максимальный размер — ${Math.floor(limit / 1024 / 1024)} МБ.`);
}

export function assertWorkbookStructure(workbook, decodeRange) {
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (!names.length) throw new Error("В Excel-файле нет листов.");
  if (names.length > MAX_EXCEL_SHEETS) throw new Error(`Слишком много листов. Максимум — ${MAX_EXCEL_SHEETS}.`);
  let totalCells = 0;
  for (const name of names) {
    const ref = workbook.Sheets?.[name]?.["!ref"];
    if (!ref) continue;
    let range;
    try { range = decodeRange(ref); } catch { throw new Error("Некорректная структура Excel-файла."); }
    const rows = range.e.r - range.s.r + 1;
    const columns = range.e.c - range.s.c + 1;
    if (rows > MAX_EXCEL_ROWS_PER_SHEET || columns > MAX_EXCEL_COLUMNS_PER_SHEET) {
      throw new Error(`Лист «${name}» слишком большой для импорта.`);
    }
    totalCells += rows * columns;
    if (totalCells > MAX_EXCEL_CELLS_TOTAL) throw new Error("В Excel-файле слишком много ячеек для импорта.");
  }
}

