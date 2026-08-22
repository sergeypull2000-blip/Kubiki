import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usageRepository } from "../backend/runtimeRepositories.js";

/* «Использование ИИ» — только оставшийся процент лимита и дата сброса.
   Технические метрики (доллары, токены, число вызовов) намеренно скрыты. */
export function UsageLimitsModal({ onClose }) {
  const [state, setState] = useState("loading");
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await usageRepository.load();
        const unlimited = Boolean(body?.unlimited);
        const remainingPct = unlimited ? 100 : Number(body?.remainingPct);
        if (!Number.isFinite(remainingPct)) throw new Error("Не удалось загрузить использование ИИ");
        if (cancelled) return;
        setSummary({
          unlimited,
          remainingPct: Math.max(0, Math.min(100, Math.round(remainingPct))),
          resetsAt: body?.resetsAt || null,
          cycleActive: Boolean(body?.cycleActive),
          overLimit: unlimited ? false : Boolean(body?.overLimit),
        });
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setMessage(error.message || "Не удалось загрузить использование ИИ");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resetLabel = summary?.resetsAt
    ? new Date(summary.resetsAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return <div className="kb-modal-overlay" onMouseDown={onClose}>
    <div className="kb-modal kb-usage-modal" role="dialog" aria-modal="true" aria-labelledby="usage-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head"><span className="kb-modal-title" id="usage-title">Использование ИИ</span><button type="button" className="kb-icon-btn" onClick={onClose}><X size={16} /></button></div>
      <div className="kb-modal-body">
        {state === "loading" && <div className="kb-modal-note">Загружаем…</div>}
        {state === "error" && <div className="kb-server-error" role="alert">{message}</div>}
        {state === "ready" && summary && <>
          {summary.unlimited ? (
            <div className="kb-usage-figures"><strong>Без ограничений</strong></div>
          ) : (
            <>
              <div className="kb-usage-bar" role="img" aria-label={`Осталось ${summary.remainingPct}% лимита ИИ`}>
                <div className="kb-usage-bar-fill" style={{ width: `${summary.remainingPct}%` }} />
              </div>
              <div className="kb-usage-figures">
                <strong>{summary.remainingPct}% осталось</strong>
                {resetLabel && <span>Сброс лимита: {resetLabel}</span>}
                {!summary.cycleActive && <span>Период начнётся после первого успешного ИИ-запроса</span>}
              </div>
              {summary.overLimit && <div className="kb-usage-limit-note">Лимит исчерпан — новые ИИ-запросы временно недоступны до сброса.</div>}
            </>
          )}
        </>}
        <div className="kb-modal-actions"><button type="button" className="kb-btn kb-btn-primary" onClick={onClose}>Закрыть</button></div>
      </div>
    </div>
  </div>;
}
