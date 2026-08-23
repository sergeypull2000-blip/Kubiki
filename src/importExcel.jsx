import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  X, Trash2, ChevronDown, AlertTriangle,
  Loader2, FileSpreadsheet, Download, FolderOpen, Paperclip, ArrowUp,
} from "lucide-react";
import { formatMoney, numVal } from "./utils.js";
import { Logo } from "./Logo.jsx";
import { useOutsideClose } from "./hooks.js";
import { generateEstimateRequest } from "./ai/generationClient.js";
import { requireAiDisclosure } from "./ai/disclosureGate.js";
import { extractWordBrief } from "./ai/wordBrief.js";
import { stagesFromGeneratedEstimate } from "./ai/estimateInsertion.js";
import { dismissOnBackdrop, useModalDismiss } from "./components/modalDismiss.js";
import { kubikiApiRequest } from "./backend/apiTransport.js";

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
async function llmParseText(sheetText, filename, instruction = "") {
  await requireAiDisclosure();
  const j = await kubikiApiRequest("/api/parse-excel", { method: "POST", json: { sheet: sheetText, filename, instruction } });
  const hasEstimateTasks = j && Array.isArray(j.stages) && j.stages.some((stage) => Array.isArray(stage?.tasks) && stage.tasks.length > 0);
  if (!hasEstimateTasks) throw new Error("Файл не является сметой.");
  return j;
}

/* ЗАДАЧА 6 — генерация черновой сметы из текстового описания проекта.
   Тот же пайплайн, что и импорт из Excel/PDF (validateParsed →
   превью → прямая вставка внутренней себестоимости), меняется только
   вход (описание вместо таблицы) и системный промпт на сервере. */
async function llmGenerateEstimate(description, instruction = "") {
  await requireAiDisclosure();
  const j = await generateEstimateRequest({ description, instruction });
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
      .filter((t) => t && typeof t.name === "string" && t.name.trim() && (Array.isArray(t.executors) && t.executors.length || Number.isFinite(Number(t.cost))))
      .map((t) => ({ name: t.name.trim(), executors: Array.isArray(t.executors) && t.executors.length
        ? structuredClone(t.executors)
        : [{ type: "anonymous_unnamed", paymentType: "fix_total", compensation: Number(t.cost) }] })),
  })).filter((s) => s.tasks.length > 0);
  if (stages.length === 0) throw new Error("Не удалось распознать ни одной задачи с ценой. Проверьте файл или импортируйте другой лист.");
  return {
    schemaVersion: 2, kind: "generated_structure", generationScope: json.generationScope || "whole_project",
    projectName: typeof json.projectName === "string" && json.projectName.trim() ? json.projectName.trim() : "Generated estimate",
    stages,
    warnings: Array.isArray(json.warnings) ? json.warnings.filter((w) => typeof w === "string") : [],
  };
}

/* Состояние и правки редактируемого превью (общее для импорта из файла и
   генерации по описанию — единый пайплайн, разный только источник parsed). */
function useEstimateEditor(performers = []) {
  const [parsed, setParsed] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const load = (valid) => { setParsed(valid); setWarnings(valid.warnings); };

  const setStageName = (si, name) => setParsed((p) => ({ ...p, stages: p.stages.map((s, i) => i === si ? { ...s, name } : s) }));
  const setProjectName = (projectName) => setParsed((p) => ({ ...p, projectName }));
  const setTaskField = (si, ti, field, val) => setParsed((p) => ({
    ...p, stages: p.stages.map((s, i) => i !== si ? s : { ...s, tasks: s.tasks.map((t, j) => j === ti ? { ...t, [field]: val } : t) }),
  }));
  const delTask = (si, ti) => setParsed((p) => ({ ...p, stages: p.stages.map((s, i) => i !== si ? s : { ...s, tasks: s.tasks.filter((_, j) => j !== ti) }).filter((s) => s.tasks.length > 0) }));
  const delStage = (si) => setParsed((p) => ({ ...p, stages: p.stages.filter((_, i) => i !== si) }));

  const total = parsed ? parsed.stages.reduce((a, s) => a + s.tasks.reduce((x, t) => x + t.executors.reduce((sum, executor) => sum + numVal(executor.compensation), 0), 0), 0) : 0;
  const taskCount = parsed ? parsed.stages.reduce((a, s) => a + s.tasks.length, 0) : 0;

  const buildConfirm = () => {
    const clean = { ...parsed, stages: parsed.stages.map((s) => ({ ...s, tasks: s.tasks.filter((t) => t.name.trim()) })).filter((s) => s.tasks.length > 0) };
    if (clean.stages.length === 0) return { ok: false, message: "Нечего импортировать." };
    const meta = {
      ...(clean.projectName ? { projectName: clean.projectName } : {}),
      generationScope: clean.generationScope,
    };
    try { return { ok: true, stages: stagesFromGeneratedEstimate(clean, performers, parsed.__generationPolicy || {}), meta }; }
    catch (error) { return { ok: false, message: error.message }; }
  };

  return {
    parsed, warnings,
    load, setProjectName, setStageName, setTaskField, delTask, delStage,
    total, taskCount, buildConfirm,
  };
}

/* Редактируемое превью распознанной/сгенерированной сметы — общий шаг
   для импорта из файла и генерации по описанию. */
function EstimatePreviewStep({ editor, generationMetadata, noteText, draftNotice, warnTitle, warnProminent, confirmLabel = "Импортировать", onClose, onConfirm }) {
  const {
    parsed, warnings,
    setProjectName, setStageName, setTaskField, delTask, delStage,
    total, taskCount, buildConfirm,
  } = editor;
  const [localError, setLocalError] = useState("");

  const confirm = () => {
    const res = buildConfirm();
    if (!res.ok) { setLocalError(res.message); return; }
    onConfirm(res.stages, generationMetadata ? { ...res.meta, generationMetadata } : res.meta);
  };

  return (
    <>
      <div className="kb-modal-body kb-import-preview">
        {draftNotice && <div className="kb-draft-notice"><AlertTriangle size={14} strokeWidth={1.5} /> {draftNotice}</div>}
        <div className="kb-modal-note">{noteText}</div>
        {parsed.generationScope === "whole_project" && (
          <input className="kb-input kb-prev-project-name" aria-label="Название проекта" value={parsed.projectName} onChange={(event) => setProjectName(event.target.value)} />
        )}

        {parsed.stages.map((s, si) => (
          <div key={si} className="kb-prev-stage">
            <div className="kb-prev-stage-head">
              <input className="kb-input kb-prev-stage-name" value={s.name} onChange={(e) => setStageName(si, e.target.value)} />
              <button type="button" className="kb-icon-btn" title="Убрать этап" onClick={() => delStage(si)}><Trash2 size={13} strokeWidth={1.5} /></button>
            </div>
            {s.tasks.map((t, ti) => (
              <div key={ti} className="kb-prev-task">
                <input className="kb-input kb-prev-task-name" value={t.name} onChange={(e) => setTaskField(si, ti, "name", e.target.value)} />
                <div className="kb-prev-executors">
                  {t.executors.map((executor, ei) => <div key={ei} className="kb-prev-executor">
                    <span className="kb-prev-executor-name">{executor.type === "performer_binding" ? executor.performerName : executor.name || "Без имени"}</span>
                    {executor.type === "performer_binding" && <small className="kb-prev-executor-field">Performer Library</small>}
                    {executor.role && <small className="kb-prev-executor-field"><b>Роль</b>{executor.role}</small>}
                    {executor.compensation !== undefined && <small className="kb-prev-executor-field"><b>Оплата</b>{formatMoney(Number(executor.compensation))} ₽</small>}
                    {(executor.paymentType || executor.compensation !== undefined) && <small className="kb-prev-executor-field"><b>Тип</b>{executor.paymentType || "fix_total"}</small>}
                    {executor.quantity !== undefined && ["fix_task", "hourly", "shift"].includes(executor.paymentType) && <small className="kb-prev-executor-field"><b>Количество</b>{executor.quantity}</small>}
                    {executor.tax !== undefined && <small className="kb-prev-executor-field"><b>Налог</b>{executor.tax}%</small>}
                  </div>)}
                </div>
                <button type="button" className="kb-icon-btn" title="Убрать задачу" onClick={() => delTask(si, ti)}><X size={13} strokeWidth={1.5} /></button>
              </div>
            ))}
          </div>
        ))}
        {warnings.length > 0 && (
          <div className={"kb-prev-warnings" + (warnProminent ? " kb-prev-warnings-lg" : "")}>
            <div className="kb-prev-warn-title"><AlertTriangle size={warnProminent ? 15 : 13} strokeWidth={1.5} /> {warnTitle || `Не распозналось однозначно (${warnings.length}):`}</div>
            {warnings.slice(0, 8).map((w, i) => <div key={i} className="kb-prev-warn-item">{w}</div>)}
          </div>
        )}
        {localError && <div className="kb-modal-status is-error"><AlertTriangle size={16} strokeWidth={1.5} /> {localError}</div>}
        <div className="kb-ai-result-label">Сгенерировано с помощью ИИ · Проверьте результат</div>
      </div>
      <div className="kb-modal-foot">
        <div className="kb-prev-summary">Этапов: {parsed.stages.length} · задач: {taskCount} · сумма: {formatMoney(total)} ₽</div>
        <div className="kb-modal-actions">
          <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button>
          <button type="button" className="kb-btn kb-btn-primary" onClick={confirm} disabled={taskCount === 0}>{confirmLabel}</button>
        </div>
      </div>
    </>
  );
}

/* Модалка импорта: извлечение текста (Excel-лист / PDF-страницы) → разбор →
   редактируемое превью → вставка. */
export function ImportModal({ file, instruction = "", onClose, onConfirm }) {
  useModalDismiss(onClose);
  const isPdf = /\.pdf$/i.test(file.name);
  const isWord = /\.(docx|doc)$/i.test(file.name);
  const [step, setStep] = useState("reading"); // reading|sheet|parsing|preview|error
  const [wb, setWb] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [generationMetadata, setGenerationMetadata] = useState(null);
  const editor = useEstimateEditor();

  // шаг 1: извлечение текста из файла (в коде, не в LLM) — способ зависит
  // от расширения, дальше единый пайплайн (LLM-разбор/превью/вставка)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isWord) {
        try {
          const text = await extractWordBrief(file);
          if (!cancelled) runGenerateWord(text);
        } catch (error) {
          if (!cancelled) { setErrorMsg(error?.message || "Не удалось прочитать Word-файл."); setStep("error"); }
        }
        return;
      }
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
      const raw = await llmParseText(text, sourceLabel, instruction);
      editor.load(validateParsed(raw));
      setStep("preview");
    } catch (e) {
      setErrorMsg(e.message || "Не удалось разобрать смету.");
      setStep("error");
    }
  };

  const runGenerateWord = async (text) => {
    setStep("parsing");
    try {
      const raw = await llmGenerateEstimate(text, instruction);
      setGenerationMetadata(raw.__generationMetadata || null);
      editor.load(validateParsed(raw));
      setStep("preview");
    } catch (error) {
      setErrorMsg(error?.message || "Не удалось собрать смету по Word-брифу.");
      setStep("error");
    }
  };

  const retry = () => {
    if (isWord) { setErrorMsg(""); setStep("reading"); extractWordBrief(file).then(runGenerateWord).catch((error) => { setErrorMsg(error?.message || "Не удалось прочитать Word-файл."); setStep("error"); }); return; }
    if (isPdf) { setErrorMsg(""); setStep("reading"); extractPdfRows(file).then((rows) => {
      if (rows.length === 0) { setErrorMsg("Не удалось прочитать текст из PDF — возможно, это скан. Попробуйте Excel или PDF с текстом."); setStep("error"); return; }
      runParseText(serializePdfRows(rows), file.name);
    }).catch(() => { setErrorMsg("Не удалось прочитать PDF-файл."); setStep("error"); }); return; }
    if (wb) { sheetNames.length > 1 ? setStep("sheet") : runParseSheet(wb, sheetNames[0]); }
  };

  return (
    <div className="kb-modal-overlay" onMouseDown={dismissOnBackdrop(onClose)}>
      <div className="kb-modal kb-import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kb-modal-head">
          <span className="kb-modal-title">{isWord ? "Черновая смета по Word-брифу" : "Импорт сметы"}</span>
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
              {(wb || isPdf || isWord) && <button type="button" className="kb-btn kb-btn-primary" onClick={retry}>Попробовать снова</button>}
            </div>
          </div>
        )}

        {step === "preview" && editor.parsed && (
          <EstimatePreviewStep editor={editor}
            generationMetadata={generationMetadata}
            noteText="Проверьте распознанное и при необходимости поправьте. Каждая задача добавится с кубиком «фикс за всё»."
            draftNotice={isWord ? "Черновая оценка. Суммы отражают ориентировочную внутреннюю себестоимость до маркапа и налогов." : undefined}
            onClose={onClose} onConfirm={(stages, meta) => onConfirm(stages, { ...meta, importFormat: isWord ? null : (isPdf ? "pdf" : "excel") })} />
        )}
      </div>
    </div>
  );
}

/* ЗАДАЧА 6 — модалка генерации черновой сметы по текстовому описанию.
   Пайплайн такой же, как у ImportModal, только вход — не файл, а
   уже введённое описание, поэтому шагов "reading"/"sheet" нет:
   сразу parsing → preview (общий EstimatePreviewStep) → error. */
export function GenerateEstimateModal({ description, performers = [], onClose, onConfirm }) {
  useModalDismiss(onClose);
  const [step, setStep] = useState("parsing"); // parsing|preview|error
  const [errorMsg, setErrorMsg] = useState("");
  const [generationMetadata, setGenerationMetadata] = useState(null);
  const editor = useEstimateEditor(performers);

  const run = () => {
    setStep("parsing");
    llmGenerateEstimate(description)
      .then((raw) => { const metadata = raw.__generationMetadata || null; setGenerationMetadata(metadata); const valid = validateParsed(raw); valid.__generationPolicy = metadata || {}; editor.load(valid); setStep("preview"); })
      .catch((e) => { setErrorMsg(e.message || "Не удалось собрать смету."); setStep("error"); });
  };

  useEffect(() => { run(); // eslint-disable-next-line
  }, [description]);

  return (
    <div className="kb-modal-overlay" onMouseDown={dismissOnBackdrop(onClose)}>
      <div className="kb-modal kb-import-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kb-modal-head">
          <span className="kb-modal-title">Черновая смета по описанию</span>
          <button type="button" className="kb-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
        </div>

        {step === "parsing" && <div className="kb-modal-status"><Loader2 className="kb-spin" size={20} strokeWidth={1.5} /> ИИ собирает черновую смету…</div>}

        {step === "error" && (
          <div className="kb-modal-body">
            <div className="kb-modal-status is-error"><AlertTriangle size={20} strokeWidth={1.5} /> {errorMsg}</div>
            <div className="kb-modal-actions">
              <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Закрыть</button>
              <button type="button" className="kb-btn kb-btn-primary" onClick={run}>Попробовать снова</button>
            </div>
          </div>
        )}

        {step === "preview" && editor.parsed && (
          <EstimatePreviewStep editor={editor}
            generationMetadata={generationMetadata}
            draftNotice="Черновая оценка. Суммы отражают ориентировочную внутреннюю себестоимость до маркапа и налогов."
            noteText="Проверьте распознанную структуру и при необходимости поправьте. Каждая задача добавится с кубиком «фикс за всё»."
            warnTitle={`Допущения ИИ, проверьте (${editor.warnings.length}):`}
            warnProminent confirmLabel="Вставить в смету"
            onClose={onClose} onConfirm={onConfirm} />
        )}
      </div>
    </div>
  );
}


/* Компактная пара панелей под большой кнопкой «Новый этап» в пустой рабочей
   зоне: импорт файла и генерация черновой сметы по текстовому описанию —
   два равноправных альтернативных входа в один и тот же пайплайн
   (разбор LLM → превью → вставка). */
export function UnifiedImportEmptyState({ onPickFile, onGenerate, disabled = false }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState(null);
  const pick = (nextFile) => {
    if (!nextFile || !/\.(xlsx|xls|pdf|docx|doc)$/i.test(nextFile.name)) return;
    setFile(nextFile);
    if (inputRef.current) inputRef.current.value = "";
  };
  const submit = () => {
    if (disabled) return;
    const text = desc.trim();
    if (!text && !file) return;
    if (file) onPickFile(file, text);
    else onGenerate(text);
  };
  return (
    <div className="kb-import-empty">
      <div className="kb-import-empty-or">или</div>
      <div className={"kb-import-panel kb-import-panel-unified" + (over ? " is-over" : "")}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.pdf,.docx,.doc" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="kb-unified-input">
          <textarea className="kb-generate-textarea" rows={4} value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Опишите проект, импортируйте файл сметы или сделайте и то, и другое." />
          <button type="button" className="kb-icon-btn kb-attach-btn" onClick={() => inputRef.current?.click()} title="Прикрепить файл"><Paperclip size={16} strokeWidth={1.5} /></button>
          <button type="button" className="kb-send-btn" onClick={submit} disabled={disabled || (!desc.trim() && !file)} title="Создать смету" aria-label="Создать смету"><ArrowUp size={15} strokeWidth={1.8} /></button>
        </div>
        {file && <div className="kb-attached-file" title={file.name}>
          <FileSpreadsheet size={15} strokeWidth={1.5} /><span>{file.name}</span>
          <button type="button" className="kb-icon-btn" onClick={() => setFile(null)} title="Удалить файл"><X size={14} strokeWidth={1.5} /></button>
        </div>}
        {disabled && <div className="kb-ai-hydration-note">Загружаем знания студии…</div>}
      </div>
    </div>
  );
}

export function ImportEmptyState({ onPickFile, onGenerate }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState(null);
  const pick = (file) => {
    if (!file) return;
    if (!/\.(xlsx|csv|pdf|docx|doc)$/i.test(file.name)) return;
    setFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };
  const submit = () => {
    const text = desc.trim();
    if (!text && !file) return;
    if (file) onPickFile(file, text);
    else onGenerate(text);
  };
  return (
    <div className="kb-import-empty">
      <div className="kb-import-empty-or">или</div>
      <div className="kb-import-entry">
        <input ref={inputRef} type="file" accept=".xlsx,.csv,.pdf,.docx,.doc" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="kb-import-panels">
          <div className={"kb-import-panel kb-import-panel-minimal kb-import-file-field" + (over ? " is-over" : "")}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
            onClick={() => { if (!file) inputRef.current?.click(); }}>
            {!file ? <span>Импорт</span> : (
              <div className="kb-attached-file" onClick={(e) => e.stopPropagation()}>
                <FileSpreadsheet size={15} strokeWidth={1.5} />
                <span>{file.name}</span>
                <button type="button" className="kb-icon-btn" onClick={() => setFile(null)} title="Удалить файл"><X size={14} strokeWidth={1.5} /></button>
              </div>
            )}
          </div>
          <div className="kb-import-panel kb-import-panel-minimal kb-import-description-field">
          <textarea className="kb-generate-textarea" rows={4} value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); }}
            placeholder="Опишите проект" />
          </div>
        </div>
        <div className="kb-import-panel-actions">
          <button type="button" className="kb-btn kb-btn-ghost" onClick={submit} disabled={!desc.trim() && !file}>
            {file && !desc.trim() ? "Импортировать смету" : "Сгенерировать смету"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Кликабельное лого слева вверху с меню уровня документа
   (импорт из Excel/PDF, сохранение/загрузка файла проекта — п.7.2). */
export function LogoMenu({ onSaveProject, onLoadProject }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const projectInputRef = useRef(null);
  useOutsideClose(ref, () => setOpen(false));
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
      <input ref={projectInputRef} type="file" accept=".json,application/json" hidden
        onChange={(e) => { pickProject(e.target.files?.[0]); e.target.value = ""; }} />
      {open && (
        <div className="kb-logomenu-pop">
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
