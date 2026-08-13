import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X } from "lucide-react";
import { fmt } from "../utils.js";
import { buildAiEditContinuation } from "../ai/editContinuation.js";

const METRICS = [
  ["internalCost", "Себестоимость", "₽"], ["executorTaxes", "Налоги исполнителей", "₽"],
  ["markup", "Маркап", "₽"], ["price", "Цена до налогов проекта", "₽"],
  ["projectTax", "Налог проекта", "₽"], ["vat", "НДС", "₽"], ["total", "Итого", "₽"],
  ["stages", "Этапы", ""], ["tasks", "Задачи", ""], ["executors", "Исполнители", ""],
];
const planLines = (plan) => plan ? [
  plan.stages.created.length ? `Создадутся Stage: ${plan.stages.created.join(", ")}` : "",
  plan.tasks.created.length ? `Создадутся Task: ${plan.tasks.created.join(", ")}` : "",
  plan.executors.created.length ? `Добавятся Executor: ${plan.executors.created.join(", ")}` : "",
  `Изменений: ${plan.operationCount}`,
].filter(Boolean) : [];

export function AiEditTechnicalModal({ scope, contextLabel = "Вся смета", variant = "dialog", position = null, closing = false, submitRef = null, outsideBoundaryRef = null, onRequest, onCancelRequest, onApply, onClose, onUndo, canUndo = false }) {
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [confirmed, setConfirmed] = useState({});
  const requestVersion = useRef(0);
  const panelRef = useRef(null);
  const [inlinePosition, setInlinePosition] = useState({ left: position?.x || 16, top: position?.y || 16 });
  useLayoutEffect(() => {
    if (variant !== "inline" || !panelRef.current) return;
    const padding = 12, gap = 8;
    const place = () => {
      const rect = panelRef.current.getBoundingClientRect(), anchorX = position?.x || padding, anchorY = position?.y || padding;
      let left = anchorX + gap, top = anchorY + gap;
      if (left + rect.width > window.innerWidth - padding) left = anchorX - rect.width - gap;
      if (top + rect.height > window.innerHeight - padding) top = anchorY - rect.height - gap;
      left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding));
      top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding));
      setInlinePosition({ left, top });
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(panelRef.current);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [position?.x, position?.y, variant, result, state]);
  const request = async ({ answer = "", source = null, label = "" } = {}) => {
    if (!instruction.trim()) return;
    const continuation = buildAiEditContinuation({ instruction, answer, source, label, confirmed, continuationToken: result?.continuationToken });
    const version = ++requestVersion.current;
    setConfirmed(continuation.confirmed);
    setState("loading"); setError(""); setErrorCode(""); setResult(null);
    try { const next = await onRequest({ scope, ...continuation }); if (version !== requestVersion.current) return; setResult(next); setClarificationAnswer(""); setState("ready"); }
    catch (failure) { if (version !== requestVersion.current) return; if (failure?.code !== "cancelled") { setError(failure.message); setErrorCode(failure.code || ""); } setState("idle"); }
  };
  const apply = async () => {
    setState("applying"); setError(""); setErrorCode("");
    try { await onApply(result); onClose(); } catch (failure) { setError(failure.message); setErrorCode(failure.code || ""); setState("ready"); }
  };
  const busy = state === "loading" || state === "applying";
  const submit = () => request();
  if (submitRef) submitRef.current = state === "idle" && !result && !error && instruction.trim() ? submit : null;
  useEffect(() => {
    if (variant === "dialog") return;
    const close = (event) => { const boundary = outsideBoundaryRef?.current || panelRef.current; if (!busy && boundary && !boundary.contains(event.target)) onClose(); };
    const key = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("mousedown", close, true); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", close, true); document.removeEventListener("keydown", key); };
  }, [busy, onClose, outsideBoundaryRef, variant]);
  if (variant === "launcher") {
    const feedbackVisible = state !== "idle" || !!result || !!error;
    return <div ref={panelRef} className={`kb-ai-launcher-panel${closing ? " is-closing" : ""}`}>
      {feedbackVisible && <div className="kb-ai-launcher-feedback">
        {state === "loading" && <div className="kb-modal-note">Готовим предложение…</div>}
        {error && <div className="kb-server-error">{error}{errorCode ? <> · <code>{errorCode}</code></> : null}</div>}
        {result?.kind === "clarification" && <div className="kb-ai-launcher-feedback-content"><strong>Нужно уточнение</strong><div className="kb-modal-note">{result.question}</div>
          <div className="kb-ai-launcher-choices">{result.choices?.map((choice) => <button type="button" className="kb-btn kb-btn-ghost" key={choice.id} onClick={() => request({ source: choice.source, label: choice.label })}>{choice.label}</button>)}</div>
          <div className="kb-ai-launcher-answer"><input autoFocus className="kb-input" value={clarificationAnswer} onChange={(event) => setClarificationAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && clarificationAnswer.trim()) request({ answer: clarificationAnswer.trim() }); }} placeholder="Короткий ответ на уточнение" /><button type="button" className="kb-btn kb-btn-primary" disabled={!clarificationAnswer.trim()} onClick={() => request({ answer: clarificationAnswer.trim() })}>Продолжить</button></div>
        </div>}
        {result?.kind === "out_of_scope" && <div className="kb-modal-note">{result.message}</div>}
        {result?.kind === "error" && <div className="kb-server-error">{result.message}</div>}
        {result?.kind === "diff" && <div className="kb-ai-launcher-feedback-content"><strong>{result.summary}</strong>
          <div>{planLines(result.plan).map((line) => <div key={line} className="kb-modal-note">{line}</div>)}</div>
          <div>{result.operations.map((operation) => <div key={operation.id} className="kb-modal-note">• {operation.reason}</div>)}</div>
          <div className="kb-ai-launcher-metrics">{METRICS.map(([key, label, unit]) => <div key={key} className="kb-modal-note">{label}: {fmt(result.before[key])}{unit} → {fmt(result.after[key])}{unit}</div>)}</div>
          {result.warnings.map((warning) => <div key={warning} className="kb-server-error">{warning}</div>)}
        </div>}
        <div className="kb-ai-launcher-feedback-actions">
          {state === "loading" && <button type="button" className="kb-btn kb-btn-ghost" onClick={() => { requestVersion.current += 1; onCancelRequest(); setState("idle"); }}>Отменить запрос</button>}
          {result?.kind === "diff" && <button type="button" className="kb-btn kb-btn-primary" onClick={apply} disabled={busy}>{state === "applying" ? "Применяем…" : "Применить"}</button>}
          {error && <button type="button" className="kb-btn kb-btn-ghost" onClick={() => { setError(""); setErrorCode(""); }}>Закрыть</button>}
          {result && !["diff", "clarification"].includes(result.kind) && <button type="button" className="kb-btn kb-btn-primary" onClick={() => { setResult(null); setError(""); setErrorCode(""); setConfirmed({}); }}>Новый запрос</button>}
        </div>
      </div>}
      <div className="kb-import-panel kb-import-panel-unified kb-ai-launcher-prompt">
        <div className="kb-unified-input">
          <textarea autoFocus className="kb-generate-textarea" rows={4} value={instruction} maxLength={4000} disabled={busy || result?.kind === "diff"}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter" && !event.shiftKey && !busy && !result) { event.preventDefault(); submit(); } }}
            placeholder="Опишите, что нужно изменить в смете" />
        </div>
      </div>
    </div>;
  }
  if (variant === "inline") {
    const feedbackVisible = state !== "idle" || !!result || !!error;
    return createPortal(<div className="kb-ai-inline-anchor" style={inlinePosition}>
      <div ref={panelRef} className="kb-ai-inline-panel kb-ai-inline-surface">
        {feedbackVisible && <div className="kb-ai-launcher-feedback kb-ai-inline-feedback">
          {state === "loading" && <div className="kb-modal-note">Готовим предложение…</div>}
          {error && <div className="kb-server-error">{error}{errorCode ? <> · <code>{errorCode}</code></> : null}</div>}
          {result?.kind === "clarification" && <div className="kb-ai-launcher-feedback-content"><strong>Нужно уточнение</strong><div className="kb-modal-note">{result.question}</div>
            <div className="kb-ai-launcher-choices">{result.choices?.map((choice) => <button type="button" className="kb-btn kb-btn-ghost" key={choice.id} onClick={() => request({ source: choice.source, label: choice.label })}>{choice.label}</button>)}</div>
            <div className="kb-ai-launcher-answer"><input autoFocus className="kb-input" value={clarificationAnswer} onChange={(event) => setClarificationAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && clarificationAnswer.trim()) request({ answer: clarificationAnswer.trim() }); }} placeholder="Короткий ответ" /><button type="button" className="kb-btn kb-btn-primary" disabled={!clarificationAnswer.trim()} onClick={() => request({ answer: clarificationAnswer.trim() })}>Продолжить</button></div>
          </div>}
          {result?.kind === "out_of_scope" && <div className="kb-modal-note">{result.message}</div>}
          {result?.kind === "error" && <div className="kb-server-error">{result.message}</div>}
          {result?.kind === "diff" && <div className="kb-ai-launcher-feedback-content"><strong>{result.summary}</strong>
            <div>{planLines(result.plan).map((line) => <div key={line} className="kb-modal-note">{line}</div>)}</div>
            <div>{result.operations.map((operation) => <div key={operation.id} className="kb-modal-note">• {operation.reason}</div>)}</div>
            <div className="kb-ai-launcher-metrics">{METRICS.map(([key, label, unit]) => <div key={key} className="kb-modal-note">{label}: {fmt(result.before[key])}{unit} → {fmt(result.after[key])}{unit}</div>)}</div>
            {result.warnings.map((warning) => <div key={warning} className="kb-server-error">{warning}</div>)}
          </div>}
          <div className="kb-ai-launcher-feedback-actions">
            {state === "loading" && <button type="button" className="kb-btn kb-btn-ghost" onClick={() => { requestVersion.current += 1; onCancelRequest(); setState("idle"); }}>Отменить запрос</button>}
            {result?.kind === "diff" && <button type="button" className="kb-btn kb-btn-primary" onClick={apply} disabled={busy}>{state === "applying" ? "Применяем…" : "Применить"}</button>}
            {error && <button type="button" className="kb-btn kb-btn-ghost" onClick={() => { setError(""); setErrorCode(""); }}>Закрыть</button>}
            {result && !["diff", "clarification"].includes(result.kind) && <button type="button" className="kb-btn kb-btn-primary" onClick={() => { setResult(null); setError(""); setErrorCode(""); setConfirmed({}); }}>Новый запрос</button>}
          </div>
        </div>}
        <div className="kb-import-panel kb-import-panel-unified kb-ai-launcher-prompt kb-ai-inline-prompt kb-ai-inline-input-section">
          <div className="kb-unified-input">
            <textarea autoFocus className="kb-generate-textarea" rows={4} value={instruction} maxLength={4000} disabled={busy || result?.kind === "diff"}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter" && !event.shiftKey && !busy && !result) { event.preventDefault(); request(); } }}
              placeholder="Опишите, что нужно изменить в смете" />
            <button type="button" className="kb-send-btn" onClick={() => request()} disabled={!instruction.trim() || busy || !!result} title="Предпросмотр изменений" aria-label="Предпросмотр изменений"><ArrowUp size={15} strokeWidth={1.8} /></button>
          </div>
        </div>
      </div>
    </div>, document.body);
  }
  const panel = <div ref={panelRef} className={`kb-modal kb-ai-settings-modal kb-ai-edit-${variant}`} role="dialog" aria-modal={variant === "dialog" ? "true" : undefined} aria-labelledby="ai-edit-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head"><span className="kb-modal-title" id="ai-edit-title">Изменить смету с AI</span><button type="button" className="kb-icon-btn" onClick={onClose} disabled={busy}><X size={16} /></button></div>
      <div className="kb-modal-body">
        <div className="kb-modal-note">Контекст: <strong>{contextLabel}</strong>. Изменения появятся только после подтверждения.</div>
        <textarea autoFocus className="kb-input kb-ai-settings-text" rows={variant === "inline" ? 3 : 5} maxLength={4000} value={instruction} disabled={busy || result?.kind === "diff"} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); if (event.key === "Enter" && !event.shiftKey && !busy && !result?.kind) { event.preventDefault(); request(); } }} placeholder="Например: добавь задачу «Ретопология» в этот этап" />
        {state === "loading" && <div className="kb-modal-note">Готовим предложение…</div>}
        {error && <div className="kb-server-error">{error}{errorCode ? <> · <code>{errorCode}</code></> : null}</div>}
        {result?.kind === "clarification" && <div className="kb-modal-note"><strong>Нужно уточнение:</strong> {result.question}
          {result.choices?.map((choice) => <button type="button" className="kb-btn kb-btn-ghost" key={choice.id} onClick={() => request({ source: choice.source, label: choice.label })}>{choice.label}</button>)}
          <div><input className="kb-input" value={clarificationAnswer} onChange={(event) => setClarificationAnswer(event.target.value)} placeholder="Короткий ответ на уточнение" /><button type="button" className="kb-btn kb-btn-primary" disabled={!clarificationAnswer.trim()} onClick={() => request({ answer: clarificationAnswer.trim() })}>Продолжить</button></div>
        </div>}
        {result?.kind === "out_of_scope" && <div className="kb-modal-note">{result.message}</div>}
        {result?.kind === "error" && <div className="kb-server-error">{result.message}</div>}
        {result?.kind === "diff" && <>
          <div className="kb-modal-note"><strong>{result.summary}</strong></div>
          <div>{planLines(result.plan).map((line) => <div key={line} className="kb-modal-note">{line}</div>)}</div>
          <div>{result.operations.map((operation) => <div key={operation.id} className="kb-modal-note">• {operation.reason}</div>)}</div>
          <div>{METRICS.map(([key, label, unit]) => <div key={key} className="kb-modal-note">{label}: {fmt(result.before[key])}{unit} → {fmt(result.after[key])}{unit}</div>)}</div>
          {result.warnings.map((warning) => <div key={warning} className="kb-server-error">{warning}</div>)}
        </>}
        <div className="kb-modal-actions">
          {state === "loading" ? <button type="button" className="kb-btn kb-btn-ghost" onClick={() => { requestVersion.current += 1; onCancelRequest(); setState("idle"); }}>Отменить запрос</button> : <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button>}
          {!result?.kind && state !== "loading" && <button type="button" className="kb-btn kb-btn-primary" onClick={() => request()} disabled={!instruction.trim()}>Предпросмотр</button>}
          {result?.kind === "diff" && <button type="button" className="kb-btn kb-btn-primary" onClick={apply} disabled={busy}>{state === "applying" ? "Применяем…" : "Применить"}</button>}
          {canUndo && onUndo && <button type="button" className="kb-btn kb-btn-ghost" onClick={onUndo} disabled={busy}>Отменить последнее AI-изменение</button>}
          {result && result.kind !== "diff" && result.kind !== "clarification" && <button type="button" className="kb-btn kb-btn-primary" onClick={() => { setResult(null); setError(""); setErrorCode(""); setConfirmed({}); }}>Новый запрос</button>}
        </div>
      </div>
    </div>;
  if (variant === "launcher") return <div className={`kb-ai-launcher-panel${closing ? " is-closing" : ""}`}>{panel}</div>;
  return <div className="kb-modal-overlay kb-ai-global-overlay" onMouseDown={busy ? undefined : onClose}>{panel}</div>;
}
