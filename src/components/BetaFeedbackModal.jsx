import { useState } from "react";
import { X } from "lucide-react";
import { betaFeedbackRepository } from "../repositories/betaFeedbackRepository.js";

/* Компактное окно бета-фидбэка: textarea + Отмена/Отправить + success-состояние.
   Запись идёт в beta_feedback (RLS: только INSERT собственного фидбэка). */
export function BetaFeedbackModal({ userId, context, onClose }) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  const send = async () => {
    const text = message.trim();
    if (!text || state === "sending") return;
    setState("sending");
    setError("");
    try {
      await betaFeedbackRepository.insert({
        userId,
        message: text,
        context: context?.context || null,
        projectId: context?.projectId || null,
        sheetId: context?.sheetId || null,
      });
      setState("sent");
    } catch (insertError) {
      setState("idle");
      setError(insertError.message || "Не удалось отправить отзыв. Попробуйте ещё раз.");
    }
  };

  if (state === "sent") {
    return (
      <div className="kb-modal-overlay" onMouseDown={onClose}>
        <div className="kb-modal kb-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="kb-modal-head">
            <span className="kb-modal-title" id="feedback-title">Обратная связь</span>
            <button type="button" className="kb-icon-btn" aria-label="Закрыть" onClick={onClose}><X size={16} /></button>
          </div>
          <div className="kb-modal-body">
            <div className="kb-feedback-success">Спасибо! Отзыв отправлен.</div>
            <div className="kb-modal-actions">
              <button type="button" className="kb-btn kb-btn-primary" onClick={onClose}>Закрыть</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kb-modal-overlay" onMouseDown={onClose}>
      <div className="kb-modal kb-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="kb-modal-head">
          <span className="kb-modal-title" id="feedback-title">Обратная связь</span>
          <button type="button" className="kb-icon-btn" aria-label="Закрыть" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="kb-modal-body">
          <p className="kb-feedback-hint">Расскажите, что было неудобно, что сломалось или чего вам не хватило — команда Kubiki читает каждый отзыв.</p>
          <textarea
            className="kb-feedback-textarea"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ваш отзыв"
            autoFocus
          />
          {error && <div className="kb-server-error" role="alert">{error}</div>}
          <div className="kb-modal-actions">
            <button type="button" className="kb-btn kb-btn-ghost" disabled={state === "sending"} onClick={onClose}>Отмена</button>
            <button type="button" className="kb-btn kb-btn-primary" disabled={!message.trim() || state === "sending"} onClick={send}>{state === "sending" ? "Отправляем…" : "Отправить"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
