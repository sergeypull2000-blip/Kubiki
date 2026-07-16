import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";
import { ChevronDown, UploadCloud, Loader2, MoreHorizontal } from "lucide-react";
import { fmt } from "./utils.js";
import {
  getMarkupMode, externalTaskPrice, externalStagePrice,
  projectMarkupAmount, projectEffectiveMarkupPct,
  projectTaxPct, projectTaxAmount, projectTotalWithTax,
  stageSum, taskSum, projectSum, projectPrice,
  projectAnalytics, readExecutor,
} from "./calculations.js";
import { useOutsideClose } from "./hooks.js";

// pdfmake 0.3.x регистрирует шрифты как виртуальную ФС, а не через
// прямое присваивание .vfs (так было в 0.2.x) — addVirtualFileSystem
// кладёт сюда Roboto (обычный/жирный/курсив), уже настроенный как
// шрифт по умолчанию в pdfMake.fonts, и поддерживающий кириллицу.
pdfMake.addVirtualFileSystem(pdfFonts);

/* ============================================================
   ЗАДАЧА 2 — экспорт в фирменном стиле: Excel (ExcelJS) + PDF.
   Цвета/шрифты берём из CSS-переменных приложения (brandColors),
   а не подбираем на глаз. Брендинг — в сторе project.branding.
   Контент зависит от текущего вида (внутренняя/внешняя).

   exceljs и pdfmake — обычные npm-зависимости проекта, импортируются
   напрямую (без CDN в рантайме). PDF собирается программно через
   pdfmake (buildPdfDoc) и скачивается как файл; печать браузера
   (exportPdfPrintFallback) — запасной путь на случай ошибки pdfmake.
   ============================================================ */
function brandColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = (v, f) => (cs.getPropertyValue(v).trim() || f);
  return {
    accent: g("--accent", "#5B8DEF"), text: g("--text", "#1A2230"), muted: g("--text-muted", "#64748B"),
    line: g("--line", "#E3E9F0"), surface: g("--surface", "#FFFFFF"), sunken: g("--surface-sunken", "#F7FAFC"),
  };
}
const hexArgb = (hex) => "FF" + String(hex || "#000000").replace("#", "").padStart(6, "0").slice(0, 6).toUpperCase();
// логотип студии (dataURL из FileReader) → картинка ExcelJS. Поддерживаем
// только форматы, которые принимает ExcelJS; остальное — просто не встраиваем.
function addLogoImage(wb, dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif);base64,/i.exec(dataUrl || "");
  if (!m) return null;
  const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
  return wb.addImage({ base64: dataUrl, extension: ext });
}
// п.4: плашка-бейдж вида сметы показывается только для внутренней (клиент не должен
// видеть пометку «внешняя» на своей смете — это единственное, что он и получает)
const viewLabelText = (view) => (view === "external" ? null : "ВНУТРЕННЯЯ СМЕТА");
const viewTag = (view) => (view === "external" ? "ВНЕШНЯЯ" : "ВНУТРЕННЯЯ");
const safeFile = (s) => (String(s || "smeta").replace(/[^\wа-яА-ЯёЁ\- ]+/g, "").trim().replace(/\s+/g, "_") || "smeta");
const defaultFilename = (project, view, format) => `${safeFile(project.name)}_${viewTag(view)}.${format === "pdf" ? "pdf" : "xlsx"}`;
const ensureExt = (name, ext) => (new RegExp(`\\.${ext}$`, "i").test(name) ? name : `${name.replace(/\.(pdf|xlsx)$/i, "")}.${ext}`);
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* Брендинг вводится одной строкой: экспорт распознаёт первую часть как
   название студии, остальное — как контакты. Совместимо со старой схемой. */
function parseBranding(b) {
  b = b || {};
  let studioName = (b.studioName || "").trim();
  let contacts = (b.contacts || "").trim();
  if (!studioName && !contacts) {
    const raw = String(b.info || "").trim();
    if (raw) {
      const parts = raw.split(/[,\n;·|]/).map((s) => s.trim()).filter(Boolean);
      studioName = parts[0] || "";
      contacts = parts.slice(1).join("   ·   ");
    } else if (b.phone || b.email || b.contactName || b.contactRole) {
      contacts = [b.phone, b.email, [b.contactName, b.contactRole].filter(Boolean).join(", ")].filter(Boolean).join("   ·   ");
    }
  }
  return { logo: b.logo || "", studioName, contacts };
}

/* Единая модель для обоих форматов — читает существующий каскад. */
function buildExportModel(project, view) {
  const gm = project.globalMarkup ?? 0;
  const mode = getMarkupMode(project);
  const external = view === "external";
  const stages = (project.stages || []).filter((s) => (s.tasks || []).length).map((s) => ({
    name: s.name || "Этап",
    subtotal: external ? externalStagePrice(s, gm, mode) : stageSum(s),
    tasks: (s.tasks || []).map((t) => ({
      name: t.name || "Без названия",
      price: external ? externalTaskPrice(t, gm, mode) : taskSum(t),
      execs: external ? [] : (t.executors || []).map((e) => {
        const R = readExecutor(e);
        const meta = [R.role, R.grade].filter(Boolean).join(", ");
        const qty = R.payType === "hourly" ? `${fmt(R.rate)}×${R.qty} ч` : R.payType === "shift" ? `${fmt(R.rate)}×${R.qty} см` : "";
        return { name: R.name + (meta ? ` · ${meta}` : ""), pay: R.payLabel, qty, sum: R.sum };
      }),
    })),
  }));
  const commission = (external && mode === "transparent" && projectMarkupAmount(project) > 0)
    ? { label: `Агентская комиссия / Маркап (${fmt(projectEffectiveMarkupPct(project))}%)`, amount: projectMarkupAmount(project), pct: gm } : null;
  const tax = (external && projectTaxPct(project) > 0)
    ? {
      label: `Налог ${project.tax?.type === "nds" ? "НДС" : "ИП"} (${fmt(projectTaxPct(project))}%)`, amount: projectTaxAmount(project),
      pct: projectTaxPct(project), typeText: project.tax?.type === "nds" ? "НДС" : "ИП",
    } : null;
  return {
    external, stages, commission, tax,
    total: external ? projectTotalWithTax(project) : projectSum(project),
    label: viewLabelText(view), projectName: project.name || "Проект", brand: project.branding || {},
  };
}

/* ---------- Excel через ExcelJS (полное форматирование) ---------- */
async function exportExcelJS(project, view, filename) {
  const M = buildExportModel(project, view);
  const C = brandColors();
  try {
    return await buildAndDownloadExcelJS(M, C, filename);
  } catch (e) {
    // защитный фоллбэк на случай непредвиденной ошибки ExcelJS —
    // чтобы пользователь не остался совсем без файла
    return view === "external" ? exportClientXlsx(project) : exportInternalXlsx(project);
  }
}

async function buildAndDownloadExcelJS(M, C, filename) {
  const ink = hexArgb(C.text), muted = hexArgb(C.muted), lineC = hexArgb(C.line), sunken = hexArgb(C.sunken);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Смета", { views: [{ showGridLines: false }] });
  const ncols = M.external ? 2 : 4;
  ws.columns = M.external ? [{ width: 60 }, { width: 20 }] : [{ width: 52 }, { width: 16 }, { width: 14 }, { width: 18 }];
  const bd = { style: "thin", color: { argb: lineC } };
  const border = { top: bd, left: bd, bottom: bd, right: bd };
  const money = '#,##0" ₽"';
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  let r = 1;
  const b = parseBranding(M.brand);
  if (b.logo) {
    const imgId = addLogoImage(wb, b.logo);
    if (imgId != null) ws.addImage(imgId, { tl: { col: ncols - 1, row: 0 }, ext: { width: 100, height: 36 } });
  }
  if (b.studioName) { ws.mergeCells(r, 1, r, ncols); const c = ws.getCell(r, 1); c.value = b.studioName; c.font = { bold: true, size: 15, color: { argb: ink } }; r++; }
  const contacts = b.contacts;
  if (contacts) { ws.mergeCells(r, 1, r, ncols); const c = ws.getCell(r, 1); c.value = contacts; c.font = { size: 10, color: { argb: muted } }; r++; }
  r++;
  if (M.label) { ws.mergeCells(r, 1, r, ncols); { const c = ws.getCell(r, 1); c.value = M.label; c.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } }; c.fill = fill(ink); c.alignment = { vertical: "middle", indent: 1 }; ws.getRow(r).height = 22; } r++; }
  ws.mergeCells(r, 1, r, ncols); { const c = ws.getCell(r, 1); c.value = M.projectName; c.font = { bold: true, size: 14, color: { argb: ink } }; } r++;
  r++;
  const headers = M.external ? ["Позиция", "Цена"] : ["Позиция / исполнитель", "Оплата", "Кол-во", "Сумма"];
  headers.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fill(ink); c.alignment = { horizontal: i === ncols - 1 ? "right" : "left" }; c.border = border; });
  ws.getRow(r).height = 18; r++;
  const paramsRow0 = r; // верхняя строка блока «Параметры» (маркап/налог %) — колонки правее таблицы
  const stageCellAddrs = [];
  for (const s of M.stages) {
    ws.mergeCells(r, 1, r, ncols - 1);
    const sc = ws.getCell(r, 1); sc.value = s.name.toUpperCase(); sc.font = { bold: true, color: { argb: ink } }; sc.fill = fill(sunken); sc.alignment = { indent: 1 };
    const sv = ws.getCell(r, ncols); sv.numFmt = money; sv.font = { bold: true, color: { argb: ink } }; sv.fill = fill(sunken); sv.alignment = { horizontal: "right" };
    for (let c = 1; c <= ncols; c++) ws.getCell(r, c).border = border;
    r++;
    const taskCellAddrs = [];
    for (const t of s.tasks) {
      if (M.external) ws.mergeCells(r, 1, r, ncols - 1);
      const tc = ws.getCell(r, 1); tc.value = "  " + t.name; tc.font = { bold: !M.external, color: { argb: ink } };
      // база сметы: стоимость задачи — живое значение, которое меняет продюсер;
      // всё остальное (этап/проект/маркап/налог/итог) — формулы поверх этих ячеек
      const pv = ws.getCell(r, ncols); pv.value = Math.round(t.price); pv.numFmt = money; pv.font = { color: { argb: ink } }; pv.alignment = { horizontal: "right" };
      taskCellAddrs.push(pv.address);
      for (let c = 1; c <= ncols; c++) ws.getCell(r, c).border = border;
      r++;
      for (const e of t.execs) {
        const c1 = ws.getCell(r, 1); c1.value = "      " + e.name;
        ws.getCell(r, 2).value = e.pay; ws.getCell(r, 3).value = e.qty;
        const ev = ws.getCell(r, 4); ev.value = Math.round(e.sum); ev.numFmt = money; ev.alignment = { horizontal: "right" };
        for (let c = 1; c <= ncols; c++) { const cell = ws.getCell(r, c); cell.font = { size: 10, color: { argb: muted } }; cell.border = border; }
        r++;
      }
    }
    sv.value = taskCellAddrs.length ? { formula: `SUM(${taskCellAddrs.join(",")})` } : 0;
    stageCellAddrs.push(sv.address);
  }
  const totalBase = stageCellAddrs.length ? `SUM(${stageCellAddrs.join(",")})` : "0";

  // маркап % и ставка налога — в отдельных помеченных ячейках справа от таблицы,
  // чтобы формулы комиссии/налога/итога ссылались на них (продюсер меняет процент — всё пересчитывается)
  let markupPctAddr = null, taxPctAddr = null;
  if (M.commission || M.tax) {
    const pcol = ncols + 2;
    let pr = paramsRow0;
    const pt = ws.getCell(pr, pcol); pt.value = "Параметры"; pt.font = { bold: true, size: 10, color: { argb: ink } }; pr++;
    if (M.commission) {
      ws.getCell(pr, pcol).value = "Маркап, %"; ws.getCell(pr, pcol).font = { size: 10, color: { argb: muted } };
      const pv = ws.getCell(pr, pcol + 1); pv.value = M.commission.pct; pv.numFmt = '0.##"%"'; pv.font = { size: 10, bold: true, color: { argb: ink } }; pv.alignment = { horizontal: "right" };
      markupPctAddr = pv.address; pr++;
    }
    if (M.tax) {
      ws.getCell(pr, pcol).value = "Налог, %"; ws.getCell(pr, pcol).font = { size: 10, color: { argb: muted } };
      const pv = ws.getCell(pr, pcol + 1); pv.value = M.tax.pct; pv.numFmt = '0.##"%"'; pv.font = { size: 10, bold: true, color: { argb: ink } }; pv.alignment = { horizontal: "right" };
      taxPctAddr = pv.address; pr++;
    }
    ws.getColumn(pcol).width = 14; ws.getColumn(pcol + 1).width = 10;
  }

  let commissionAddr = null, taxAddr = null;
  if (M.commission) {
    ws.mergeCells(r, 1, r, ncols - 1);
    const cc = ws.getCell(r, 1);
    cc.value = { formula: `"Агентская комиссия / Маркап ("&${markupPctAddr}&"%)"` };
    cc.font = { italic: true, color: { argb: muted } };
    const cv = ws.getCell(r, ncols); cv.value = { formula: `${totalBase}*${markupPctAddr}/100` }; cv.numFmt = money; cv.font = { italic: true, color: { argb: ink } }; cv.alignment = { horizontal: "right" };
    for (let c = 1; c <= ncols; c++) ws.getCell(r, c).border = border;
    commissionAddr = cv.address;
    r++;
  }
  if (M.tax) {
    ws.mergeCells(r, 1, r, ncols - 1);
    const cc = ws.getCell(r, 1);
    cc.value = { formula: `"Налог ${M.tax.typeText} ("&${taxPctAddr}&"%)"` };
    cc.font = { italic: true, color: { argb: muted } };
    const taxBase = commissionAddr ? `(${totalBase}+${commissionAddr})` : `(${totalBase})`;
    const cv = ws.getCell(r, ncols); cv.value = { formula: `${taxBase}*${taxPctAddr}/100` }; cv.numFmt = money; cv.font = { italic: true, color: { argb: ink } }; cv.alignment = { horizontal: "right" };
    for (let c = 1; c <= ncols; c++) ws.getCell(r, c).border = border;
    taxAddr = cv.address;
    r++;
  }
  ws.mergeCells(r, 1, r, ncols - 1);
  const gc = ws.getCell(r, 1); gc.value = M.external ? "ИТОГО" : "ИТОГО СЕБЕСТОИМОСТЬ"; gc.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; gc.fill = fill(ink); gc.alignment = { horizontal: "right", indent: 1 };
  let totalFormula = totalBase;
  if (commissionAddr) totalFormula += `+${commissionAddr}`;
  if (taxAddr) totalFormula += `+${taxAddr}`;
  const gv = ws.getCell(r, ncols); gv.value = stageCellAddrs.length ? { formula: totalFormula } : Math.round(M.total); gv.numFmt = money; gv.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } }; gv.fill = fill(ink); gv.alignment = { horizontal: "right" };
  ws.getRow(r).height = 22;

  // шрифт как в приложении (Inter) на все ячейки
  ws.eachRow((row) => row.eachCell((cell) => { cell.font = { name: "Inter", ...(cell.font || {}) }; }));

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

/* ---------- PDF ----------
   Программный PDF через pdfmake (вектор, кириллица через шрифт Roboto
   из vfs, см. pdfMake.addVirtualFileSystem выше). Печать браузера
   (exportPdfPrintFallback) — запасной путь на случай ошибки pdfmake. */
async function exportPdf(project, view, filename) {
  const M = buildExportModel(project, view);
  const C = brandColors();
  const b = parseBranding(M.brand);

  try {
    pdfMake.createPdf(buildPdfDoc(M, C, b)).download(ensureExt(filename, "pdf"));
  } catch (_) {
    exportPdfPrintFallback(project, view, filename, M, C, b);
  }
}

/* Документ pdfmake (для боевого пути; в превью не вызывается). */
function buildPdfDoc(M, C, b) {
  const money = (n) => fmt(n) + " ₽";
  const INK = C.text || "#1A2230", GREY = C.muted || "#64748B", LINE = C.line || "#E3E9F0", SUNKEN = C.sunken || "#F7FAFC";
  const body = [];
  for (const s of M.stages) {
    body.push([
      { text: s.name.toUpperCase(), bold: true, color: INK, fillColor: SUNKEN, margin: [2, 4, 2, 4] },
      { text: money(s.subtotal), bold: true, color: INK, fillColor: SUNKEN, alignment: "right", margin: [2, 4, 2, 4] },
    ]);
    for (const t of s.tasks) {
      body.push([
        { text: t.name, bold: !M.external, color: INK, margin: [8, 3, 2, 3] },
        { text: money(t.price), color: INK, alignment: "right", margin: [2, 3, 2, 3] },
      ]);
      for (const e of t.execs) {
        const q = [e.pay, e.qty].filter(Boolean).join(" · ");
        body.push([
          { text: `${e.name}${q ? "   " + q : ""}`, color: GREY, fontSize: 9, margin: [20, 2, 2, 2] },
          { text: money(e.sum), color: GREY, fontSize: 9, alignment: "right", margin: [2, 2, 2, 2] },
        ]);
      }
    }
  }
  if (M.commission) body.push([
    { text: M.commission.label, italics: true, color: GREY, margin: [2, 4, 2, 4] },
    { text: money(M.commission.amount), italics: true, color: GREY, alignment: "right", margin: [2, 4, 2, 4] },
  ]);
  if (M.tax) body.push([
    { text: M.tax.label, italics: true, color: GREY, margin: [2, 4, 2, 4] },
    { text: money(M.tax.amount), italics: true, color: GREY, alignment: "right", margin: [2, 4, 2, 4] },
  ]);
  return {
    pageSize: "A4", pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: "Roboto", fontSize: 10, color: INK },
    content: [
      { columns: [
        { width: "*", stack: [
          ...(b.logo ? [{ image: b.logo, fit: [130, 46] }] : []),
          ...(b.studioName ? [{ text: b.studioName, bold: true, fontSize: 13, margin: [0, b.logo ? 6 : 0, 0, 0] }] : []),
          ...(b.contacts ? [{ text: b.contacts, color: GREY, fontSize: 9, margin: [0, 2, 0, 0] }] : []),
        ] },
        { width: "auto", stack: [{ text: new Date().toLocaleDateString("ru-RU"), color: GREY, fontSize: 9, alignment: "right" }] },
      ], columnGap: 16 },
      ...(M.label ? [{ table: { widths: ["auto"], body: [[{ text: M.label, color: "#FFFFFF", bold: true, fontSize: 11, fillColor: INK, margin: [8, 5, 8, 5] }]] }, layout: "noBorders", margin: [0, 10, 0, 8] }] : []),
      { text: M.projectName, bold: true, fontSize: 15, margin: [0, M.label ? 0 : 10, 0, 12] },
      { table: { widths: ["*", "auto"], body }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => LINE, paddingLeft: () => 0, paddingRight: () => 0 } },
      { columns: [{ text: M.external ? "Итого" : "Итого себестоимость", bold: true, fontSize: 13 }, { text: money(M.total), bold: true, fontSize: 13, alignment: "right" }], margin: [0, 14, 0, 0] },
    ],
  };
}

/* Запасной путь: печать браузера (если pdfmake не поднялся). */
function exportPdfPrintFallback(project, view, filename, M, C, b) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const money = (n) => fmt(n) + " ₽";
  const logo = b.logo ? `<img class="logo" src="${b.logo}"/>` : "";
  const contacts = b.contacts ? esc(b.contacts) : "";
  const body = M.stages.map((s) => {
    const tasks = s.tasks.map((t) => {
      const execs = (t.execs || []).map((e) =>
        `<tr class="ex"><td>${esc(e.name)} <span class="dim">${esc([e.pay, e.qty].filter(Boolean).join(" · "))}</span></td><td class="r">${money(e.sum)}</td></tr>`).join("");
      return `<tr class="tk"><td>${esc(t.name)}</td><td class="r">${money(t.price)}</td></tr>${execs}`;
    }).join("");
    return `<tr class="st"><td>${esc(s.name)}</td><td class="r">${money(s.subtotal)}</td></tr>${tasks}`;
  }).join("");
  const commission = M.commission ? `<tr class="comm"><td>${esc(M.commission.label)}</td><td class="r">${money(M.commission.amount)}</td></tr>` : "";
  const taxRow = M.tax ? `<tr class="comm"><td>${esc(M.tax.label)}</td><td class="r">${money(M.tax.amount)}</td></tr>` : "";
  const totalLabel = M.external ? "Итого" : "Итого себестоимость";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(filename)}</title>
<style>
  *{box-sizing:border-box} body{font:14px/1.55 Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:${C.text};margin:40px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:1px solid ${C.line};padding-bottom:14px}
  .logo{max-height:54px;max-width:180px;object-fit:contain;margin-bottom:8px;display:block}
  .studio{font-size:17px;font-weight:700} .contact{color:${C.muted};font-size:12px;margin-top:2px}
  .date{color:${C.muted};font-size:12px;text-align:right}
  .label{margin:16px 0 4px;background:${C.text};color:#fff;font-weight:700;font-size:13px;letter-spacing:.04em;padding:8px 12px;border-radius:6px;display:inline-block}
  h1{font-size:18px;margin:8px 0 16px}
  table{width:100%;border-collapse:collapse} td{padding:7px 8px;border-bottom:1px solid ${C.line}}
  .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap} .dim{color:${C.muted};font-size:12px}
  tr.st td{background:${C.sunken};font-weight:700} tr.tk td{font-weight:600}
  tr.tk td:first-child{padding-left:20px} tr.ex td:first-child{padding-left:34px;color:${C.muted}}
  tr.comm td{font-style:italic;color:${C.muted}}
  .total{display:flex;justify-content:space-between;margin-top:18px;padding-top:14px;border-top:2px solid ${C.text};font-size:16px;font-weight:700}
  @media print{body{margin:0;padding:22px}}
</style></head><body>
  <div class="head">
    <div>${logo}<div class="studio">${esc(b.studioName || "")}</div>${contacts ? `<div class="contact">${contacts}</div>` : ""}</div>
    <div class="date">${new Date().toLocaleDateString("ru-RU")}</div>
  </div>
  ${M.label ? `<div class="label">${esc(M.label)}</div>` : ""}
  <h1>${esc(M.projectName)}</h1>
  <table>${body}${commission}${taxRow}</table>
  <div class="total"><span>${totalLabel}</span><span>${money(M.total)}</span></div>
</body></html>`;
  printHtml(html, filename);
}

function printHtml(html, filename) {
  // Печать через скрытый iframe — без popup-вкладки (её песочница блокирует).
  try {
    const ifr = document.createElement("iframe");
    // Размер 0×0 + visibility:hidden ненадёжен: часть браузеров (в т.ч. свежий
    // Chrome) считает такой фрейм «нечего печатать» и тихо не открывает диалог
    // печати. Держим реальный размер листа A4, но уводим за пределы экрана —
    // это устойчивый паттерн для «невидимой» печати.
    ifr.style.cssText = "position:fixed;top:-10000px;left:-10000px;width:794px;height:1123px;border:0";
    document.body.appendChild(ifr);
    const d = ifr.contentWindow.document; d.open(); d.write(html); d.close();
    const done = () => setTimeout(() => ifr.remove(), 2000);
    setTimeout(() => {
      try { ifr.contentWindow.focus(); ifr.contentWindow.print(); done(); }
      catch (_) { ifr.remove(); downloadBlob(new Blob([html], { type: "text/html" }), filename.replace(/\.pdf$/i, "") + ".html"); }
    }, 400);
    return;
  } catch (_) {
    downloadBlob(new Blob([html], { type: "text/html" }), filename.replace(/\.pdf$/i, "") + ".html");
  }
}

function exportInternalXlsx(project) {
  const A = projectAnalytics(project);
  const aoa = [];
  aoa.push([`${project.name || "Проект"} — внутренний аудит`, "", "", ""]);
  aoa.push([new Date().toLocaleDateString("ru-RU"), "", "", ""]);
  aoa.push([]);
  aoa.push(["КОТЁЛ · сводная аналитика", "", "", ""]);
  aoa.push(["Себестоимость", "", "", Math.round(A.cost)]);
  aoa.push(["Часы (почасовые)", "", "", A.hours]);
  aoa.push(["Смены (посменные)", "", "", A.shifts]);
  aoa.push(["Маркап (наценка), ₽", "", "", Math.round(A.margin)]);
  aoa.push(["Цена для клиента", "", "", Math.round(A.clientTotal)]);
  aoa.push([`Чистая маржа (${A.marginPct.toFixed(1)}%)`, "", "", Math.round(A.margin)]);
  aoa.push([]);
  aoa.push(["Позиция / исполнитель", "Оплата", "Кол-во", "Сумма, ₽"]);
  for (const s of project.stages || []) {
    if (!(s.tasks || []).length) continue;
    aoa.push([(s.name || "Этап").toUpperCase(), "", "", Math.round(stageSum(s))]);
    for (const t of s.tasks || []) {
      aoa.push(["  " + (t.name || "Без названия"), "", "", Math.round(taskSum(t))]);
      for (const e of t.executors || []) {
        const R = readExecutor(e);
        const bits = [R.role, R.grade].filter(Boolean).join(", ");
        const qty = R.payType === "hourly" ? `${R.rate}×${R.qty} ч` : R.payType === "shift" ? `${R.rate}×${R.qty} см` : "";
        aoa.push(["      " + R.name + (bits ? " · " + bits : ""), R.payLabel, qty, Math.round(R.sum)]);
      }
    }
    aoa.push([`Итого по этапу «${s.name || ""}»`, "", "", Math.round(stageSum(s))]);
    aoa.push([]);
  }
  aoa.push(["ИТОГО СЕБЕСТОИМОСТЬ", "", "", Math.round(A.cost)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 46 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Внутренний аудит");
  const safe = (project.name || "smeta").replace(/[^\wа-яА-ЯёЁ\- ]+/g, "").trim() || "smeta";
  XLSX.writeFile(wb, `${safe} — внутренний аудит.xlsx`);
}

function exportClientXlsx(project) {
  const mode = getMarkupMode(project);
  const gm = project.globalMarkup ?? 0;
  const aoa = [];
  aoa.push([`${project.name || "Проект"} — смета для клиента`, ""]);
  aoa.push([new Date().toLocaleDateString("ru-RU"), ""]);
  aoa.push([]);
  aoa.push(["Позиция", "Цена, ₽"]);
  for (const s of project.stages || []) {
    if (!(s.tasks || []).length) continue;
    aoa.push([(s.name || "Этап").toUpperCase(), Math.round(externalStagePrice(s, gm, mode))]);
    for (const t of s.tasks || []) aoa.push(["  " + (t.name || "Без названия"), Math.round(externalTaskPrice(t, gm, mode))]);
  }
  const markupAmount = projectMarkupAmount(project);
  if (mode === "transparent" && markupAmount > 0)
    aoa.push([`Агентская комиссия / Маркап (${fmt(projectEffectiveMarkupPct(project))}%)`, Math.round(markupAmount)]);
  aoa.push([]);
  aoa.push(["ИТОГО", Math.round(projectPrice(project))]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 52 }, { wch: 16 }];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Смета для клиента");
  const safe = (project.name || "smeta").replace(/[^\wа-яА-ЯёЁ\- ]+/g, "").trim() || "smeta";
  XLSX.writeFile(wb, `${safe} — смета для клиента.xlsx`);
}

/* Редактор брендинга (в «…»): компактная панель слева от правой панели.
   Логотип квадратом + одна строка со всеми данными (студия, телефон, email,
   имя, должность) — экспорт распознаёт их сам (см. parseBranding). */
function BrandingSettings({ branding, onSave, onClose, style }) {
  const [d, setD] = useState({ logo: "", studioName: "", contacts: "", ...branding });
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  // миграция старой одностроч./полевой схемы
  useEffect(() => {
    if (!d.studioName && !d.contacts && (branding.info || branding.phone || branding.email || branding.contactName || branding.contactRole)) {
      const p = parseBranding(branding);
      setD((x) => ({ ...x, studioName: p.studioName, contacts: p.contacts }));
    }
    // eslint-disable-next-line
  }, []);
  const onLogo = (file) => { if (!file) return; const r = new FileReader(); r.onload = () => setD((x) => ({ ...x, logo: r.result })); r.readAsDataURL(file); };
  return (
    <div className="kb-brand-pop" ref={ref} style={style || undefined}>
      <div className="kb-brand-title">Брендинг студии</div>
      {/* п.5: логотип + название студии — в одну строку, контакты — во вторую */}
      <div className="kb-brand-row">
        <div className="kb-brand-logo-col">
          <label className="kb-brand-logo-sq" title="Загрузить логотип">
            {d.logo ? <img src={d.logo} alt="logo" className="kb-brand-logo-img" /> : (<><UploadCloud size={16} strokeWidth={1.5} /><span className="kb-brand-logo-lbl">Логотип</span></>)}
            <input type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
          {d.logo && <button type="button" className="kb-brand-clear" onClick={() => setD((x) => ({ ...x, logo: "" }))}>Убрать</button>}
        </div>
        <div className="kb-brand-info">
          <input className="kb-input kb-brand-input" value={d.studioName}
            onChange={(e) => setD((x) => ({ ...x, studioName: e.target.value }))} placeholder="Название студии" />
        </div>
      </div>
      <input className="kb-input kb-brand-input" value={d.contacts}
        onChange={(e) => setD((x) => ({ ...x, contacts: e.target.value }))} placeholder="Контакты: телефон, email, имя, должность" />
      <div className="kb-brand-actions">
        <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="kb-btn kb-btn-ghost kb-brand-save" onClick={() => onSave(d)}>Сохранить</button>
      </div>
    </div>
  );
}

/* Панель экспорта в стиле Фигмы: [формат ▾] [⋯] в строке, кнопка Экспорт ниже. */
export function ExportPanel({ project, view, dispatch }) {
  const [format, setFormat] = useState("pdf");
  const [fmtOpen, setFmtOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fmtRef = useRef(null);
  const dotsRef = useRef(null);
  const [popStyle, setPopStyle] = useState(null);
  useOutsideClose(fmtRef, () => setFmtOpen(false));

  const branding = project.branding || {};
  const saveBranding = (b) => dispatch((p) => ({ ...p, branding: b }));
  const label = format === "pdf" ? "PDF" : "Excel";

  const toggleBrand = () => {
    if (!brandOpen) {
      const r = dotsRef.current?.getBoundingClientRect();
      if (r) setPopStyle({ position: "fixed", top: Math.max(12, r.bottom - 200), right: Math.round(window.innerWidth - r.left + 10), left: "auto" });
    }
    setBrandOpen((v) => !v);
  };

  const run = async () => {
    setBusy(true);
    try {
      const name = defaultFilename(project, view, format);
      if (format === "pdf") await exportPdf(project, view, name);
      else await exportExcelJS(project, view, name);
    } finally { setBusy(false); }
  };

  return (
    <div className="kb-export">
      <div className="kb-export-top">
        <div className="kb-fmt" ref={fmtRef}>
          <button type="button" className="kb-fmt-btn" onClick={() => setFmtOpen((v) => !v)}>
            <span>{label}</span><ChevronDown size={13} strokeWidth={1.5} />
          </button>
          {fmtOpen && (
            <div className="kb-fmt-menu">
              {[["pdf", "PDF"], ["excel", "Excel"]].map(([k, l]) => (
                <button key={k} type="button" className={"kb-fmt-item" + (format === k ? " is-active" : "")}
                  onClick={() => { setFormat(k); setFmtOpen(false); }}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <div className="kb-export-dots-wrap">
          <button type="button" className="kb-export-dots" title="Брендинг студии" ref={dotsRef} onClick={toggleBrand}>
            <MoreHorizontal size={16} strokeWidth={1.5} />
          </button>
          {brandOpen && <BrandingSettings branding={branding} style={popStyle}
            onSave={(b) => { saveBranding(b); setBrandOpen(false); }} onClose={() => setBrandOpen(false)} />}
        </div>
      </div>
      <button type="button" className="kb-export-go2" onClick={run} disabled={busy}>
        {busy ? <><Loader2 className="kb-spin" size={13} strokeWidth={1.5} /> Экспорт…</> : "Экспорт"}
      </button>
      <div className="kb-export-hint">Текущий вид — {view === "external" ? "внешняя смета" : "внутренняя смета"}</div>
    </div>
  );
}
