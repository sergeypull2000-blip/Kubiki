import { useState, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  X, Trash2, ChevronDown, AlertTriangle,
  UploadCloud, Loader2, FileSpreadsheet, Download, FolderOpen,
} from "lucide-react";
import { uid, fmt, numVal } from "./utils.js";
import { Logo } from "./Logo.jsx";
import { useOutsideClose } from "./hooks.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

/* ============================================================
   ЗАДАЧА 1 — импорт сметы из Excel/PDF через СЕМАНТИЧЕСКИЙ разбор LLM
   с обязательным превью перед вставкой.
   Поток: извлечение текста из файла (в коде) → сериализация в текст
   с геометрией → LLM отдаёт JSON-структуру → превью с правкой/выбором
   вида сметы/подтверждением → вставка в стор. Позиционный парсер НЕ
   используется (путает хронометраж/кол-во/цену) — только смысловой
   разбор моделью. Источник (Excel или PDF) влияет только на способ
   извлечения текста (шаг 1) — дальше единый пайплайн.

   LLM-вызов: POST /api/parse-excel → DeepSeek
   (ключ в переменной окружения DEEPSEEK_API_KEY на Vercel).
   ============================================================ */

const IMPORT_SYSTEM_PROMPT = `Ты разбираешь смету видеопродакшна из таблицы (источник — Excel или текстовый слой PDF). Верни ТОЛЬКО JSON по схеме, без пояснений и markdown.

Схема:
{"projectName": "строка или null", "stages": [{"name": "название этапа", "tasks": [{"name": "название задачи", "cost": 165000}]}], "warnings": ["строки, которые не удалось однозначно классифицировать"]}

Правила:
- Сначала найди строку заголовков. Определи, какая колонка = ИТОГОВАЯ СТОИМОСТЬ задачи (маркеры: «стоимость итого», «сумма», «итого», «цена»). Из неё бери cost. Если есть и «за единицу», и «итого» — бери «итого».
- НЕ используй как стоимость колонки количества, хронометража, смен, номера позиции, ставки за единицу.
- Этапы и задачи определяй по СМЫСЛУ, не по формату. Задача — строка с названием работы и итоговой стоимостью. Этап — группирующий заголовок (название раздела без собственной стоимости или над группой задач). Признаки вложенности разные и необязательные: нумерация (1., 1.1), КАПС, отступ, пустая цена у заголовка. Опирайся на совокупность.
- Если группировки нет и это плоский список задач с ценами — не выдумывай этапы: верни все задачи одним этапом «Смета». Никогда не создавай иерархию, которой нет.
- Игнорируй строки итогов и налогов («ИТОГО», «ИТОГО с НДС», общая сумма без названия задачи).
- cost — число без пробелов и валюты. Прочерк «-» = отсутствие значения.
- Не предполагай конкретный формат колонок/нумерации. Определяй роль строки и колонки по содержимому.
- Если текст пришёл из PDF, колонки восстановлены по координатам и могут быть не идеально выровнены (фрагменты одной ячейки иногда распадаются на несколько «|»-сегментов) — ориентируйся на смысл содержимого строки, а не на номер сегмента.`;

/* Сериализация листа в текст с сохранением геометрии (строки/колонки),
   пустые ячейки как «-». Модели нужна геометрия, чтобы понять роль колонок. */
function serializeSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: "" });
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const lines = [];
  rows.forEach((row, i) => {
    const cells = [];
    for (let c = 0; c < maxCols; c++) {
      const v = row[c];
      cells.push(`C${c + 1}: ${v === "" || v == null ? "-" : String(v).trim()}`);
    }
    lines.push(`R${i + 1} | ${cells.join(" | ")}`);
  });
  return lines.join("\n");
}

/* Извлечение текстового слоя PDF (в коде, не в LLM). Каждая страница —
   фрагменты текста с координатами (x, y); группируем по строкам (общий y,
   с допуском) и внутри строки упорядочиваем по x, чтобы получить текст,
   похожий на таблицу — как и лист Excel, но восстановленный из геометрии,
   а не из настоящих ячеек. Пустой текстовый слой (скан/картинка) → []. */
async function extractPdfRows(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const allRows = [];
  const Y_TOLERANCE = 2.5; // пункты PDF — фрагменты одной визуальной строки редко расходятся сильнее
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .map((it) => ({ str: String(it.str || "").trim(), x: it.transform[4], y: it.transform[5] }))
      .filter((it) => it.str);
    if (items.length === 0) continue;
    // PDF: y растёт снизу вверх → сортируем по убыванию y (сверху вниз), внутри строки — по x (слева направо)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    let cur = null;
    for (const it of items) {
      if (!cur || Math.abs(cur.y - it.y) > Y_TOLERANCE) { cur = { y: it.y, parts: [] }; rows.push(cur); }
      cur.parts.push(it);
    }
    for (const row of rows) {
      row.parts.sort((a, b) => a.x - b.x);
      allRows.push(row.parts.map((pt) => pt.str).join(" | "));
    }
  }
  return allRows;
}
const serializePdfRows = (rows) => rows.map((line, i) => `R${i + 1} | ${line}`).join("\n");

/* Разбор текста моделью → сырой JSON (ещё не валидированный). Источник
   (лист Excel или страницы PDF) на этот момент уже сведён к одному и тому же
   строково-табличному виду — дальше пайплайн общий. */
async function llmParseText(sheetText, filename) {
  const r = await fetch("/api/parse-excel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet: sheetText, filename }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Ошибка DeepSeek API (${r.status}). Попробуйте ещё раз.`);
  }
  const j = await r.json();
  if (!j || !Array.isArray(j.stages)) throw new Error("Модель вернула некорректный ответ.");
  return j;
}

/* Валидация ответа модели ДО превью. Кривой ответ — не роняем приложение. */
function validateParsed(json) {
  if (!json || typeof json !== "object") throw new Error("Модель вернула не-JSON.");
  const stagesIn = Array.isArray(json.stages) ? json.stages : null;
  if (!stagesIn) throw new Error("В ответе нет массива этапов.");
  const stages = stagesIn.map((s) => ({
    name: typeof s?.name === "string" && s.name.trim() ? s.name.trim() : "Смета",
    tasks: (Array.isArray(s?.tasks) ? s.tasks : [])
      .filter((t) => t && typeof t.name === "string" && t.name.trim() && Number.isFinite(Number(t.cost)))
      .map((t) => ({ name: t.name.trim(), cost: Number(t.cost) })),
  })).filter((s) => s.tasks.length > 0);
  if (stages.length === 0) throw new Error("Не удалось распознать ни одной задачи с ценой. Проверьте файл или импортируйте другой лист.");
  return {
    projectName: typeof json.projectName === "string" && json.projectName.trim() ? json.projectName.trim() : null,
    stages,
    warnings: Array.isArray(json.warnings) ? json.warnings.filter((w) => typeof w === "string") : [],
  };
}

/* ============================================================
   ЗАДАЧА 5 — обратный пересчёт «внешней» цены (с зашитым маркапом)
   в себестоимость. Kubiki всегда работает от себестоимости к цене,
   поэтому голую внешнюю цену класть в кубик нельзя — её нужно развернуть.
   Чистая функция, без побочных эффектов — тестируется напрямую:
   costFromExternalPrice(165000, 20) → { cost: 137500, ok: true }
   ============================================================ */
export function costFromExternalPrice(price, markupPct) {
  const p = numVal(price);
  if (!(p > 0)) return { cost: 0, ok: false, reason: "empty_price" };
  const divisor = 1 + numVal(markupPct) / 100;
  if (!(divisor > 0)) return { cost: 0, ok: false, reason: "bad_markup" };
  return { cost: p / divisor, ok: true };
}

/* Применяет выбор продюсера («внутренняя как есть» / «внешняя → развернуть
   в себестоимость по единому маркапу») к распознанным задачам. Возвращает
   стадии с уже подставленным cost (себестоимостью) и список предупреждений
   по позициям, которые не удалось пересчитать (не роняем импорт — 0 + warning). */
function computeInsertCosts(parsed, kind, markupPct) {
  if (kind !== "external") return { stages: parsed.stages, extraWarnings: [] };
  const extraWarnings = [];
  const stages = parsed.stages.map((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      const { cost, ok, reason } = costFromExternalPrice(t.cost, markupPct);
      if (!ok) {
        extraWarnings.push(`«${t.name}»: ${reason === "bad_markup" ? "некорректный маркап" : "нет цены"} — поставлено 0, поправьте вручную.`);
      }
      return { ...t, cost };
    }),
  }));
  return { stages, extraWarnings };
}

/* Подтверждённая структура → этапы модели Kubiki.
   В каждой задаче ОДИН исполнитель с кубиком «фикс за всё»,
   сумма кладётся в executor.amount (как хранится фикс в модели). */
function stagesFromParsed(parsed) {
  return parsed.stages.map((s) => ({
    id: uid(), presetKey: "custom", collapsed: false,
    name: s.name || "Смета",
    tasks: (s.tasks || []).map((t) => ({
      id: uid(), name: t.name || "", markupOverride: null,
      executors: [{
        id: uid(),
        amount: String(Math.round(numVal(t.cost))),
        tags: [{ id: uid(), key: "payment", payment: { type: "fix_total", rate: "", hours: "", shifts: "" } }],
      }],
    })),
  }));
}

/* Модалка импорта: извлечение текста (Excel-лист / PDF-страницы) → разбор →
   редактируемое превью (вид сметы + обратный пересчёт) → вставка. */
export function ImportModal({ file, onClose, onConfirm }) {
  const isPdf = /\.pdf$/i.test(file.name);
  const [step, setStep] = useState("reading"); // reading|sheet|parsing|preview|error
  const [wb, setWb] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  // ЗАДАЧА 5: вид импортируемой сметы. Дефолт — «внешняя» (продюсеры чаще
  // импортируют смету с уже зашитым маркапом, чем чистую себестоимость).
  const [importKind, setImportKind] = useState("external"); // "internal" | "external"
  const [markupPct, setMarkupPct] = useState("");

  // шаг 1: извлечение текста из файла (в коде, не в LLM) — способ зависит
  // от расширения, дальше единый пайплайн (LLM-разбор/превью/вставка)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isPdf) {
        try {
          const rows = await extractPdfRows(file);
          if (cancelled) return;
          if (rows.length === 0) {
            setErrorMsg("Не удалось прочитать текст из PDF — возможно, это скан. Попробуйте Excel или PDF с текстом.");
            setStep("error");
            return;
          }
          runParseText(serializePdfRows(rows), file.name);
        } catch (e) {
          if (!cancelled) { setErrorMsg("Не удалось прочитать PDF-файл."); setStep("error"); }
        }
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const book = /\.csv$/i.test(file.name)
          ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
          : XLSX.read(buf, { type: "array" });
        if (cancelled) return;
        setWb(book);
        setSheetNames(book.SheetNames);
        if (book.SheetNames.length > 1) setStep("sheet");
        else runParseText(serializeSheet(book.Sheets[book.SheetNames[0]]), `${file.name} / ${book.SheetNames[0]}`);
      } catch (e) {
        if (!cancelled) { setErrorMsg("Не удалось прочитать файл."); setStep("error"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [file]);

  const runParseSheet = (book, sheetName) =>
    runParseText(serializeSheet(book.Sheets[sheetName]), `${file.name} / ${sheetName}`);

  const runParseText = async (text, sourceLabel) => {
    setStep("parsing");
    try {
      const raw = await llmParseText(text, sourceLabel);
      const valid = validateParsed(raw);
      setParsed(valid);
      setWarnings(valid.warnings);
      setStep("preview");
    } catch (e) {
      setErrorMsg(e.message || "Не удалось разобрать смету.");
      setStep("error");
    }
  };

  const retry = () => {
    if (isPdf) { setErrorMsg(""); setStep("reading"); extractPdfRows(file).then((rows) => {
      if (rows.length === 0) { setErrorMsg("Не удалось прочитать текст из PDF — возможно, это скан. Попробуйте Excel или PDF с текстом."); setStep("error"); return; }
      runParseText(serializePdfRows(rows), file.name);
    }).catch(() => { setErrorMsg("Не удалось прочитать PDF-файл."); setStep("error"); }); return; }
    if (wb) { sheetNames.length > 1 ? setStep("sheet") : runParseSheet(wb, sheetNames[0]); }
  };

  // редактирование превью
  const setStageName = (si, name) => setParsed((p) => ({ ...p, stages: p.stages.map((s, i) => i === si ? { ...s, name } : s) }));
  const setTaskField = (si, ti, field, val) => setParsed((p) => ({
    ...p, stages: p.stages.map((s, i) => i !== si ? s : { ...s, tasks: s.tasks.map((t, j) => j === ti ? { ...t, [field]: field === "cost" ? val : val } : t) }),
  }));
  const delTask = (si, ti) => setParsed((p) => ({ ...p, stages: p.stages.map((s, i) => i !== si ? s : { ...s, tasks: s.tasks.filter((_, j) => j !== ti) }).filter((s) => s.tasks.length > 0) }));
  const delStage = (si) => setParsed((p) => ({ ...p, stages: p.stages.filter((_, i) => i !== si) }));

  const total = parsed ? parsed.stages.reduce((a, s) => a + s.tasks.reduce((x, t) => x + numVal(t.cost), 0), 0) : 0;
  const taskCount = parsed ? parsed.stages.reduce((a, s) => a + s.tasks.length, 0) : 0;

  // ЗАДАЧА 5: пересчёт себестоимости из внешней цены живьём, по мере ввода
  // маркапа — чтобы предупреждения о некорректных позициях были видны ДО подтверждения.
  const converted = useMemo(() => (parsed ? computeInsertCosts(parsed, importKind, markupPct) : null), [parsed, importKind, markupPct]);
  const convertedCostTotal = converted ? converted.stages.reduce((a, s) => a + s.tasks.reduce((x, t) => x + numVal(t.cost), 0), 0) : 0;

  const confirm = () => {
    const clean = { ...parsed, stages: parsed.stages.map((s) => ({ ...s, tasks: s.tasks.filter((t) => t.name.trim()) })).filter((s) => s.tasks.length > 0) };
    if (clean.stages.length === 0) { setErrorMsg("Нечего импортировать."); setStep("error"); return; }
    const { stages: costedStages } = computeInsertCosts(clean, importKind, markupPct);
    const meta = importKind === "external" ? { globalMarkup: numVal(markupPct) } : null;
    onConfirm(stagesFromParsed({ ...clean, stages: costedStages }), meta);
  };

  return (
    <div className="kb-modal-overlay" onMouseDown={onClose}>
      <div className="kb-modal kb-import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kb-modal-head">
          <span className="kb-modal-title">Импорт сметы</span>
          <button type="button" className="kb-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
        </div>

        {step === "reading" && <div className="kb-modal-status"><Loader2 className="kb-spin" size={20} strokeWidth={1.5} /> Читаю файл…</div>}

        {step === "sheet" && (
          <div className="kb-modal-body">
            <div className="kb-modal-note">В файле несколько листов. Выберите, какой импортировать:</div>
            <div className="kb-sheet-list">
              {sheetNames.map((n) => (
                <button key={n} type="button" className="kb-sheet-btn" onClick={() => runParseSheet(wb, n)}>
                  <FileSpreadsheet size={15} strokeWidth={1.5} /> {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "parsing" && <div className="kb-modal-status"><Loader2 className="kb-spin" size={20} strokeWidth={1.5} /> ИИ разбирает структуру сметы…</div>}

        {step === "error" && (
          <div className="kb-modal-body">
            <div className="kb-modal-status is-error"><AlertTriangle size={20} strokeWidth={1.5} /> {errorMsg}</div>
            <div className="kb-modal-actions">
              <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Закрыть</button>
              {(wb || isPdf) && <button type="button" className="kb-btn kb-btn-primary" onClick={retry}>Попробовать снова</button>}
            </div>
          </div>
        )}

        {step === "preview" && parsed && (
          <>
            <div className="kb-modal-body kb-import-preview">
              <div className="kb-modal-note">Проверьте распознанное и при необходимости поправьте. Каждая задача добавится с кубиком «фикс за всё».</div>

              <div className="kb-import-kind">
                <div className="kb-import-kind-q">Вы импортируете внутреннюю смету или внешнюю?</div>
                <div className="kb-import-kind-opts">
                  <button type="button" className={"kb-import-kind-opt" + (importKind === "internal" ? " is-active" : "")}
                    onClick={() => setImportKind("internal")}>Внутреннюю</button>
                  <button type="button" className={"kb-import-kind-opt" + (importKind === "external" ? " is-active" : "")}
                    onClick={() => setImportKind("external")}>Внешнюю</button>
                </div>
                {importKind === "external" && (
                  <>
                    <div className="kb-import-kind-markup">
                      <label className="kb-import-kind-marklbl">Маркап в этих ценах, %</label>
                      <input className="kb-input kb-input-num" value={markupPct} placeholder="20"
                        onChange={(e) => setMarkupPct(e.target.value)} />
                    </div>
                    <div className="kb-import-kind-result">Восстановленная себестоимость: {fmt(convertedCostTotal)} ₽ (при импорте Kubiki накрутит те же {fmt(numVal(markupPct))}% обратно)</div>
                    {converted.extraWarnings.length > 0 && (
                      <div className="kb-import-kind-warn">
                        {converted.extraWarnings.slice(0, 5).map((w, i) => <div key={i}>{w}</div>)}
                      </div>
                    )}
                    <div className="kb-import-kind-hint">
                      Обратный пересчёт использует единый маркап на всю смету. Если в исходном файле маржа размазана
                      по позициям по-разному — восстановленная себестоимость будет приблизительной, точные значения
                      продюсер поправит вручную после импорта. Это осознанное упрощение, не баг.
                    </div>
                  </>
                )}
              </div>

              {parsed.stages.map((s, si) => (
                <div key={si} className="kb-prev-stage">
                  <div className="kb-prev-stage-head">
                    <input className="kb-input kb-prev-stage-name" value={s.name} onChange={(e) => setStageName(si, e.target.value)} />
                    <button type="button" className="kb-icon-btn" title="Убрать этап" onClick={() => delStage(si)}><Trash2 size={13} strokeWidth={1.5} /></button>
                  </div>
                  {s.tasks.map((t, ti) => (
                    <div key={ti} className="kb-prev-task">
                      <input className="kb-input kb-prev-task-name" value={t.name} onChange={(e) => setTaskField(si, ti, "name", e.target.value)} />
                      <input className="kb-input kb-input-num kb-prev-task-cost" value={t.cost}
                        onChange={(e) => setTaskField(si, ti, "cost", e.target.value)} />
                      <span className="kb-prev-cur">₽</span>
                      <button type="button" className="kb-icon-btn" title="Убрать задачу" onClick={() => delTask(si, ti)}><X size={13} strokeWidth={1.5} /></button>
                    </div>
                  ))}
                </div>
              ))}
              {warnings.length > 0 && (
                <div className="kb-prev-warnings">
                  <div className="kb-prev-warn-title"><AlertTriangle size={13} strokeWidth={1.5} /> Не распозналось однозначно ({warnings.length}):</div>
                  {warnings.slice(0, 8).map((w, i) => <div key={i} className="kb-prev-warn-item">{w}</div>)}
                </div>
              )}
            </div>
            <div className="kb-modal-foot">
              <div className="kb-prev-summary">Этапов: {parsed.stages.length} · задач: {taskCount} · сумма: {fmt(total)} ₽</div>
              <div className="kb-modal-actions">
                <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button>
                <button type="button" className="kb-btn kb-btn-primary" onClick={confirm} disabled={taskCount === 0}>Импортировать</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Крупная плашка импорта в центре пустой рабочей зоны (нет ни одного этапа). */
export function ImportEmptyState({ onPickFile }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const pick = (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv|pdf)$/i.test(file.name)) return;
    onPickFile(file);
  };
  return (
    <div className="kb-import-empty">
      <div className={"kb-import-hero" + (over ? " is-over" : "")}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <UploadCloud size={30} strokeWidth={1.5} />
        <div className="kb-import-hero-title">ИИ-импорт сметы</div>
        <div className="kb-import-hero-sub">Перетащите файл .xlsx / .csv / .pdf или нажмите — ИИ распознает структуру, вы проверите и подтвердите</div>
      </div>
      <div className="kb-import-empty-or">или соберите смету вручную ниже</div>
    </div>
  );
}

/* Кликабельное лого слева вверху с меню уровня документа
   (импорт из Excel/PDF, сохранение/загрузка файла проекта — п.7.2). */
export function LogoMenu({ onPickFile, onSaveProject, onLoadProject }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const projectInputRef = useRef(null);
  useOutsideClose(ref, () => setOpen(false));
  const pick = (file) => {
    if (file && /\.(xlsx|xls|csv|pdf)$/i.test(file.name)) onPickFile(file);
    setOpen(false);
  };
  const pickProject = (file) => {
    if (file && onLoadProject) onLoadProject(file);
    setOpen(false);
  };
  return (
    <div className="kb-logomenu" ref={ref}>
      <button type="button" className="kb-logomenu-btn" onClick={() => setOpen((v) => !v)} title="Меню">
        <Logo size={20} />
        <ChevronDown size={13} strokeWidth={1.5} />
      </button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={projectInputRef} type="file" accept=".json,application/json" hidden
        onChange={(e) => { pickProject(e.target.files?.[0]); e.target.value = ""; }} />
      {open && (
        <div className="kb-logomenu-pop">
          <button type="button" className="kb-logomenu-item" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={15} strokeWidth={1.5} /> ИИ-импорт сметы
          </button>
          {onSaveProject && (
            <button type="button" className="kb-logomenu-item" onClick={() => { onSaveProject(); setOpen(false); }}>
              <Download size={15} strokeWidth={1.5} /> Сохранить проект
            </button>
          )}
          {onLoadProject && (
            <button type="button" className="kb-logomenu-item" onClick={() => projectInputRef.current?.click()}>
              <FolderOpen size={15} strokeWidth={1.5} /> Загрузить проект
            </button>
          )}
        </div>
      )}
    </div>
  );
}
