import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { MAX_PERSONALIZATION_CHARS, normalizeAiSettings } from "../aiSettings.js";
import { dismissOnBackdrop, useModalDismiss } from "./modalDismiss.js";

export function AIPersonalizationModal({ settings, improvementConsent = false, state = "ready", message = "", onSave, onClose }) {
  const [draft, setDraft] = useState(() => normalizeAiSettings(settings));
  const [improve, setImprove] = useState(improvementConsent);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) { setDraft(normalizeAiSettings(settings)); setImprove(improvementConsent); }
  }, [settings, improvementConsent]);
  const saving = state === "saving";
  useModalDismiss(onClose, !saving);
  const save = async () => {
    if (await onSave(draft, improve)) dirtyRef.current = false;
  };
  return <div className="kb-modal-overlay" onMouseDown={saving ? undefined : dismissOnBackdrop(onClose)}>
    <div className="kb-modal kb-ai-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head"><span className="kb-modal-title" id="ai-settings-title">Персонализация ИИ</span><button type="button" className="kb-icon-btn" onClick={onClose} disabled={saving}><X size={16} /></button></div>
      <div className="kb-modal-body">
        <div className="kb-modal-note">Мягкие инструкции студии: как декомпозировать проекты, что учитывать, чего избегать и как называть работы. Не добавляйте налоги, маркап, валюту, формулы, контакты или секретные данные.</div>
        <textarea className="kb-input kb-ai-settings-text" rows={10} maxLength={MAX_PERSONALIZATION_CHARS} value={draft.personalization} onChange={(event) => { dirtyRef.current = true; setDraft((current) => ({ ...current, personalization: event.target.value })); }} placeholder="Например: отделять препродакшн; не дробить производство на технические микрозадачи…" />
        <div className="kb-ai-settings-count">{draft.personalization.length} / {MAX_PERSONALIZATION_CHARS}</div>
        <label className="kb-ai-history-option"><input type="checkbox" checked={draft.useStudioTemplates} onChange={(event) => { dirtyRef.current = true; setDraft((current) => ({ ...current, useStudioTemplates: event.target.checked })); }} /><span><strong>Использовать шаблоны студии</strong><small>Учитывать выбранные шаблоны проектов, этапов и задач при генерации. По умолчанию включено.</small></span></label>
        <label className="kb-ai-history-option"><input type="checkbox" checked={draft.useProjectHistory} onChange={(event) => { dirtyRef.current = true; setDraft((current) => ({ ...current, useProjectHistory: event.target.checked })); }} /><span><strong>Использовать историю проектов</strong><small>Только ограниченный обезличенный shortlist прошлых проектов. По умолчанию выключено.</small></span></label>
        <label className="kb-ai-history-option"><input type="checkbox" checked={improve} onChange={(event) => { dirtyRef.current = true; setImprove(event.target.checked); }} /><span><strong>Помогать делать сметы точнее</strong><small>Разрешить Kubiki учитывать, как вы исправляете ИИ-результаты, чтобы улучшать качество будущих генераций.</small><small>Не влияет на доступ к ИИ-функциям. · <a href="/ai-improvement-consent" target="_blank" rel="noreferrer">Подробнее</a></small></span></label>
        {message && <div className={state === "error" || state === "save-error" ? "kb-server-error" : "kb-modal-note"}>{message}</div>}
        <div className="kb-modal-actions"><button type="button" className="kb-btn kb-btn-ghost" onClick={onClose} disabled={saving}>Отмена</button><button type="button" className="kb-btn kb-btn-primary" onClick={save} disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button></div>
      </div>
    </div>
  </div>;
}
