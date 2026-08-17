/* eslint-disable react/only-export-components */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, UploadCloud, X } from "lucide-react";
import { fmt } from "./utils.js";
import { buildExportEstimateModel, normalizeExportSettings } from "./exportEstimate.js";
import { useOutsideClose } from "./hooks.js";
import { clamp, hexToRgb, hsvToHex, normalizeHex, rgbToHsv } from "./color.js";
import { buildExcelRows, buildExcelWorkbook } from "./excelExport.js";
import { exportPresetsRepository } from "./repositories/exportPresetsRepository.js";
import { normalizePresentationSettings } from "./exportSettings.js";
import { exportProfileRepository } from "./repositories/exportProfileRepository.js";

export { buildExcelRows, buildExcelWorkbook } from "./excelExport.js";

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

async function imageDataUrl(url) {
  if (!url || url.startsWith("data:")) return url || "";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не удалось загрузить логотип для экспорта");
  const blob = await response.blob();
  if (blob.type === "image/webp") {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close();
    return canvas.toDataURL("image/png");
  }
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
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

export function buildPdfContent(model) {
  return { rows: buildExcelRows(model).rows, total: model.summary.total, warnings: model.warnings };
}

async function exportExcel(model, filename) {
  const logoUrl = await imageDataUrl(model.brand.logoUrl);
  const workbook = buildExcelWorkbook({ ...model, brand: { ...model.brand, logoUrl } }, addExcelLogo);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  return model.summary.total;
}

function pdfDefinition(model) {
  const colors = { ...brandColors(), ...model.brand.colors };
  const rowTextColor = (row) => row.type === "stage" ? model.brand.colors.stageText : row.type === "task" ? model.brand.colors.taskText : colors.muted;
  const body = buildPdfContent(model).rows.map((row) => [
    { text: row.type === "performer" ? `    ${row.number}  ${row.label}` : row.type === "task" ? `${row.number}  ${row.label}` : row.label, bold: row.type === "stage", fillColor: row.color, italics: row.type === "markup" || row.type === "tax", color: rowTextColor(row), fontSize: row.type === "stage" ? model.typography.stage.size : model.typography.task.size, margin: [2, 4, 2, 4] },
    { text: money(row.amount), bold: row.type === "stage", fillColor: row.color, italics: row.type === "markup" || row.type === "tax", color: rowTextColor(row), alignment: "right", margin: [2, 4, 2, 4] },
    ...(model.display.showComments ? [{ text: row.comment || "", fillColor: row.color, fontSize: model.typography.service.size, margin: [2, 4, 2, 4] }] : []),
  ]);
  return {
    pageSize: "A4", pageMargins: [40, 40, 40, 40], defaultStyle: { font: "Roboto", fontSize: 10, color: colors.text },
    content: [
      ...(model.brand?.logoUrl ? [{ image: model.brand.logoUrl, fit: [110, 52], alignment: "right", margin: [0, 0, 0, 8] }] : []),
      ...(model.brand?.companyName ? [{ text: model.brand.companyName, bold: true, fontSize: 12, margin: [0, 0, 0, 3] }] : []),
      ...([model.brand?.phone, model.brand?.email, model.brand?.website].some(Boolean) ? [{ text: [model.brand.phone, model.brand.email, model.brand.website].filter(Boolean).join(" · "), color: colors.muted, fontSize: 9, margin: [0, 0, 0, 10] }] : []),
      { text: model.proposal.title, bold: true, fontSize: model.typography.title.size, margin: [0, 0, 0, 14] },
      { table: { widths: model.display.showComments ? ["*", "auto", "30%"] : ["*", "auto"], body }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => colors.line } },
      { table: { widths: ["*", "auto"], body: [[{ text: "Итого", bold: true, fontSize: model.typography.total.size, fillColor: model.brand.colors.total, color: model.brand.colors.totalText, margin: [6, 6, 6, 6] }, { text: money(model.summary.total), bold: true, fontSize: model.typography.total.size, alignment: "right", fillColor: model.brand.colors.total, color: model.brand.colors.totalText, margin: [6, 6, 6, 6] }]] }, layout: "noBorders", margin: [0, 14, 0, 0] },
      ...model.serviceBlocks.map((text) => ({ text, fontSize: model.typography.service.size, color: colors.muted, margin: [0, 8, 0, 0] })),
    ],
  };
}

async function exportPdf(model, filename) {
  const logoUrl = await imageDataUrl(model.brand.logoUrl);
  pdfMake.createPdf(pdfDefinition({ ...model, brand: { ...model.brand, logoUrl } })).download(filename);
  return model.summary.total;
}

function RadioBlock({ title, value, onChange }) {
  return (
    <fieldset className="kb-export-settings-block">
      <legend>{title}</legend>
      <label><input type="radio" name={`export-${title}`} checked={value === "distributed"} onChange={() => onChange("distributed")} />Включить в стоимость задач</label>
      <label><input type="radio" name={`export-${title}`} checked={value === "separate_line"} onChange={() => onChange("separate_line")} />Показать отдельной строкой</label>
    </fieldset>
  );
}

const SWATCHES = [
  // Нейтральный ряд: белый → светлый серый → серый → тёмный серый → чёрный
  "#ffffff", "#d9d9d9", "#a6a6a6", "#737373", "#404040", "#000000",
  // Красный и оранжевый: светлый / базовый / тёмный
  "#ff9999", "#ff0000", "#990000", "#ffcc99", "#ff9900", "#995c00",
  // Жёлтый и зелёный: светлый / базовый / тёмный
  "#ffff99", "#ffff00", "#cccc00", "#99ff99", "#00ff00", "#009900",
  // Бирюзовый и голубой: светлый / базовый / тёмный
  "#66cccc", "#008080", "#004d4d", "#ccffff", "#00ffff", "#009999",
  // Синий и фиолетовый: светлый / базовый / тёмный
  "#9999ff", "#0000ff", "#000099", "#cc99ff", "#800080", "#4d004d",
  // Пурпурный и коричневый: светлый / базовый / тёмный
  "#ff99ff", "#ff00ff", "#990099", "#d2a679", "#996633", "#4d331a",
];

/* Авто-flip попапа цвета: измеряем anchor и ближайший scroll-контейнер
   (settings pane). Если снизу не хватает места, а сверху больше — открываем
   вверх; иначе — вниз. Горизонталь left/right не затрагиваем. */
function colorPopPlacement(anchor, pop) {
  const anchorRect = anchor.getBoundingClientRect();
  let node = anchor.parentElement;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden" || overflowY === "overlay") break;
    node = node.parentElement;
  }
  const bounds = node && node !== document.body ? node.getBoundingClientRect() : null;
  const spaceBelow = bounds ? bounds.bottom - anchorRect.bottom : window.innerHeight - anchorRect.bottom;
  const spaceAbove = bounds ? anchorRect.top - bounds.top : anchorRect.top;
  return pop.offsetHeight <= spaceBelow || spaceAbove <= spaceBelow ? "bottom" : "top";
}

function ColorRow({ value, onChange, ariaLabel, align = "left" }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState("bottom");
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  useEffect(() => setText(value), [value]);
  useOutsideClose(wrapRef, () => setOpen(false));
  useLayoutEffect(() => {
    if (!open) return;
    if (wrapRef.current && popRef.current) setPlacement(colorPopPlacement(wrapRef.current, popRef.current));
  }, [open]);
  const commit = (next) => {
    setText(next);
    const normalized = normalizeHex(next);
    if (normalized) onChange(normalized);
  };
  return (
    <>
      <span className="kb-export-color-swatch" ref={wrapRef}>
        <button type="button" className="kb-export-color-swatch-btn" style={{ background: value }} aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((current) => !current)} />
        {open && (
          <span ref={popRef} className={"kb-color-pop is-" + placement + (align === "right" ? " is-right" : "")}>
            <ColorPicker value={value} hexText={text} onChange={onChange} onHexText={commit} />
          </span>
        )}
      </span>
      <input className="kb-input kb-export-color-hex" value={text} onChange={(event) => commit(event.target.value)} spellCheck={false} aria-label={`${ariaLabel} (HEX)`} />
    </>
  );
}

function ColorPicker({ value, hexText, onChange, onHexText }) {
  const svRef = useRef(null);
  const hueRef = useRef(null);
  const hsv = rgbToHsv(hexToRgb(value));

  const pick = (event, kind) => {
    const el = kind === "sv" ? svRef.current : hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    if (kind === "sv") {
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      onChange(hsvToHex({ h: hsv.h, s: x, v: 1 - y }));
    } else {
      onChange(hsvToHex({ h: Math.round(x * 360) % 360, s: hsv.s, v: hsv.v }));
    }
  };

  const drag = (kind) => (event) => {
    event.preventDefault();
    pick(event, kind);
    const move = (moveEvent) => pick(moveEvent, kind);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  return (
    <>
      <div className="kb-color-sv" ref={svRef} title="Насыщенность и яркость" style={{ background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))` }} onPointerDown={drag("sv")}>
        <span className="kb-color-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div className="kb-color-hue" ref={hueRef} title="Оттенок" onPointerDown={drag("hue")}>
        <span className="kb-color-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <label className="kb-color-hex-field">
        <span>HEX</span>
        <input className="kb-input" value={hexText} onChange={(event) => onHexText(event.target.value)} spellCheck={false} aria-label="HEX" />
      </label>
      <span className="kb-color-quick">
        {SWATCHES.map((color) => (
          <button key={color} type="button" className={"kb-color-cell" + (color.toLowerCase() === value.toLowerCase() ? " is-active" : "")} style={{ background: color }} aria-label={color} title={color} onClick={() => onChange(color)} />
        ))}
      </span>
    </>
  );
}

const SIZE_MIN = 6;
const SIZE_MAX = 36;

function SizeStepper({ value, onChange, ariaLabel }) {
  return (
    <div className="kb-stepper">
      <input
        className="kb-stepper-value"
        type="number"
        min={SIZE_MIN}
        max={SIZE_MAX}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="kb-stepper-divider" aria-hidden="true" />
      <div className="kb-stepper-arrows">
        <button type="button" className="kb-stepper-btn" aria-label={`${ariaLabel}: увеличить`} onClick={() => onChange(Math.min(SIZE_MAX, value + 1))}><ChevronUp size={11} /></button>
        <button type="button" className="kb-stepper-btn" aria-label={`${ariaLabel}: уменьшить`} onClick={() => onChange(Math.max(SIZE_MIN, value - 1))}><ChevronDown size={11} /></button>
      </div>
    </div>
  );
}

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const pad2 = (n) => String(n).padStart(2, "0");
const parseIsoDate = (value) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ""); return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null; };
const isoOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const formatRuDate = (value) => { const p = parseIsoDate(value); return p ? `${pad2(p.d)}.${pad2(p.m + 1)}.${p.y}` : ""; };

/* ============================================================
   «Кубиковый» выбор даты: кнопка-поле с датой в формате
   ДД.ММ.ГГГГ + выпадающий календарь (русские месяцы, неделя
   с понедельника). Заменяет нативный <input type="date">, чей
   формат и вид календаря зависят от локали браузера.
   ============================================================ */
function DateCubePicker({ value, disabled, onChange }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value);
  const [view, setView] = useState(() => { const now = new Date(); return selected ? { y: selected.y, m: selected.m } : { y: now.getFullYear(), m: now.getMonth() }; });
  useOutsideClose(wrapRef, () => setOpen(false));
  const toggle = () => {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    const base = selected || (() => { const now = new Date(); return { y: now.getFullYear(), m: now.getMonth() }; })();
    setView({ y: base.y, m: base.m });
    setOpen(true);
  };
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const now = new Date();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <span className="kb-datecube" ref={wrapRef}>
      <button type="button" className={"kb-datecube-trigger" + (open ? " is-open" : "")} disabled={disabled} onClick={toggle}>
        {value ? formatRuDate(value) : <span className="kb-datecube-ph">дд.мм.гггг</span>}
        <CalendarDays size={13} />
      </button>
      {open && (
        <div className="kb-datecube-pop">
          <div className="kb-datecube-head">
            <button type="button" className="kb-datecube-nav" aria-label="Предыдущий месяц" onClick={() => setView((v) => { const n = new Date(v.y, v.m - 1, 1); return { y: n.getFullYear(), m: n.getMonth() }; })}><ChevronLeft size={14} /></button>
            <span className="kb-datecube-title">{MONTHS[view.m]} {view.y}</span>
            <button type="button" className="kb-datecube-nav" aria-label="Следующий месяц" onClick={() => setView((v) => { const n = new Date(v.y, v.m + 1, 1); return { y: n.getFullYear(), m: n.getMonth() }; })}><ChevronRight size={14} /></button>
          </div>
          <div className="kb-datecube-grid">
            {WEEKDAYS.map((w) => <span key={w} className="kb-datecube-dow">{w}</span>)}
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} className="kb-datecube-day is-empty" />;
              const isSelected = selected && selected.y === view.y && selected.m === view.m && selected.d === d;
              const isToday = now.getFullYear() === view.y && now.getMonth() === view.m && now.getDate() === d;
              return (
                <button key={d} type="button" className={"kb-datecube-day" + (isSelected ? " is-selected" : "") + (isToday ? " is-today" : "")} onClick={() => { onChange(isoOf(view.y, view.m, d)); setOpen(false); }}>{d}</button>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

function PresentationControls({ draft, onChange, project, dispatch, userId, logoUrl, onLogoUrl }) {
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const patch = (section, value) => onChange({ ...draft, [section]: { ...draft[section], ...value } });
  const uploadLogo = async (file) => { if (!file || !userId) return; setLogoBusy(true); setLogoError(""); try { const previousPath = draft.branding.logoAssetPath; const path = await exportProfileRepository.uploadLogo(userId, file); await exportProfileRepository.upsertProfile(userId, { ...draft.branding, logoAssetPath: path }); const url = await exportProfileRepository.createLogoUrl(path, 3600); patch("branding", { logoAssetPath: path }); onLogoUrl(url); if (previousPath && previousPath !== path) await exportProfileRepository.removeLogo(previousPath); } catch (error) { setLogoError(error.message); } finally { setLogoBusy(false); } };
  const removeLogo = async () => { if (!userId) return; setLogoBusy(true); setLogoError(""); try { await exportProfileRepository.removeLogo(draft.branding.logoAssetPath); await exportProfileRepository.upsertProfile(userId, { ...draft.branding, logoAssetPath: "" }); patch("branding", { logoAssetPath: "" }); onLogoUrl(""); } catch (error) { setLogoError(error.message); } finally { setLogoBusy(false); } };
  const persistProfile = () => { if (userId) exportProfileRepository.upsertProfile(userId, draft.branding).catch((error) => setLogoError(error.message)); };
  const typeSize = (key, label) => (
    <label className="kb-export-field">
      <span>{label}</span>
      <SizeStepper value={draft.typography[key].size} onChange={(size) => patch("typography", { [key]: { ...draft.typography[key], size } })} ariaLabel={label} />
    </label>
  );
  return <div className="kb-export-presentation-controls">
    <details className="kb-export-section" open>
      <summary>Брендинг</summary>
      <div className="kb-export-section-body">
        <div className="kb-export-logo-row">
          <label className="kb-export-logo" title="Загрузить логотип">
            {logoUrl ? <img src={logoUrl} alt="Логотип компании" className="kb-brand-logo-img" /> : <><UploadCloud size={18} /><span>Логотип</span></>}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!userId || logoBusy} onChange={(event) => uploadLogo(event.target.files?.[0])} />
          </label>
          {logoUrl && <button type="button" className="kb-btn kb-btn-ghost" disabled={logoBusy} onClick={removeLogo}>Удалить</button>}
        </div>
        {logoError && <small className="kb-export-control-error">{logoError}</small>}
        <label className="kb-export-field-stacked">
          <span>Компания</span>
          <input className="kb-input" value={draft.branding.companyName} onChange={(event) => patch("branding", { companyName: event.target.value })} onBlur={persistProfile} />
        </label>
        <div className="kb-export-colors">
          <span aria-hidden="true" />
          <span className="kb-export-color-head kb-export-color-head-bg">Фон</span>
          <span className="kb-export-color-head kb-export-color-head-text">Текст</span>
          {[["stage", "Этап"], ["task", "Задача"], ["total", "Итого"]].map(([key, label]) => (
            <Fragment key={key}>
              <span className="kb-export-color-entity">{label}</span>
              <ColorRow value={draft.branding.colors[key]} onChange={(value) => patch("branding", { colors: { ...draft.branding.colors, [key]: value } })} ariaLabel={`${label} — фон`} />
              <ColorRow align="right" value={draft.branding.colors[`${key}Text`]} onChange={(value) => patch("branding", { colors: { ...draft.branding.colors, [`${key}Text`]: value } })} ariaLabel={`${label} — текст`} />
            </Fragment>
          ))}
        </div>
      </div>
    </details>
    <details className="kb-export-section">
      <summary>Типографика</summary>
      <div className="kb-export-section-body kb-export-typography">
        <label className="kb-export-field">
          <span>Шрифт документа</span>
          <select className="kb-select" value={draft.branding.fontFamily} onChange={(event) => patch("branding", { fontFamily: event.target.value })}><option>Roboto</option></select>
        </label>
        {typeSize("title", "Заголовок")}
        {typeSize("stage", "Этап")}
        {typeSize("task", "Задача")}
        {typeSize("total", "Итого")}
        {typeSize("service", "Служебный текст")}
      </div>
    </details>
    <details className="kb-export-section">
      <summary>Служебный текст</summary>
      <div className="kb-export-section-body kb-export-service">
        <label className="kb-export-check">
          <input type="checkbox" checked={draft.service.validUntil} onChange={(event) => patch("service", { validUntil: event.target.checked })} />
          <span>КП действительно до</span>
          <DateCubePicker disabled={!draft.service.validUntil} value={project.exportMetadata?.validUntil || ""} onChange={(iso) => dispatch((current) => ({ ...current, exportMetadata: { ...(current.exportMetadata || {}), validUntil: iso } }))} />
        </label>
        <label className="kb-export-check">
          <input type="checkbox" checked={draft.service.copyrightIncluded} onChange={(event) => patch("service", { copyrightIncluded: event.target.checked })} />
          <span>Авторские права включены</span>
        </label>
        <label className="kb-export-check">
          <input type="checkbox" checked={draft.service.confidential} onChange={(event) => patch("service", { confidential: event.target.checked })} />
          <span>Конфиденциально</span>
        </label>
        <label className="kb-export-textarea-field">
          <textarea className="kb-input kb-export-textarea" value={draft.service.customText} onChange={(event) => patch("service", { customEnabled: true, customText: event.target.value })} placeholder="Свободный текст" />
        </label>
      </div>
    </details>
  </div>;
}

function ExportPreview({ model }) {
  return (
    <div className="kb-export-preview">
      {model.warnings.map((warning) => <div className="kb-export-warning" key={warning}>{warning}</div>)}
      <div style={{ fontFamily: model.brand.fontFamily, color: model.brand.colors.text }}>
      <div className="kb-export-preview-brand">{model.brand.logoUrl && <img src={model.brand.logoUrl} alt="Логотип компании" />}{model.brand.companyName && <strong>{model.brand.companyName}</strong>}</div>
      <h2 style={{ fontSize: model.typography.title.size }}>{model.proposal.title}</h2>
      {model.stages.map((stage) => <div className="kb-export-preview-stage" key={stage.id}>
        <div className="kb-export-preview-row" style={{ background: stage.color, color: stage.textColor, fontSize: model.typography.stage.size }}><b>{stage.number}  {stage.name}</b><b>{money(stage.exportedSubtotal)}</b>{model.display.showComments && <span />}</div>
        {stage.rows.map((row) => <div className="kb-export-preview-task" key={row.sourceTaskId}>
          <div className="kb-export-preview-row" style={{ background: row.color, color: row.textColor, fontSize: model.typography.task.size }}><span>{row.number}  {row.name}</span><span>{money(row.exportedAmount)}</span>{model.display.showComments && <span className="kb-export-preview-comment">{row.comment}</span>}</div>
          {row.performers.map((performer) => <div className="kb-export-preview-row kb-export-preview-performer" key={performer.id} style={{ fontSize: model.typography.task.size }}><span>{performer.number}  {performer.label}</span><span>{money(performer.amount)}</span>{model.display.showComments && <span />}</div>)}
        </div>)}
      </div>)}
      {model.separateRows.map((row, index) => <div className="kb-export-preview-separate" key={`${row.type}-${index}`}><span>{row.label}</span><span>{money(row.amount)}</span></div>)}
      <div className="kb-export-preview-total" style={{ background: model.brand.colors.total, color: model.brand.colors.totalText, fontSize: model.typography.total.size }}><b>Итого</b><b>{money(model.summary.total)}</b></div>
      {model.serviceBlocks.map((text) => <small style={{ fontSize: model.typography.service.size }} key={text}>{text}</small>)}
      </div>
    </div>
  );
}

function ExportModal({ project, format, dispatch, userId, onClose, onExport }) {
  const [draft, setDraft] = useState(() => ({
    ...normalizeExportSettings(project.exportSettings),
    ...normalizePresentationSettings(project.exportSettings),
  }));
  const [logoUrl, setLogoUrl] = useState("");
  const model = useMemo(() => { const value = buildExportEstimateModel(project, draft); value.brand.logoUrl = logoUrl; return value; }, [project, draft, logoUrl]);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState([]);
  const [presetId, setPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState("");
  useEffect(() => { if (!userId) return; let active = true; exportPresetsRepository.list(userId).then((items) => { if (active) setPresets(items); }).catch((error) => { if (active) setPresetError(error.message); }); return () => { active = false; }; }, [userId]);
  useEffect(() => { if (!userId) return; let active = true; exportProfileRepository.loadProfile(userId).then(async ({ profile }) => { if (!active || !profile) return; const branding = { companyName: profile.company_name, logoAssetPath: profile.logo_asset_path || "", phone: profile.phone, email: profile.email, website: profile.website, colors: profile.default_colors, fontFamily: profile.default_font }; setDraft((current) => ({ ...current, branding: { ...current.branding, ...branding } })); if (profile.logo_asset_path) setLogoUrl(await exportProfileRepository.createLogoUrl(profile.logo_asset_path, 3600)); }).catch((error) => { if (active) setPresetError(error.message); }); return () => { active = false; }; }, [userId]);
  const save = (next) => { setDraft(next); dispatch((current) => ({ ...current, exportSettings: normalizeExportSettings(next) })); };
  const applyPreset = (settings) => save({ ...draft, ...settings, branding: { ...draft.branding, ...settings.branding }, typography: { ...draft.typography, ...settings.typography }, content: { ...draft.content, ...settings.content, visibleExecutorIds: draft.content.visibleExecutorIds, rowColorOverrides: draft.content.rowColorOverrides }, service: { ...draft.service, ...settings.service } });
  const savePreset = async () => { if (!userId || !presetName.trim()) return; try { const item = presetId ? await exportPresetsRepository.update(userId, presetId, presetName, draft) : await exportPresetsRepository.create(userId, presetName, draft); setPresets((items) => [item, ...items.filter((value) => value.id !== item.id)]); setPresetId(item.id); setPresetError(""); } catch (error) { setPresetError(error.message); } };
  const deletePreset = async () => { if (!userId || !presetId) return; try { await exportPresetsRepository.remove(userId, presetId); setPresets((items) => items.filter((item) => item.id !== presetId)); setPresetId(""); setPresetName(""); } catch (error) { setPresetError(error.message); } };
  const duplicatePreset = async () => { const selected = presets.find((item) => item.id === presetId); if (!userId || !selected) return; try { const copy = await exportPresetsRepository.duplicate(userId, selected); setPresets((items) => [copy, ...items]); setPresetId(copy.id); setPresetName(copy.name); } catch (error) { setPresetError(error.message); } };
  const run = async () => {
    setBusy(true);
    try { await onExport(model); } finally { setBusy(false); }
  };
  return <div className="kb-modal-backdrop" onMouseDown={onClose}>
    <div className="kb-export-modal" role="dialog" aria-modal="true" aria-label="Настройки экспорта" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-export-modal-head"><div><b>Экспорт сметы</b><span>{format === "pdf" ? "PDF" : "Excel"}</span></div><div className="kb-export-modal-head-actions"><button type="button" aria-label="Закрыть" onClick={onClose}><X size={16} /></button></div></div>
      <div className="kb-export-modal-body">
        <div className="kb-export-preview-pane">
          <ExportPreview model={model} />
          {!model.validation.valid && <div className="kb-export-error">Итог экспортной модели не совпадает с итогом проекта.</div>}
        </div>
        <div className="kb-export-settings-pane">
          {userId && <div className="kb-export-presets">
            <select className="kb-select" value={presetId} onChange={(event) => { const item = presets.find((value) => value.id === event.target.value); setPresetId(event.target.value); setPresetName(item?.name || ""); if (item) applyPreset(item.settings); }}>
              <option value="">Новый пресет</option>
              {presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <input className="kb-input" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Название пресета" />
            <div className="kb-export-preset-actions">
              <button type="button" className="kb-btn kb-btn-primary" disabled={!presetName.trim()} onClick={savePreset}>Сохранить</button>
              <button type="button" className="kb-btn kb-btn-ghost" disabled={!presetId} onClick={duplicatePreset}>Копия</button>
              <button type="button" className="kb-btn kb-btn-ghost" disabled={!presetId} onClick={deletePreset}>Удалить</button>
            </div>
            {presetError && <small className="kb-export-preset-error">{presetError}</small>}
          </div>}
          <div className="kb-export-settings-grid">
            <RadioBlock title="Маркап" value={draft.markupPresentation} onChange={(value) => save({ ...draft, markupPresentation: value })} />
            <RadioBlock title="Налог" value={draft.taxPresentation} onChange={(value) => save({ ...draft, taxPresentation: value })} />
          </div>
          <PresentationControls draft={draft} onChange={save} project={project} dispatch={dispatch} userId={userId} logoUrl={logoUrl} onLogoUrl={setLogoUrl} />
        </div>
      </div>
      <div className="kb-export-modal-actions"><button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button><button type="button" className="kb-export-go2" disabled={busy || !model.validation.valid} onClick={run}>{busy ? <><Loader2 className="kb-spin" size={13} /> Экспорт…</> : "Экспорт"}</button></div>
    </div>
  </div>;
}

export function ExportPanel({ project, dispatch, userId }) {
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
    {modalOpen && <ExportModal project={project} format={format} dispatch={dispatch} userId={userId} onClose={() => setModalOpen(false)} onExport={run} />}
  </div>;
}
