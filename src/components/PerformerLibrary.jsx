import { useEffect, useRef, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { GRADE_OPTIONS, PAYMENT_OPTIONS, SOFTWARE_OPTIONS } from "../constants.js";
import { STUDIO_ROLES, isStudioRole } from "../cgTaskRoleTaxonomy.js";
import { useOutsideClose } from "../hooks.js";

const RATE_UNIT = { fix_task: "₽/ед.", hourly: "₽/час", shift: "₽/смену" };
const PAYMENT_SELECT = [{ key: null, label: "Не выбран" }, ...PAYMENT_OPTIONS];
/* Сортировка — только для отображения в UI. Сам массив STUDIO_ROLES в
   src/cgTaskRoleTaxonomy.js менять нельзя: его порядок задаёт приоритет
   автоподбора ролей и порядок сквозных ролей. */
const SORTED_ROLE_OPTIONS = [...STUDIO_ROLES].sort((a, b) => a.localeCompare(b, "ru"));

/* Плавная прокрутка дропдаунов: один «тик» колеса мыши прокручивает список
   ровно на один пункт (высота .kb-suggest-item) независимо от величины дельты,
   а само событие изолируется внутри списка, чтобы не скроллить модалку под ним. */
function smoothListRef(node) {
  if (!node || node.__kbSmoothWheel) return;
  const onWheel = (event) => {
    const el = event.currentTarget;
    if (event.ctrlKey || event.metaKey || el.scrollHeight <= el.clientHeight + 1) return;
    event.preventDefault();
    const item = el.querySelector(".kb-suggest-item");
    const step = item ? item.offsetHeight : 24;
    el.scrollTop += Math.sign(event.deltaY) * step;
  };
  node.__kbSmoothWheel = onWheel;
  node.addEventListener("wheel", onWheel, { passive: false });
}

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
    {open && <div className="kb-suggest kb-performer-select-suggest" ref={smoothListRef}>
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
  const matches = dictionary.filter((t) => t.toLowerCase().includes(input.trim().toLowerCase()) && !list.includes(t));
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
    {list.map((value, index) => <span key={`${value}-${index}`} className={`kb-performer-chip${index === 0 ? " kb-performer-chip-key" : ""}`}><span>{value}</span>
      <button type="button" className="kb-performer-chip-del" onClick={() => removeAt(index)} title="Убрать"><X size={11} /></button></span>)}
    <input ref={inputRef} className="kb-performer-chip-input" value={input} placeholder={placeholder}
      onChange={(e) => { setInput(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Backspace" && !input && list.length) removeAt(list.length - 1); }} />
    <button type="button" className="kb-performer-chip-caret" title="Показать варианты" onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
      <ChevronDown size={14} className={"kb-chevron" + (open ? " kb-chevron-open" : "")} />
    </button>
    {open && matches.length > 0 && <div className="kb-suggest kb-performer-chip-suggest" ref={smoothListRef}>
      {matches.map((m) => <div key={m} className="kb-suggest-item" onMouseDown={() => pick(m)}>{m}</div>)}
    </div>}
  </div>;
}

/* Комбобокс «Основная роль»: текстовое поле видно всегда, пользователь может
   печатать роль свободно (кастомный текст сохраняется как есть), а стрелка
   справа открывает список STUDIO_ROLES — выбор из списка заменяет текст в поле.
   При потере фокуса с неканонической ролью показывается предупреждение. */
function RoleCombobox({ value, onChange, onWarn, placeholder = "Введите роль…" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  useOutsideClose(wrapRef, () => setOpen(false));
  const query = (value || "").trim().toLocaleLowerCase("ru-RU");
  const matches = SORTED_ROLE_OPTIONS.filter((role) => role.toLocaleLowerCase("ru-RU").includes(query));
  const warnIfCustom = () => {
    const current = (valueRef.current || "").trim();
    if (current && !isStudioRole(current)) onWarn?.();
  };
  return <div className="kb-performer-selectfield kb-role-combobox" ref={wrapRef}>
    <input ref={inputRef} className="kb-role-combobox-input" value={value || ""} placeholder={placeholder}
      onChange={(e) => { setOpen(true); onChange(e.target.value); }} onFocus={() => setOpen(true)} onBlur={warnIfCustom}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setOpen(false); }} />
    <button type="button" className="kb-performer-chip-caret kb-role-combobox-caret" title="Выбрать роль из списка"
      onMouseDown={(e) => e.preventDefault()} onClick={() => { inputRef.current?.focus(); setOpen((v) => !v); }}>
      <ChevronDown size={14} className={"kb-chevron" + (open ? " kb-chevron-open" : "")} />
    </button>
    {open && matches.length > 0 && <div className="kb-suggest kb-performer-select-suggest kb-role-combobox-suggest" ref={smoothListRef}>
      {matches.map((role) => <div key={role} className={"kb-suggest-item" + (role === value ? " kb-suggest-item-active" : "")} onMouseDown={(e) => { e.preventDefault(); onChange(role); setOpen(false); }}>{role}</div>)}
    </div>}
  </div>;
}

export function PerformerModal({ initial, isNew = false, initialAddToQuickAccess = true, onSave, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [addToQuickAccess, setAddToQuickAccess] = useState(initialAddToQuickAccess);
  const [roleWarning, setRoleWarning] = useState(false);
  useEffect(() => { setDraft(initial); setAddToQuickAccess(initialAddToQuickAccess); }, [initial, initialAddToQuickAccess]);
  if (!draft) return null;
  const set = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || addToQuickAccess !== initialAddToQuickAccess;
  const close = () => { if (!dirty || window.confirm("Закрыть карточку без сохранения изменений?")) onClose(); };
  return <><div className="kb-performer-modal-backdrop" onMouseDown={close}><div className="kb-performer-modal" onMouseDown={(e) => e.stopPropagation()}>
    <header><div><strong>{isNew ? "Новый исполнитель" : "Карточка исполнителя"}</strong><small>Отдельная карточка базы — условия сметы останутся независимыми</small></div><button className="kb-icon-btn" onClick={close} title="Закрыть"><X size={16} /></button></header>
    <div className="kb-performer-form">
      <section><h3>Основное</h3><div className="kb-form-grid">
        <label>Имя<input value={draft.firstName || ""} onChange={(e) => set("firstName", e.target.value)} /></label><label>Фамилия<input value={draft.lastName || ""} onChange={(e) => set("lastName", e.target.value)} /></label>
        <label className="wide">Основная роль<RoleCombobox value={draft.primaryRole || ""} onChange={(v) => set("primaryRole", v)} onWarn={() => setRoleWarning(true)} placeholder="Введите роль или выберите из списка…" /></label>
        <label>Дополнительные роли<ChipListEditor values={draft.additionalRoles} dictionary={SORTED_ROLE_OPTIONS.filter((role) => role !== draft.primaryRole)} onChange={(v) => { const added = v.filter((role) => !(draft.additionalRoles || []).includes(role)); set("additionalRoles", v); if (added.some((role) => !isStudioRole(role))) setRoleWarning(true); }} /></label>
        <label>Грейд<SelectField value={draft.grade} options={[{ key: null, label: "Не выбран" }, ...GRADE_OPTIONS.map((grade) => ({ key: grade, label: grade }))]} onChange={(v) => set("grade", v)} /></label>
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
  </div></div>
  {roleWarning && <div className="kb-modal-overlay" style={{ zIndex: 160 }} onMouseDown={() => setRoleWarning(false)}><div className="kb-modal" role="dialog" aria-modal="true" aria-labelledby="role-warning-title" onMouseDown={(e) => e.stopPropagation()}><div className="kb-modal-head"><span className="kb-modal-title" id="role-warning-title">Нестандартная роль</span><button type="button" className="kb-icon-btn" onClick={() => setRoleWarning(false)}><X size={16} /></button></div><div className="kb-modal-body"><div className="kb-modal-note">Роль не входит в словарь шаблонов студии, поэтому не будет участвовать в автоматическом подборе исполнителей по ролям задач. Чтобы роль участвовала в автоподборе, выберите её из списка.</div><div className="kb-modal-actions"><button type="button" className="kb-btn kb-btn-primary" onClick={() => setRoleWarning(false)}>Понятно</button></div></div></div></div>}
</>;
}
