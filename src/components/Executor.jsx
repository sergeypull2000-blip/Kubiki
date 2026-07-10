import { useState, useRef, useEffect } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { fmt, numVal } from "../utils.js";
import { executorSum } from "../calculations.js";
import { TAG_DEF, TAG_DEFS, PAYMENT_LABEL } from "../constants.js";
import { DND_TYPES, dndPayload, useDragSource, useDropTarget, applyTagToExecutor, makeTag } from "../store.js";
import { useOutsideClose } from "../hooks.js";
import { SuggestInput } from "./SuggestInput.jsx";

/* ============================================================
   Тег НА исполнителе (чип). Пустой → клик открывает состояния.
   Заполненный → показывает значение, можно перетащить (копия) или
   переоткрыть/очистить. Перетаскивается payload с fromExecutor:true.
   ============================================================ */
function ExecutorTag({ tag, onSetValue, onSetPayment, onRemove, isOpen, onOpenChange }) {
  const def = TAG_DEF[tag.key];
  // «открыт» ли выпадающий список состояний — состояние поднято в ExecutorRow
  // (openTagId), чтобы у соседних тегов строки не мог быть открыт список
  // одновременно: клик по пустому кубику вызывает stopPropagation() (нужен,
  // чтобы не сбрасывать выделение строки), из-за чего нативный mousedown не
  // доходит до document — соседний useOutsideClose не срабатывает и списки
  // копятся друг на друге. Единый источник isOpen решает это без опоры на
  // всплытие события.
  const open = !!isOpen;
  const setOpen = onOpenChange;
  // п.2: пустой текстовый/комбо-тег сразу открыт на ввод (без доп. клика по кубику)
  const [editing, setEditing] = useState((def.kind === "text" || def.kind === "combo" || def.kind === "tax") && !tag.value);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  // Фокус запрашиваем ТОЛЬКО когда открытие вызвано явным кликом (openStates /
  // повторное открытие заполненного тега) — НЕ когда несколько тегов одновременно
  // материализуются пустыми при создании исполнителя (см. useEffect в ExecutorRow,
  // там разом монтируются и «Имя», и «Налог» в editing=true). Раздача autoFocus
  // всем таким тегам сразу заставляет их наперегонки фокусироваться/блюриться
  // при монтировании — итог: оба поля оказываются нерабочими.
  const wantFocusRef = useRef(false);
  useEffect(() => {
    if (editing && wantFocusRef.current) {
      wantFocusRef.current = false;
      // setTimeout(0), а не сразу: тег часто открывается из mousedown-обработчика
      // (см. openStates ниже), и в этот момент браузер ещё не закончил СВОЮ
      // нативную обработку того же mousedown (перенос фокуса от ранее активного
      // поля). Если дёрнуть .focus() синхронно в эффекте, браузер следом всё
      // равно доигрывает свой отложенный шаг и тут же сбрасывает фокус обратно —
      // поле открывается, но мгновенно теряет фокус. Макротаском ждём, пока
      // нативная последовательность mousedown полностью завершится.
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [editing]);
  // слушатель регистрируем, только пока тег реально открыт/редактируется —
  // иначе клик по СОСЕДНЕМУ тегу той же строки триггерит и наш «закрыть»,
  // что гасит чужой (общий openTagId) список раньше, чем сработает клик по нему
  useOutsideClose(wrapRef, (open || editing) ? () => { setOpen(false); setEditing(false); } : null);

  const filled = def.kind === "payment" ? !!(tag.payment && tag.payment.type) : !!tag.value;

  // перенос установленного тега на другого исполнителя = копирование
  const { dragHandlers } = useDragSource(DND_TYPES.TAG, () => ({
    key: tag.key,
    value: def.kind === "payment" ? (tag.payment?.type || "") : tag.value,
    fromExecutor: true,
    ...(def.kind === "payment" && tag.payment ? { payment: { ...tag.payment } } : {}),
  }));

  const Icon = def.icon;

  // Та же защита, что и на строке исполнителя: не даём нативному DnD тега
  // перехватить выделение текста в инлайн-поле. Выключаем draggable в DOM
  // в фазе перехвата, если mousedown пришёлся на поле/кнопку внутри тега.
  const onTagMouseDownCapture = (e) => {
    if (filled && wrapRef.current)
      wrapRef.current.draggable = !e.target.closest("input, textarea, button");
  };
  const restoreTagDraggable = () => { if (wrapRef.current) wrapRef.current.draggable = true; };

  const displayValue = () => {
    if (def.kind === "payment") return tag.payment?.type ? PAYMENT_LABEL[tag.payment.type] : "";
    if (def.kind === "tax") return tag.value ? `Налог ${tag.value}%` : "";
    return tag.value;
  };

  // --- пустой тег: клик раскрывает состояния / поле ввода ---
  const openStates = () => {
    if (def.kind === "text" || def.kind === "combo" || def.kind === "tax") { wantFocusRef.current = true; setEditing(true); return; }
    setOpen(true);
  };
  // --- заполненный тег: клик переоткрывает на редактирование/список ---
  const openFilled = () => {
    if (def.kind === "select" || def.kind === "payment") { setOpen(true); return; }
    wantFocusRef.current = true; setEditing(true);
  };

  return (
    <div className={"kb-tag" + (filled ? " kb-tag-filled" : " kb-tag-empty")} ref={wrapRef}
      {...(filled ? dragHandlers : {})}
      onMouseDownCapture={onTagMouseDownCapture}
      onMouseUp={restoreTagDraggable}
      onMouseLeave={restoreTagDraggable}>
      <Icon size={11} strokeWidth={1.5} className="kb-tag-ic" />

      {/* text / combo: инлайн-ввод ТОЛЬКО в режиме редактирования.
          Заполненный тег показывается как span (его можно тащить = копировать
          на другого исполнителя). Клик по span — редактирование, тяга — перенос. */}
      {(def.kind === "text" || def.kind === "combo") && editing ? (
        def.kind === "combo" ? (
          <SuggestInput
            className="kb-tag-input"
            value={tag.value}
            dictionary={def.options}
            placeholder={def.label}
            onChange={(v) => onSetValue(v)}
            onCommit={() => setEditing(false)}
          />
        ) : (
          <input className="kb-tag-input" placeholder={def.label} value={tag.value}
            ref={inputRef}
            onChange={(e) => onSetValue(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === "Enter") setEditing(false); }} />
        )
      ) : def.kind === "tax" && editing ? (
        <span className="kb-tag-taxwrap">
          <span className="kb-tag-taxlabel">{def.label}</span>
          <input className="kb-tag-input kb-tag-taxinput" placeholder="0" value={tag.value} inputMode="numeric"
            ref={inputRef}
            onChange={(e) => onSetValue(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === "Enter") setEditing(false); }} />
          <span className="kb-tag-taxpct">%</span>
        </span>
      ) : filled ? (
        <span className="kb-tag-val" onMouseDown={(e) => { e.stopPropagation(); openFilled(); }}>
          {displayValue()}
        </span>
      ) : (
        // Открываем на mousedown, а не на click. Если в строке уже открыт
        // (сфокусирован) другой тег — клик по ЭТОЙ кнопке синхронно блюрит его
        // ДО mouseup, тот сворачивается в span и строка перестраивается под
        // курсором; к моменту mouseup/click браузер бьёт уже мимо кнопки (в
        // соседний div), и click не долетает вовсе (preventDefault на mousedown
        // это не лечит — блюр соседнего поля происходит независимо). На
        // mousedown же элемент-цель определён гарантированно верно, до сдвига
        // раскладки — поэтому именно здесь и переключаем editing.
        <button type="button" className="kb-tag-placeholder"
          onMouseDown={(e) => { e.stopPropagation(); openStates(); }}>
          {def.label}
        </button>
      )}

      {filled && (
        <button type="button" className="kb-tag-x" onClick={onRemove} title="Убрать тег">
          <X size={10} strokeWidth={2} />
        </button>
      )}

      {/* select / payment: выпадающий список состояний */}
      {open && (def.kind === "select" || def.kind === "payment") && (
        <div className="kb-suggest kb-suggest-tagstates">
          {(def.options || []).map((opt) => {
            const value = def.kind === "payment" ? opt.key : opt;
            const label = def.kind === "payment" ? opt.label : opt;
            return (
              <div key={value} className="kb-suggest-item"
                onClick={() => {
                  if (def.kind === "payment") onSetPayment({ type: value, rate: "", hours: "", shifts: "" });
                  else onSetValue(value);
                  setOpen(false);
                }}>
                {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- поля расчёта тега оплаты (почасовая/посменная) ----------
   Рендерятся справа от тегов, на той же строке. Компактно: без длинных
   лейблов, единицы — в плейсхолдере/подписи. Клик не сбрасывает выделение. */
function PaymentInlineFields({ payment, onSetPayment }) {
  if (!payment || !payment.type) return null;
  const stop = (e) => e.stopPropagation();
  const cfg = payment.type === "hourly"
    ? { rateUnit: "₽/час", qtyKey: "hours", qtyUnit: "ч" }
    : payment.type === "shift"
      ? { rateUnit: "₽/смену", qtyKey: "shifts", qtyUnit: "смен" }
      : null;
  if (!cfg) return null;
  return (
    <span className="kb-payinline" onMouseDown={stop}>
      <input className="kb-input kb-input-num" value={payment.rate} placeholder="ставка"
        title={"Ставка " + cfg.rateUnit} onChange={(e) => onSetPayment({ rate: e.target.value })} />
      <span className="kb-payinline-unit">{cfg.rateUnit}</span>
      <span className="kb-payinline-x">×</span>
      <input className="kb-input kb-input-num" value={payment[cfg.qtyKey]} placeholder={cfg.qtyUnit}
        onChange={(e) => onSetPayment({ [cfg.qtyKey]: e.target.value })} />
    </span>
  );
}

/* ============================================================
   Кнопка «+» на строке исполнителя — выпадающий список кубиков
   исполнителя прямо на месте (как «Добавить стикер» в YouGile).
   Клик по типу добавляет пустой тег; заполняется он уже инлайн.
   ============================================================ */
function AddCubeButton({ onAddCube, usedKeys = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));
  const available = TAG_DEFS.filter((d) => !usedKeys.includes(d.key));
  if (available.length === 0) return null;
  return (
    <span className="kb-addcube" ref={ref}>
      <button type="button" className="kb-addcube-btn" title="Добавить кубик исполнителя"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}>
        <Plus size={13} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="kb-suggest kb-addcube-menu" onMouseDown={(e) => e.stopPropagation()}>
          <div className="kb-addcube-title">Добавить кубик</div>
          {available.map((def) => {
            const Icon = def.icon;
            return (
              <div key={def.key} className="kb-suggest-item kb-addcube-item"
                onClick={() => { onAddCube({ key: def.key, value: "" }); setOpen(false); }}>
                <Icon size={14} strokeWidth={1.5} />
                <span>{def.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}

/* ============================================================
   Строка исполнителя
   ============================================================ */
export function ExecutorRow({ executor, active, flash, stageId, taskId, onActivate, onPatch, onRemove }) {
  const sum = executorSum(executor);
  const payTag = executor.tags.find((t) => t.key === "payment");
  const payType = payTag?.payment?.type;
  const isFix = payType === "fix_total" || payType === "fix_task";
  const isRateBased = payType === "hourly" || payType === "shift";
  const hasPay = !!payType;
  const taxTag = executor.tags.find((t) => t.key === "tax");
  const taxPct = taxTag ? numVal(taxTag.value) : 0;
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef(null);
  // id тега, чей выпадающий список состояний сейчас открыт (один на строку) —
  // не даёт кубикам открываться «толпой» друг поверх друга
  const [openTagId, setOpenTagId] = useState(null);

  // п.1: свежий исполнитель (без тегов) появляется со ВСЕМИ кубиками-слотами,
  // чтобы сразу заполнять нужные без нажатия «+». При снятии выделения пустые
  // слоты отбрасываются — остаются только заполненные. При повторном выделении
  // показываем заполненные + «+» со списком неиспользованных кубиков.
  const isTagFilled = (t) => (t.key === "payment" ? !!t.payment?.type : !!(t.value && String(t.value).trim()));
  const [expanded, setExpanded] = useState(executor.tags.length === 0);
  const prevActive = useRef(active);

  // разворот: до-материализовать недостающие кубики как пустые слоты.
  // Только для ПОЛНОСТЬЮ пустого исполнителя (0 тегов) — импортированный
  // (уже есть кубик оплаты) не трогаем, чтобы не появлялся пустой «имя».
  useEffect(() => {
    if (!(active && expanded) || executor.tags.length !== 0) return;
    const merged = TAG_DEFS.map((d) => makeTag(d.key));
    onPatch({ tags: merged });
  }, [active, expanded, executor.tags]);

  // снятие выделения: схлопнуть и отбросить пустые слоты
  useEffect(() => {
    if (prevActive.current && !active) {
      setExpanded(false);
      const filled = executor.tags.filter(isTagFilled);
      if (filled.length !== executor.tags.length) onPatch({ tags: filled });
    }
    prevActive.current = active;
  }, [active]);

  const usedKeys = executor.tags.map((t) => t.key);

  const setTags = (fn) => onPatch({ tags: fn(executor.tags) });

  const { isOver, dropHandlers } = useDropTarget(DND_TYPES.TAG, (payload) => {
    setTags((tags) => applyTagToExecutor(tags, payload));
    onActivate();
  });

  const setTagValue = (tagId, value) =>
    setTags((tags) => tags.map((t) => (t.id === tagId ? { ...t, value } : t)));
  const setTagPayment = (tagId, patch) =>
    setTags((tags) => tags.map((t) => (t.id === tagId ? { ...t, payment: { ...(t.payment || {}), ...patch } } : t)));
  const removeTag = (tagId) => {
    // ручное удаление кубика посреди активной сессии редактирования должно
    // сразу возвращать кнопку «+» (иначе при expanded=true она скрыта и
    // удалённый кубик нечем добавить обратно, пока строка не потеряет фокус)
    setExpanded(false);
    setTags((tags) => tags.filter((t) => t.id !== tagId));
  };

  // Перетаскивание всей строки. Не стартуем drag, если тянут за интерактив
  // (поле/кнопка/тег/кубик) — чтобы ввод и клики работали как раньше.
  const onRowDragStart = (e) => {
    if (e.target.closest("input, textarea, select, button, .kb-tag, .kb-addcube")) {
      e.preventDefault();
      return;
    }
    dndPayload.current = { type: DND_TYPES.EXECUTOR, payload: { moveExecutorId: executor.id } };
    e.dataTransfer.setData(DND_TYPES.EXECUTOR, "1");
    e.dataTransfer.setData("text/plain", "kubiki");
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  };
  const onRowDragEnd = () => { dndPayload.current = null; setDragging(false); restoreRowDraggable(); };

  // Защита ввода/выделения текста от перехвата нативным DnD строки.
  // Ловим mousedown в фазе ПЕРЕХВАТА (до дочерних обработчиков со stopPropagation)
  // и, если жмут по интерактиву, выключаем draggable прямо в DOM. Между mousedown
  // и dragstart нет ре-рендера — так надёжнее, чем через React-стейт.
  const INTERACTIVE_SEL = "input, textarea, select, button, .kb-tag, .kb-addcube, .kb-payinline";
  const onRowMouseDownCapture = (e) => {
    if (rowRef.current) rowRef.current.draggable = !e.target.closest(INTERACTIVE_SEL);
  };
  const restoreRowDraggable = () => { if (rowRef.current) rowRef.current.draggable = true; };

  const cls = "kb-erow-group"
    + (isOver ? " kb-erow-group-over" : "")
    + (active ? " kb-erow-group-active" : "")
    + (flash ? " kb-erow-flash" : "")
    + (dragging ? " kb-erow-dragging" : "");

  return (
    <div ref={rowRef} className={cls}
      draggable
      onDragStart={onRowDragStart}
      onDragEnd={onRowDragEnd}
      onMouseDownCapture={onRowMouseDownCapture}
      onMouseUp={restoreRowDraggable}
      onMouseLeave={restoreRowDraggable}
      onMouseDown={(e) => { e.stopPropagation(); onActivate(); }}
      {...dropHandlers}>
      <div className="kb-erow">
        <div className="kb-erow-tags">
          {executor.tags.map((t) => (
            <ExecutorTag key={t.id} tag={t}
              isOpen={openTagId === t.id}
              onOpenChange={(v) => setOpenTagId(v ? t.id : null)}
              onSetValue={(v) => setTagValue(t.id, v)}
              onSetPayment={(patch) => setTagPayment(t.id, patch)}
              onRemove={() => removeTag(t.id)} />
          ))}

          {/* поля почасовой/посменной — сразу справа от тегов, на той же строке (п.4) */}
          {isRateBased && payTag && (
            <PaymentInlineFields payment={payTag.payment}
              onSetPayment={(patch) => setTagPayment(payTag.id, patch)} />
          )}

          {/* «+» — только когда не развёрнуты все слоты; список неиспользованных (п.1) */}
          {!expanded && (
            <AddCubeButton usedKeys={usedKeys}
              onAddCube={(payload) => { setTags((tags) => applyTagToExecutor(tags, payload)); onActivate(); }} />
          )}
        </div>

        <div className="kb-erow-amount">
          {isFix ? (
            <>
              <input className="kb-input kb-input-num kb-amount-input" value={executor.amount} placeholder="0"
                onChange={(e) => onPatch({ amount: e.target.value })} onMouseDown={(e) => e.stopPropagation()} />
              {taxPct > 0 && <span className="kb-erow-sum kb-erow-sum-strong kb-erow-taxed" title="Сумма с налогом">{fmt(sum)} ₽</span>}
            </>
          ) : (
            <span className={"kb-erow-sum" + (hasPay ? " kb-erow-sum-strong" : " kb-erow-sum-muted")}>{fmt(sum)} ₽</span>
          )}
        </div>

        <button type="button" className="kb-icon-btn kb-erow-del" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Удалить исполнителя">
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
