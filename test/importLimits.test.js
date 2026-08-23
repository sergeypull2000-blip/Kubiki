import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { assertImportFileSize, assertWorkbookStructure, MAX_EXCEL_FILE_BYTES, MAX_PDF_FILE_BYTES } from "../src/importLimits.js";

test("file import limits reject oversized Excel and PDF before parsing", () => {
  assert.doesNotThrow(() => assertImportFileSize({ name: "estimate.xlsx", size: MAX_EXCEL_FILE_BYTES }));
  assert.throws(() => assertImportFileSize({ name: "estimate.xlsx", size: MAX_EXCEL_FILE_BYTES + 1 }), /слишком большой/);
  assert.throws(() => assertImportFileSize({ name: "estimate.pdf", size: MAX_PDF_FILE_BYTES + 1 }), /слишком большой/);
});

test("workbook limits bound sheets, dimensions and aggregate cells", () => {
  const valid = { SheetNames: ["Estimate"], Sheets: { Estimate: { "!ref": "A1:J100" } } };
  assert.doesNotThrow(() => assertWorkbookStructure(valid, XLSX.utils.decode_range));
  const tooWide = { SheetNames: ["Estimate"], Sheets: { Estimate: { "!ref": "A1:ZZ10" } } };
  assert.throws(() => assertWorkbookStructure(tooWide, XLSX.utils.decode_range), /слишком большой/);
  const tooMany = { SheetNames: Array.from({ length: 21 }, (_, index) => `S${index}`), Sheets: {} };
  assert.throws(() => assertWorkbookStructure(tooMany, XLSX.utils.decode_range), /Слишком много листов/);
});

