import { useState, useRef } from "react";
import { useOutsideClose } from "../hooks.js";

/* ============================================================
   Автоподсказка (для названия задачи и для «Специализации»)
   ============================================================ */
export function SuggestInput({ value, onChange, onCommit, dictionary, featured, placeholder, className, autoFocus }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const typing = value.trim().length > 0;
  const matches = typing
    ? dictionary.filter((t) => t.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 7)
    // пустое поле: если у этапа заданы featured — показываем только их, иначе весь словарь
    : (featured && featured.length ? featured : dictionary).slice(0, 7);
  useOutsideClose(wrapRef, () => setOpen(false));
  return (
    <div className="kb-autocomplete" ref={wrapRef}>
      <input
        className={className || "kb-input"}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter") { setOpen(false); onCommit && onCommit(value); } }}
        onBlur={() => onCommit && onCommit(value)}
      />
      {open && matches.length > 0 && (
        <div className="kb-suggest">
          {matches.map((m) => (
            <div key={m} className="kb-suggest-item"
              onMouseDown={() => { onChange(m); onCommit && onCommit(m); setOpen(false); }}>
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
