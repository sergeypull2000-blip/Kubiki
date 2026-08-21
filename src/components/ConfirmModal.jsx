import { useEffect } from "react";
import { X } from "lucide-react";

export function ConfirmModal({ title, message, confirmLabel = "Удалить", onCancel, onConfirm }) {
  useEffect(() => { const onKeyDown = (event) => { if (event.key === "Escape") onCancel(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [onCancel]);
  return <div className="kb-modal-overlay" role="presentation" onMouseDown={onCancel}>
    <div className="kb-modal kb-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="kb-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head"><span className="kb-modal-title" id="kb-confirm-title">{title}</span><button type="button" className="kb-icon-btn" aria-label="Закрыть" onClick={onCancel}><X size={16} /></button></div>
      <div className="kb-modal-body"><p>{message}</p><div className="kb-modal-actions"><button type="button" className="kb-btn kb-btn-ghost" onClick={onCancel}>Отмена</button><button type="button" className="kb-btn kb-btn-primary" onClick={onConfirm}>{confirmLabel}</button></div></div>
    </div>
  </div>;
}
