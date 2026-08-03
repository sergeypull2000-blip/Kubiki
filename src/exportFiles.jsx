/* eslint-disable react/only-export-components */
import { useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";
import { ChevronDown, Loader2, MoreHorizontal, UploadCloud, X } from "lucide-react";
import { fmt } from "./utils.js";
import { buildExportEstimateModel, normalizeExportSettings } from "./exportEstimate.js";
import { useOutsideClose } from "./hooks.js";

pdfMake.addVirtualFileSystem(pdfFonts);

const money = (amount) => `${fmt(amount)} ₽`;
const safeFile = (value) => (String(value || "smeta").replace(/[^\wа-яА-ЯёЁ\- ]+/g, "").trim().replace(/\s+/g, "_") || "smeta");
const defaultFilename = (project, format) => `${safeFile(project.name)}_СМЕТА.${format === "pdf" ? "pdf" : "xlsx"}`;

function brandColors() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return { text: read("--text", "#1A2230"), muted: read("--text-muted", "#64748B"), line: read("--line", "#E3E9F0"), sunken: read("--surface-sunken", "#F7FAFC") };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function addExcelLogo(workbook, sheet, dataUrl) {
  const match = /^data:image\/(png|jpe?g|gif);base64,/i.exec(dataUrl || "");
  if (!match) return false;
  const extension = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const imageId = workbook.addImage({ base64: dataUrl, extension });
  sheet.addImage(imageId, { tl: { col: 1, row: 0 }, ext: { width: 96, height: 42 } });
  sheet.getRow(1).height = 34;
  return true;
}

function BrandingSettings({ branding, onSave, onClose }) {
  const [draft, setDraft] = useState({ logo: "", studioName: "", contacts: "", ...branding });
  const onLogo = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((current) => ({ ...current, logo: reader.result }));
    reader.readAsDataURL(file);
  };
  return <div className="kb-export-branding" aria-label="Брендинг студии">
    <div className="kb-brand-title">Брендинг студии</div>
    <div className="kb-brand-row">
      <div className="kb-brand-logo-col">
        <label className="kb-brand-logo-sq" title="Загрузить логотип">
          {draft.logo ? <img src={draft.logo} alt="Логотип студии" className="kb-brand-logo-img" /> : <><UploadCloud size={16} /><span className="kb-brand-logo-lbl">Логотип</span></>}
          <input type="file" accept="image/*" hidden onChange={(event) => onLogo(event.target.files?.[0])} />
        </label>
        {draft.logo && <button type="button" className="kb-brand-clear" onClick={() => setDraft((current) => ({ ...current, logo: "" }))}>Убрать</button>}
      </div>
      <input className="kb-input kb-brand-input" value={draft.studioName} onChange={(event) => setDraft((current) => ({ ...current, studioName: event.target.value }))} placeholder="Название студии" />
    </div>
    <input className="kb-input kb-brand-input" value={draft.contacts} onChange={(event) => setDraft((current) => ({ ...current, contacts: event.target.value }))} placeholder="Контакты: телефон, email, имя, должность" />
    <div className="kb-brand-actions">
      <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button>
      <button type="button" className="kb-btn kb-btn-ghost kb-brand-save" onClick={() => onSave(draft)}>Сохранить</button>
    </div>
  </div>;
}

export function buildExcelRows(model) {
  const rows = [];
  for (const stage of model.stages) {
    rows.push({ type: "stage", label: stage.name, amount: stage.exportedSubtotal });
    for (const task of stage.rows) rows.push({ type: "task", label: task.name, amount: task.exportedAmount, sourceTaskId: task.sourceTaskId });
  }
  for (const row of model.separateRows) rows.push({ type: row.type, label: row.label, amount: row.amount });
  return { rows, total: model.summary.total };
}

export function buildPdfContent(model) {
  return { rows: buildExcelRows(model).rows, total: model.summary.total, warnings: model.warnings };
}

async function exportExcel(model, filename) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Смета", { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 60 }, { width: 20 }];
  const brand = model.brand || {};
  if (brand.logo) addExcelLogo(workbook, sheet, brand.logo);
  if (brand.studioName) { sheet.addRow([brand.studioName, ""]); sheet.mergeCells(`A1:B1`); }
  if (brand.contacts) { sheet.addRow([brand.contacts, ""]); sheet.mergeCells(`A${sheet.rowCount}:B${sheet.rowCount}`); }
  sheet.addRow([model.projectName, ""]); sheet.mergeCells(`A${sheet.rowCount}:B${sheet.rowCount}`);
  sheet.getCell(`A${sheet.rowCount}`).font = { bold: true, size: 15, name: "Inter" };
  sheet.addRow([new Date().toLocaleDateString("ru-RU"), ""]); sheet.addRow([]);
  const rows = buildExcelRows(model).rows;
  for (const row of rows) {
    const excelRow = sheet.addRow([row.type === "task" ? `  ${row.label}` : row.label, row.amount]);
    excelRow.getCell(2).numFmt = '#,##0.00" ₽"';
    if (row.type === "stage") excelRow.font = { bold: true, name: "Inter" };
    if (row.type === "markup" || row.type === "tax") excelRow.font = { italic: true, name: "Inter" };
  }
  sheet.addRow([]);
  const totalRow = sheet.addRow(["ИТОГО", model.summary.total]);
  totalRow.font = { bold: true, size: 13, name: "Inter" }; totalRow.getCell(2).numFmt = '#,##0.00" ₽"';
  sheet.eachRow((row) => row.eachCell((cell) => { cell.font = { name: "Inter", ...(cell.font || {}) }; }));
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  return model.summary.total;
}

function pdfDefinition(model) {
  const colors = brandColors();
  const body = buildPdfContent(model).rows.map((row) => [
    { text: row.type === "task" ? `  ${row.label}` : row.label, bold: row.type === "stage", italics: row.type === "markup" || row.type === "tax", color: row.type === "task" || row.type === "stage" ? colors.text : colors.muted, margin: [2, 4, 2, 4] },
    { text: money(row.amount), bold: row.type === "stage", italics: row.type === "markup" || row.type === "tax", alignment: "right", margin: [2, 4, 2, 4] },
  ]);
  return {
    pageSize: "A4", pageMargins: [40, 40, 40, 40], defaultStyle: { font: "Roboto", fontSize: 10, color: colors.text },
    content: [
      ...(model.brand?.logo ? [{ image: model.brand.logo, fit: [110, 52], alignment: "right", margin: [0, 0, 0, 8] }] : []),
      ...(model.brand?.studioName ? [{ text: model.brand.studioName, bold: true, fontSize: 12, margin: [0, 0, 0, 3] }] : []),
      ...(model.brand?.contacts ? [{ text: model.brand.contacts, color: colors.muted, fontSize: 9, margin: [0, 0, 0, 10] }] : []),
      { text: model.projectName, bold: true, fontSize: 16, margin: [0, 0, 0, 14] },
      { table: { widths: ["*", "auto"], body }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => colors.line } },
      { columns: [{ text: "Итого", bold: true, fontSize: 13 }, { text: money(model.summary.total), bold: true, fontSize: 13, alignment: "right" }], margin: [0, 14, 0, 0] },
    ],
  };
}

function exportPdf(model, filename) {
  pdfMake.createPdf(pdfDefinition(model)).download(filename);
  return model.summary.total;
}

function RadioBlock({ title, value, onChange }) {
  return (
    <fieldset className="kb-export-settings-block">
      <legend>{title}</legend>
      <label><input type="radio" checked={value === "distributed"} onChange={() => onChange("distributed")} />Включить в стоимость задач</label>
      <label><input type="radio" checked={value === "separate_line"} onChange={() => onChange("separate_line")} />Показать отдельной строкой</label>
    </fieldset>
  );
}

function ExportPreview({ model }) {
  return (
    <div className="kb-export-preview">
      {model.warnings.map((warning) => <div className="kb-export-warning" key={warning}>{warning}</div>)}
      {model.stages.map((stage) => <div className="kb-export-preview-stage" key={stage.id}>
        <div><b>{stage.name}</b><b>{money(stage.exportedSubtotal)}</b></div>
        {stage.rows.map((row) => <div key={row.sourceTaskId}><span>{row.name}</span><span>{money(row.exportedAmount)}</span></div>)}
      </div>)}
      {model.separateRows.map((row, index) => <div className="kb-export-preview-separate" key={`${row.type}-${index}`}><span>{row.label}</span><span>{money(row.amount)}</span></div>)}
      <div className="kb-export-preview-total"><b>Итого</b><b>{money(model.summary.total)}</b></div>
    </div>
  );
}

function ExportModal({ project, format, dispatch, onClose, onExport }) {
  const [draft, setDraft] = useState(() => normalizeExportSettings(project.exportSettings));
  const model = useMemo(() => buildExportEstimateModel(project, draft), [project, draft]);
  const [busy, setBusy] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const save = (next) => { setDraft(next); dispatch((current) => ({ ...current, exportSettings: normalizeExportSettings(next) })); };
  const run = async () => {
    setBusy(true);
    try { await onExport(model); } finally { setBusy(false); }
  };
  return <div className="kb-modal-backdrop" onMouseDown={onClose}>
    <div className="kb-export-modal" role="dialog" aria-modal="true" aria-label="Настройки экспорта" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-export-modal-head"><div><b>Экспорт сметы</b><span>{format === "pdf" ? "PDF" : "Excel"}</span></div><div className="kb-export-modal-head-actions"><button type="button" title="Брендинг сметы" aria-label="Настроить брендинг сметы" aria-expanded={brandingOpen} onClick={() => setBrandingOpen((value) => !value)}><MoreHorizontal size={18} /></button><button type="button" aria-label="Закрыть" onClick={onClose}><X size={16} /></button></div></div>
      {brandingOpen && <BrandingSettings branding={project.branding} onClose={() => setBrandingOpen(false)} onSave={(branding) => { dispatch((current) => ({ ...current, branding })); setBrandingOpen(false); }} />}
      <div className="kb-export-settings-grid">
        <RadioBlock title="Маркап" value={draft.markupPresentation} onChange={(value) => save({ ...draft, markupPresentation: value })} />
        <RadioBlock title="Налог" value={draft.taxPresentation} onChange={(value) => save({ ...draft, taxPresentation: value })} />
      </div>
      <ExportPreview model={model} />
      {!model.validation.valid && <div className="kb-export-error">Итог экспортной модели не совпадает с итогом проекта.</div>}
      <div className="kb-export-modal-actions"><button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button><button type="button" className="kb-export-go2" disabled={busy || !model.validation.valid} onClick={run}>{busy ? <><Loader2 className="kb-spin" size={13} /> Экспорт…</> : "Экспорт"}</button></div>
    </div>
  </div>;
}

export function ExportPanel({ project, dispatch }) {
  const [format, setFormat] = useState("pdf");
  const [formatOpen, setFormatOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const formatRef = useRef(null);
  useOutsideClose(formatRef, () => setFormatOpen(false));
  const run = (model) => format === "pdf" ? exportPdf(model, defaultFilename(project, format)) : exportExcel(model, defaultFilename(project, format));
  return <div className="kb-export">
    <div className="kb-fmt" ref={formatRef}>
      <button type="button" className="kb-fmt-btn" onClick={() => setFormatOpen((value) => !value)}><span>{format === "pdf" ? "PDF" : "Excel"}</span><ChevronDown size={13} /></button>
      {formatOpen && <div className="kb-fmt-menu">{[["pdf", "PDF"], ["excel", "Excel"]].map(([value, label]) => <button key={value} type="button" className={"kb-fmt-item" + (format === value ? " is-active" : "")} onClick={() => { setFormat(value); setFormatOpen(false); }}>{label}</button>)}</div>}
    </div>
    <button type="button" className="kb-export-go2" onClick={() => setModalOpen(true)}>Настроить и экспортировать</button>
    <div className="kb-export-hint">Экспорт строится из текущей рабочей сметы</div>
    {modalOpen && <ExportModal project={project} format={format} dispatch={dispatch} onClose={() => setModalOpen(false)} onExport={run} />}
  </div>;
}
