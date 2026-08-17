import { useEffect, useRef, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { PAYMENT_OPTIONS, ROLE_OPTIONS, SPECIALIZATION_OPTIONS, SOFTWARE_OPTIONS } from "../constants.js";
import { useOutsideClose } from "../hooks.js";
import { SuggestInput } from "./SuggestInput.jsx";

const RATE_UNIT = { fix_task: "₽/ед.", hourly: "₽/час", shift: "₽/смену" };
const PAYMENT_SELECT = [{ key: null, label: "Не выбран" }, ...PAYMENT_OPTIONS];

function SelectField({ value, options, onChange, placeholder = "Выбрать…" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useOutsideClose(wrapRef, () => setOpen(false));
  const current = options.find((o) => (o.key ?? null) === (value ?? null));
  return <div className="kb-performer-selectfield" ref={wrapRef}>
    <button type="button" className="kb-performer-select" onClick={() => setOpen((v) => !v)}>
      <span className={current ? "" : "kb-performer-select-empty"}>{current ? current.label : placeholder}</span>
      <ChevronDown size={14} className="kb-performer-select-caret" />
    </button>
    {open && <div className="kb-suggest kb-performer-select-suggest">
      {options.map((o) => <div key={o.key ?? "__empty__"} className={"kb-suggest-item" + ((o.key ?? null) === (value ?? null) ? " kb-suggest-item-active" : "")} onMouseDown={() => { onChange(o.key ?? null); setOpen(false); }}>{o.label}</div>)}
    </div>}
  </div>;
}

function ChipListEditor({ values, dictionary, onChange, placeholder = "Добавить…" }) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const skipCommitRef = useRef(false);
  useOutsideClose(wrapRef, () => setOpen(false));
  const list = values || [];
  const matches = dictionary.filter((t) => t.toLowerCase().includes(input.trim().toLowerCase()) && !list.includes(t)).slice(0, 7);
  const commit = () => {
    if (skipCommitRef.current) { skipCommitRef.current = false; setOpen(false); return; }
    const value = input.trim();
    setInput("");
    setOpen(false);
    if (value && !list.includes(value)) onChange([...list, value]);
  };
  const pick = (value) => { skipCommitRef.current = true; setInput(""); setOpen(false); if (!list.includes(value)) onChange([...list, value]); };
  const removeAt = (index) => onChange(list.filter((_, i) => i !== index));
  const toggle = () => { if (!open) inputRef.current?.focus(); setOpen(!open); };
  return <div className="kb-performer-chips" ref={wrapRef}>
    {list.map((value, index) => <span key={`${value}-${index}`} className="kb-performer-chip"><span>{value}</span>
      <button type="button" className="kb-performer-chip-del" onClick={() => removeAt(index)} title="Убрать"><X size={11} /></button></span>)}
    <input ref={inputRef} className="kb-performer-chip-input" value={input} placeholder={placeholder}
      onChange={(e) => { setInput(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Backspace" && !input && list.length) removeAt(list.length - 1); }} />
    <button type="button" className="kb-performer-chip-caret" title="Показать варианты" onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
      <ChevronDown size={14} className={"kb-chevron" + (open ? " kb-chevron-open" : "")} />
    </button>
    {open && matches.length > 0 && <div className="kb-suggest kb-performer-chip-suggest">
      {matches.map((m) => <div key={m} className="kb-suggest-item" onMouseDown={() => pick(m)}>{m}</div>)}
    </div>}
  </div>;
}

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
        <label className="wide">Основная роль<SuggestInput value={draft.primaryRole || ""} onChange={(v) => set("primaryRole", v)} dictionary={ROLE_OPTIONS} placeholder="Выбрать или ввести…" /></label>
        <label>Дополнительные роли<ChipListEditor values={draft.additionalRoles} dictionary={ROLE_OPTIONS} onChange={(v) => set("additionalRoles", v)} /></label>
        <label>Специализации<ChipListEditor values={draft.specializations} dictionary={SPECIALIZATION_OPTIONS} onChange={(v) => set("specializations", v)} /></label>
        <label>Грейд<input value={draft.grade || ""} onChange={(e) => set("grade", e.target.value)} /></label>
        <label>Софт<ChipListEditor values={draft.software} dictionary={SOFTWARE_OPTIONS} onChange={(v) => set("software", v)} /></label>
      </div></section>
      <section><h3>Финансы</h3><div className="kb-form-grid">
        <label className="wide">Тип оплаты<SelectField value={draft.defaultPaymentType} options={PAYMENT_SELECT} onChange={(v) => set("defaultPaymentType", v)} /></label>
        <label>Ставка<span className="kb-performer-ratefield"><input type="number" value={draft.defaultRate ?? ""} onChange={(e) => set("defaultRate", e.target.value)} />{RATE_UNIT[draft.defaultPaymentType] && <span className="kb-performer-rateunit">{RATE_UNIT[draft.defaultPaymentType]}</span>}</span></label>
        <label>Налог, %<input type="number" value={draft.defaultTaxRate ?? ""} onChange={(e) => set("defaultTaxRate", e.target.value)} /></label>
      </div></section>
      <section><h3>Контакты</h3><div className="kb-form-grid"><label>Телефон<input value={draft.phone || ""} onChange={(e) => set("phone", e.target.value)} /></label><label>Email<input type="email" value={draft.email || ""} onChange={(e) => set("email", e.target.value)} /></label><label className="wide">Telegram<input value={draft.telegram || ""} onChange={(e) => set("telegram", e.target.value)} /></label></div></section>
      <section><h3>Дополнительно</h3><label>Комментарий<textarea value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} /></label></section>
    </div>
    <footer><label className="kb-performer-quick-check"><input type="checkbox" checked={addToQuickAccess} onChange={(e) => setAddToQuickAccess(e.target.checked)} /> Добавить в быстрый доступ</label><span className="kb-spacer" /><button className="kb-btn kb-btn-ghost" onClick={close}>Отмена</button><button className="kb-btn kb-btn-primary" onClick={() => onSave(draft, addToQuickAccess)}>Сохранить</button></footer>
  </div></div>;
}
