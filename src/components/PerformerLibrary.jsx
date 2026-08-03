import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PAYMENT_OPTIONS, ROLE_OPTIONS } from "../constants.js";

const csv = (value) => (value || []).join(", ");
const split = (value) => value.split(",").map((part) => part.trim()).filter(Boolean);

export function PerformerModal({ initial, isNew = false, initialAddToQuickAccess = true, onSave, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [addToQuickAccess, setAddToQuickAccess] = useState(initialAddToQuickAccess);
  useEffect(() => { setDraft(initial); setAddToQuickAccess(initialAddToQuickAccess); }, [initial, initialAddToQuickAccess]);
  if (!draft) return null;
  const set = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || addToQuickAccess !== initialAddToQuickAccess;
  const close = () => { if (!dirty || window.confirm("Закрыть карточку без сохранения изменений?")) onClose(); };
  return <div className="kb-performer-modal-backdrop" onMouseDown={close}><div className="kb-performer-modal" onMouseDown={(e) => e.stopPropagation()}>
    <header><div><strong>{isNew ? "Новый исполнитель" : "Карточка исполнителя"}</strong><small>Отдельная карточка базы — условия сметы останутся независимыми</small></div><button className="kb-icon-btn" onClick={close} title="Закрыть"><X size={16} /></button></header>
    <div className="kb-performer-form">
      <section><h3>Основное</h3><div className="kb-form-grid">
        <label>Имя<input value={draft.firstName || ""} onChange={(e) => set("firstName", e.target.value)} /></label><label>Фамилия<input value={draft.lastName || ""} onChange={(e) => set("lastName", e.target.value)} /></label>
        <label className="wide">Основная роль<input list="kb-roles" value={draft.primaryRole || ""} onChange={(e) => set("primaryRole", e.target.value)} /><datalist id="kb-roles">{ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}</datalist></label>
        <label className="wide">Дополнительные роли<input value={csv(draft.additionalRoles)} onChange={(e) => set("additionalRoles", split(e.target.value))} placeholder="Через запятую" /></label>
        <label className="wide">Специализации<input value={csv(draft.specializations)} onChange={(e) => set("specializations", split(e.target.value))} /></label><label>Грейд<input value={draft.grade || ""} onChange={(e) => set("grade", e.target.value)} /></label><label>Софт<input value={csv(draft.software)} onChange={(e) => set("software", split(e.target.value))} /></label>
      </div></section>
      <section><h3>Финансы по умолчанию</h3><div className="kb-form-grid"><label>Юридический статус<input value={draft.legalStatus || ""} onChange={(e) => set("legalStatus", e.target.value)} /></label><label>Тип оплаты<select value={draft.defaultPaymentType || ""} onChange={(e) => set("defaultPaymentType", e.target.value || null)}><option value="">Не выбран</option>{PAYMENT_OPTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label><label>Ставка<input type="number" value={draft.defaultRate ?? ""} onChange={(e) => set("defaultRate", e.target.value)} /></label><label>Единица<input value={draft.defaultUnit || ""} onChange={(e) => set("defaultUnit", e.target.value)} /></label><label>Налог, %<input type="number" value={draft.defaultTaxRate ?? ""} onChange={(e) => set("defaultTaxRate", e.target.value)} /></label><label>Комиссия, %<input type="number" value={draft.defaultCommission ?? ""} onChange={(e) => set("defaultCommission", e.target.value)} /></label></div></section>
      <section><h3>Контакты</h3><div className="kb-form-grid"><label>Телефон<input value={draft.phone || ""} onChange={(e) => set("phone", e.target.value)} /></label><label>Email<input type="email" value={draft.email || ""} onChange={(e) => set("email", e.target.value)} /></label><label className="wide">Telegram<input value={draft.telegram || ""} onChange={(e) => set("telegram", e.target.value)} /></label></div></section>
      <section><h3>Дополнительно</h3><label>Комментарий<textarea value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} /></label></section>
    </div>
    <footer><label className="kb-performer-quick-check"><input type="checkbox" checked={addToQuickAccess} onChange={(e) => setAddToQuickAccess(e.target.checked)} /> Добавить в быстрый доступ</label><span className="kb-spacer" /><button className="kb-btn kb-btn-ghost" onClick={close}>Отмена</button><button className="kb-btn kb-btn-primary" onClick={() => onSave(draft, addToQuickAccess)}>Сохранить</button></footer>
  </div></div>;
}
