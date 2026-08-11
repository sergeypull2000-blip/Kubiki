import { useState } from "react";
import { X } from "lucide-react";
import { fmt } from "../utils.js";
import { buildAiEditContinuation } from "../ai/editContinuation.js";

const METRICS = [
  ["internalCost", "Себестоимость", "₽"], ["executorTaxes", "Налоги исполнителей", "₽"],
  ["markup", "Маркап", "₽"], ["price", "Цена до налогов проекта", "₽"],
  ["projectTax", "Налог проекта", "₽"], ["vat", "НДС", "₽"], ["total", "Итого", "₽"],
  ["stages", "Этапы", ""], ["tasks", "Задачи", ""], ["executors", "Исполнители", ""],
];

export function AiEditTechnicalModal({ scope, onRequest, onCancelRequest, onApply, onClose }) {
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [confirmed, setConfirmed] = useState({});
  const request = async ({ answer = "", source = null, label = "" } = {}) => {
    if (!instruction.trim()) return;
    const continuation = buildAiEditContinuation({ instruction, answer, source, label, confirmed });
    setConfirmed(continuation.confirmed);
    setState("loading"); setError(""); setErrorCode(""); setResult(null);
    try { setResult(await onRequest({ scope, ...continuation })); setClarificationAnswer(""); setState("ready"); }
    catch (failure) { if (failure?.code !== "cancelled") { setError(failure.message); setErrorCode(failure.code || ""); } setState("idle"); }
  };
  const apply = async () => {
    setState("applying"); setError(""); setErrorCode("");
    try { await onApply(result); onClose(); } catch (failure) { setError(failure.message); setErrorCode(failure.code || ""); setState("ready"); }
  };
  const busy = state === "loading" || state === "applying";
  return <div className="kb-modal-overlay" onMouseDown={busy ? undefined : onClose}>
    <div className="kb-modal kb-ai-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ai-edit-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head"><span className="kb-modal-title" id="ai-edit-title">AI-diff · технический MVP</span><button type="button" className="kb-icon-btn" onClick={onClose} disabled={busy}><X size={16} /></button></div>
      <div className="kb-modal-body">
        <div className="kb-modal-note">Контекст: {scope.kind}. AI только предложит операции; Project изменится после подтверждения.</div>
        <textarea className="kb-input kb-ai-settings-text" rows={5} maxLength={4000} value={instruction} disabled={busy || result?.kind === "diff"} onChange={(event) => setInstruction(event.target.value)} placeholder="Например: добавь задачу «Ретопология» в этот этап" />
        {state === "loading" && <div className="kb-modal-note">Готовим diff…</div>}
        {error && <div className="kb-server-error">{error}{errorCode ? <> · <code>{errorCode}</code></> : null}</div>}
        {result && <div className="kb-modal-note">Ответ: <code>{result.kind}</code>{result.kind === "diff" ? ` · операций: ${result.operations.length}` : ""}</div>}
        {result?.kind === "clarification" && <div className="kb-modal-note"><strong>Нужно уточнение:</strong> {result.question}
          {result.choices?.map((choice) => <button type="button" className="kb-btn kb-btn-ghost" key={choice.id} onClick={() => request({ source: choice.source, label: choice.label })}>{choice.label}</button>)}
          <div><input className="kb-input" value={clarificationAnswer} onChange={(event) => setClarificationAnswer(event.target.value)} placeholder="Короткий ответ на уточнение" /><button type="button" className="kb-btn kb-btn-primary" disabled={!clarificationAnswer.trim()} onClick={() => request({ answer: clarificationAnswer.trim() })}>Продолжить</button></div>
        </div>}
        {result?.kind === "out_of_scope" && <div className="kb-modal-note">{result.message}</div>}
        {result?.kind === "error" && <div className="kb-server-error">{result.message}</div>}
        {result?.kind === "diff" && <>
          <div className="kb-modal-note"><strong>{result.summary}</strong></div>
          <div>{result.operations.map((operation) => <div key={operation.id} className="kb-modal-note"><code>{operation.type}</code> · {operation.reason}</div>)}</div>
          <div>{METRICS.map(([key, label, unit]) => <div key={key} className="kb-modal-note">{label}: {fmt(result.before[key])}{unit} → {fmt(result.after[key])}{unit}</div>)}</div>
          {result.warnings.map((warning) => <div key={warning} className="kb-server-error">{warning}</div>)}
        </>}
        <div className="kb-modal-actions">
          {state === "loading" ? <button type="button" className="kb-btn kb-btn-ghost" onClick={() => { onCancelRequest(); setState("idle"); }}>Отменить запрос</button> : <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Закрыть</button>}
          {!result?.kind && state !== "loading" && <button type="button" className="kb-btn kb-btn-primary" onClick={() => request()} disabled={!instruction.trim()}>Получить diff</button>}
          {result?.kind === "diff" && <button type="button" className="kb-btn kb-btn-primary" onClick={apply} disabled={busy}>{state === "applying" ? "Применяем…" : "Применить"}</button>}
          {result && result.kind !== "diff" && result.kind !== "clarification" && <button type="button" className="kb-btn kb-btn-primary" onClick={() => { setResult(null); setError(""); setErrorCode(""); setConfirmed({}); }}>Новый запрос</button>}
        </div>
      </div>
    </div>
  </div>;
}
