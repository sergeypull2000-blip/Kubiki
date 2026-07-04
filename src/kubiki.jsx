import React, { useState, useRef, useEffect } from "react";
import {
  Plus, Trash2, X, ChevronDown, ChevronUp, GripVertical,
  Layers, Box, Cpu, Film, Sparkles, Square,
  ArrowLeft, User, ListTodo, Type, Briefcase, Palette,
  BadgeCheck, Monitor, Wallet,
} from "lucide-react";

/* ============================================================
   KUBIKI — умная смета для CG-производства (прототип)
   Себестоимость проекта. Наценка/клиентская смета — заглушка.

   Модель исполнителя — набор ТЕГОВ («кубиков исполнителя»), а не
   фиксированные поля. Тег может быть пустым (без состояния) или
   заполненным. Один тег «Кубик оплаты» несёт расчёт суммы строки.

   Drag-and-drop — нативный HTML5 API, слой вынесен и помечен ниже,
   чтобы его было легко заменить на dnd-kit при переносе.
   ============================================================ */

/* ---------- helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);

const fmt = (n) => {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return v.toLocaleString("ru-RU").replace(/,/g, " ");
};

const numVal = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/* ---------- этапы ---------- */
const STAGE_PRESETS = [
  { key: "preprod", name: "Препродакшн", icon: Sparkles },
  { key: "prod", name: "Продакшн", icon: Box },
  { key: "render3d", name: "3D-рендер", icon: Cpu },
  { key: "comp", name: "Композитинг", icon: Layers },
  { key: "finalrender", name: "Финальный рендер", icon: Film },
];
const CUSTOM_STAGE = { key: "custom", name: "Пустой этап", icon: Square };

/* ---------- словари состояний тегов ---------- */
const ROLE_OPTIONS = [
  "Продюсер", "Арт-директор", "Супервайзер", "Режиссёр",
  "Проджект-менеджер", "Аккаунт-менеджер", "Продакшн-директор", "Креативный директор",
  "3D артист", "2D моушн-дизайнер", "Графический дизайнер",
];

const SPECIALIZATION_OPTIONS = [
  "Моделлер", "Текстурщик", "Риггер", "Аниматор", "FX / симуляции", "Гудинщик",
  "Композер", "Моушн-дизайнер", "Кеер", "Трекер", "Колорист", "Дженералист",
  "Саунд-дизайнер", "3D артист", "Композитор",
];

const GRADE_OPTIONS = ["Джун", "Джун+", "Мидл", "Мидл+", "Сениор", "Тим-лид"];

const SOFTWARE_OPTIONS = [
  "Blender", "Houdini", "Cinema 4D", "Maya", "ZBrush", "Substance Painter",
  "Nuke", "After Effects", "DaVinci Resolve", "Unreal Engine", "Photoshop", "Premiere Pro",
];

const PAYMENT_OPTIONS = [
  { key: "fix_total", label: "Фикс за всё" },
  { key: "fix_task", label: "Фикс за задачу" },
  { key: "hourly", label: "Почасовая ставка" },
  { key: "shift", label: "Посменная ставка" },
];
const PAYMENT_LABEL = Object.fromEntries(PAYMENT_OPTIONS.map((p) => [p.key, p.label]));

/* ---------- определения тегов («кубиков исполнителя») ----------
   kind:
     "text"      — свободный ввод (Имя)
     "combo"     — свободный ввод + подсказка из словаря (Специализация)
     "select"    — выбор из фикс. списка (Роль, Грейд, Софт)
     "payment"   — кубик оплаты, несёт расчёт
   value  — строcovое состояние (для payment хранится в payment.*)         */
const TAG_DEFS = [
  { key: "name",    label: "Имя / название", short: "Имя",           icon: Type,       kind: "text" },
  { key: "role",    label: "Роль",           short: "Роль",          icon: Briefcase,  kind: "select", options: ROLE_OPTIONS },
  { key: "spec",    label: "Специализация",  short: "Специализация", icon: Palette,    kind: "select", options: SPECIALIZATION_OPTIONS },
  { key: "grade",   label: "Грейд",          short: "Грейд",         icon: BadgeCheck, kind: "select", options: GRADE_OPTIONS },
  { key: "soft",    label: "Софт",           short: "Софт",          icon: Monitor,    kind: "select", options: SOFTWARE_OPTIONS },
  { key: "payment", label: "Кубик оплаты",   short: "Оплата",        icon: Wallet,     kind: "payment", options: PAYMENT_OPTIONS },
];
const TAG_DEF = Object.fromEntries(TAG_DEFS.map((t) => [t.key, t]));

const TASK_DICTIONARY = [
  "Разработка концепции", "Написание сценария / синопсиса", "Концепт-арт",
  "Раскадровка (сториборд)", "Бордоматик", "Стилкадры / стилфреймы", "Аниматик",
  "Поиск / подбор ассетов", "Поиск референсов", "Моделирование", "Скульптинг",
  "Ретопология", "UV-развёртка", "Текстурирование", "Шейдинг / настройка материалов",
  "Риггинг", "Скиннинг", "Настройка сетапа", "Настройка окружения", "Настройка сцены",
  "Расстановка / настройка композиции", "Персонажная анимация", "Анимация объектов",
  "Анимация камеры", "Симуляция / FX", "Партиклы", "Настройка освещения",
  "Кеинг / хромакей", "Трекинг камеры", "Матчмувинг", "Ротоскопинг", "Клинап / чистка",
  "Настройка рендера", "Рендер по пассам", "Рендер-ферма (аренда)", "Аутсорс-рендер",
  "Тестовый рендер", "Финальный рендер", "Композитинг / сборка", "Сборка пассов",
  "Цветокоррекция", "Монтаж", "Моушн-дизайн / 2D-графика", "Титры / плашки / надписи",
  "Ресайзы / адаптации под форматы", "Саунд-дизайн", "Звуковые эффекты",
  "Музыка / подбор трека", "Сведение", "Озвучка / диктор", "Сетап здания под мэппинг",
  "Сетап нестандартного экрана", "Подготовка контента под экран",
];

/* ---------- factories ----------
   Тег на исполнителе: { id, key, value, payment? }
   - value: строка-состояние (для text/combo/select). "" = пустой тег.
   - payment: { type, rate, hours, shifts } — только для tag.key === "payment".
     Сумма фикса вводится напрямую в общее поле «Сумма» → executor.amount. */
const makeTag = (key, value = "") => {
  const tag = { id: uid(), key, value };
  if (key === "payment") tag.payment = { type: value || "", rate: "", hours: "", shifts: "" };
  return tag;
};
const makeExecutor = () => ({ id: uid(), tags: [], amount: "" });
const makeSubtask = () => ({ id: uid(), name: "", executors: [] });
const makeTask = () => ({ id: uid(), name: "", executors: [], subtasks: [] });
const makeStage = (preset) => ({
  id: uid(), presetKey: preset.key, name: preset.name, tasks: [], collapsed: false,
});
const makeProject = () => ({ id: uid(), name: "Новый проект", stages: [] });

/* ---------- calculations ----------
   Сумма исполнителя определяется тегом оплаты:
   - фикс (fix_total / fix_task): значение поля executor.amount
   - почасовая: rate × hours
   - посменная: rate × shifts
   Нет тега оплаты → 0. */
const executorSum = (e) => {
  const payTag = (e.tags || []).find((t) => t.key === "payment");
  if (!payTag) return 0;
  const p = payTag.payment || {};
  switch (p.type) {
    case "fix_total":
    case "fix_task": return numVal(e.amount);
    case "hourly": return numVal(p.rate) * numVal(p.hours);
    case "shift": return numVal(p.rate) * numVal(p.shifts);
    default: return 0;
  }
};
const subtaskSum = (st) => (st.executors || []).reduce((a, e) => a + executorSum(e), 0);
const taskSum = (t) =>
  (t.executors || []).reduce((a, e) => a + executorSum(e), 0) +
  (t.subtasks || []).reduce((a, st) => a + subtaskSum(st), 0);
const stageSum = (s) => (s.tasks || []).reduce((a, t) => a + taskSum(t), 0);
const projectSum = (p) => (p.stages || []).reduce((a, s) => a + stageSum(s), 0);

/* ---------- immutable project mutators ---------- */
const mapStage = (project, stageId, fn) => ({
  ...project,
  stages: project.stages.map((s) => (s.id === stageId ? fn(s) : s)),
});
const withTask = (project, stageId, taskId, fn) =>
  mapStage(project, stageId, (s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === taskId ? fn(t) : t)),
  }));
const withSubtask = (project, stageId, taskId, subtaskId, fn) =>
  withTask(project, stageId, taskId, (t) => ({
    ...t,
    subtasks: t.subtasks.map((st) => (st.id === subtaskId ? fn(st) : st)),
  }));
const withExecutorList = (project, stageId, taskId, subtaskId, fn) => {
  if (subtaskId) {
    return withSubtask(project, stageId, taskId, subtaskId, (st) => ({ ...st, executors: fn(st.executors) }));
  }
  return withTask(project, stageId, taskId, (t) => ({ ...t, executors: fn(t.executors) }));
};
const patchExecutorIn = (project, stageId, taskId, subtaskId, executorId, patch) =>
  withExecutorList(project, stageId, taskId, subtaskId, (list) =>
    list.map((e) => (e.id === executorId ? { ...e, ...patch } : e))
  );

/* ============================================================
   === DND LAYER (заменить на dnd-kit при переносе) ===

   dataTransfer.getData() надёжно читается только внутри самого
   события drop; сам payload храним рядом в JS-переменной
   dndPayloadRef, а dataTransfer используем только чтобы (а)
   запустить нативный drag и (б) на dragover понять тип объекта
   через e.dataTransfer.types, не трогая данные.

   Типы:
     STAGE    — этап (создать из пресета / переставить существующий)
     TASK     — задача (создать в этапе)
     EXECUTOR — исполнитель (создать в задаче/подзадаче)
     TAG      — тег «кубик исполнителя»: либо пустой, либо с состоянием,
                либо перенос установленного тега с другого исполнителя (копия)

   При переносе на dnd-kit: DND_TYPES и insertStage() остаются как есть,
   useDragSource/useDropTarget заменяются на useDraggable/useDroppable.
   ============================================================ */

const DND_TYPES = {
  STAGE: "application/x-kubiki-stage",
  TASK: "application/x-kubiki-task",
  EXECUTOR: "application/x-kubiki-executor",
  TAG: "application/x-kubiki-tag",
};

let dndPayloadRef = null;

function insertStage(project, payload, beforeStageId) {
  let stages = [...project.stages];
  let moving;
  if (payload.moveStageId) {
    if (payload.moveStageId === beforeStageId) return project;
    const idx = stages.findIndex((s) => s.id === payload.moveStageId);
    if (idx === -1) return project;
    moving = stages[idx];
    stages.splice(idx, 1);
  } else {
    const preset = STAGE_PRESETS.find((p) => p.key === payload.presetKey) || CUSTOM_STAGE;
    moving = makeStage(preset);
  }
  const targetIdx = beforeStageId ? stages.findIndex((s) => s.id === beforeStageId) : -1;
  const insertAt = targetIdx === -1 ? stages.length : targetIdx;
  stages.splice(insertAt, 0, moving);
  return { ...project, stages };
}

// Применить входящий тег к списку тегов исполнителя.
// Правила: name/payment уникальны (заменяем существующий), остальные — тоже
// держим по одному на исполнителя для чистоты строки (заменяем).
function applyTagToExecutor(tags, incoming) {
  const fresh = incoming.fromExecutor
    ? { id: uid(), key: incoming.key, value: incoming.value, ...(incoming.payment ? { payment: { ...incoming.payment } } : {}) }
    : makeTag(incoming.key, incoming.value || "");
  if (incoming.fromExecutor && incoming.payment) fresh.payment = { ...incoming.payment };
  const rest = tags.filter((t) => t.key !== incoming.key);
  // порядок тегов — по TAG_DEFS, чтобы строка не «прыгала»
  const next = [...rest, fresh];
  next.sort((a, b) => TAG_DEFS.findIndex((d) => d.key === a.key) - TAG_DEFS.findIndex((d) => d.key === b.key));
  return next;
}

function useDragSource(type, getPayload) {
  const [isDragging, setIsDragging] = useState(false);
  function handleDragStart(e) {
    dndPayloadRef = { type, payload: typeof getPayload === "function" ? getPayload() : getPayload };
    e.dataTransfer.setData(type, "1");
    e.dataTransfer.setData("text/plain", "kubiki");
    e.dataTransfer.effectAllowed = "all";
    setIsDragging(true);
    e.stopPropagation();
  }
  function handleDragEnd() {
    dndPayloadRef = null;
    setIsDragging(false);
  }
  return { isDragging, dragHandlers: { draggable: true, onDragStart: handleDragStart, onDragEnd: handleDragEnd } };
}

function useDropTarget(type, onDrop) {
  const [isOver, setIsOver] = useState(false);
  const accepts = (e) => e.dataTransfer.types.includes(type);
  function handleDragEnter(e) { if (accepts(e)) e.preventDefault(); }
  function handleDragOver(e) {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isOver) setIsOver(true);
  }
  function handleDragLeave() { setIsOver(false); }
  function handleDrop(e) {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    const stashed = dndPayloadRef;
    dndPayloadRef = null;
    if (stashed && stashed.type === type) onDrop(stashed.payload);
  }
  return {
    isOver,
    dropHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
/* === /DND LAYER === */

/* ============================================================
   Загрузка шрифта Geist (Google Fonts).
   Для реального проекта в ЕС: `npm i @fontsource/geist` (self-host),
   прямая загрузка с Google CDN — источник GDPR-риска. Здесь — для превью.
   ============================================================ */
function useGeistFont() {
  useEffect(() => {
    if (document.getElementById("kubiki-geist-font")) return;
    const link = document.createElement("link");
    link.id = "kubiki-geist-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400..600&display=swap";
    document.head.appendChild(link);
  }, []);
}

/* ============================================================
   Общий дропдаун состояний тега (используется в палитре и на строке)
   ============================================================ */
function useOutsideClose(ref, onClose) {
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
}

/* ============================================================
   Автоподсказка (для названия задачи и для «Специализации»)
   ============================================================ */
function SuggestInput({ value, onChange, onCommit, dictionary, placeholder, className, autoFocus }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const matches = value.trim().length > 0
    ? dictionary.filter((t) => t.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 7)
    : dictionary.slice(0, 7);
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

/* ============================================================
   Палитра — секция «Кубики исполнителя».
   Тег перетаскивается целиком (пустым) за строку с иконкой.
   Стрелка раскрывает список состояний — каждое состояние тоже
   перетаскивается ИЛИ по клику добавляется активному исполнителю.
   ============================================================ */
function StageChip({ preset, onClick }) {
  const { isDragging, dragHandlers } = useDragSource(DND_TYPES.STAGE, { presetKey: preset.key });
  const Icon = preset.icon;
  return (
    <div className={"kb-chip" + (preset.key === "custom" ? " kb-chip-dashed" : "") + (isDragging ? " kb-chip-dragging" : "")}
      {...dragHandlers} onClick={onClick} title="Перетащите на лист или кликните, чтобы добавить этап">
      <Icon size={14} strokeWidth={1.5} />
      <span>{preset.name}</span>
    </div>
  );
}

function SimpleChip({ icon: Icon, label, dndType, payload, onClick, hint }) {
  const { isDragging, dragHandlers } = useDragSource(dndType, payload);
  return (
    <div className={"kb-chip" + (isDragging ? " kb-chip-dragging" : "")} {...dragHandlers} onClick={onClick} title={hint}>
      <Icon size={14} strokeWidth={1.5} />
      <span>{label}</span>
    </div>
  );
}

function TagPaletteItem({ def, activeExecutorId, onAddTagToActive }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useOutsideClose(wrapRef, () => setOpen(false));
  const Icon = def.icon;

  // перетаскивание самого тега (пустого)
  const emptyPayload = () => ({ key: def.key, value: "" });
  const { isDragging, dragHandlers } = useDragSource(DND_TYPES.TAG, emptyPayload);

  const hasStates = def.kind === "select" || def.kind === "payment";
  const options = def.options || [];

  const addEmptyToActive = () => { if (activeExecutorId) onAddTagToActive({ key: def.key, value: "" }); };

  return (
    <div className="kb-tagitem" ref={wrapRef}>
      <div className={"kb-chip kb-chip-tag" + (isDragging ? " kb-chip-dragging" : "")}
        {...dragHandlers}
        onClick={addEmptyToActive}
        title={activeExecutorId ? "Перетащите или кликните, чтобы добавить активному исполнителю" : "Перетащите на исполнителя"}>
        <Icon size={14} strokeWidth={1.5} />
        <span>{def.label}</span>
        {hasStates && (
          <button type="button" className="kb-chip-caret"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title="Состояния">
            <ChevronDown size={12} strokeWidth={1.5} className={open ? "kb-chevron-open" : ""} />
          </button>
        )}
      </div>

      {open && hasStates && (
        <div className="kb-suggest kb-suggest-states">
          {options.map((opt) => {
            const value = def.kind === "payment" ? opt.key : opt;
            const label = def.kind === "payment" ? opt.label : opt;
            return (
              <StateOption key={value} def={def} value={value} label={label}
                activeExecutorId={activeExecutorId}
                onAddTagToActive={onAddTagToActive}
                onPicked={() => setOpen(false)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Одно состояние в раскрытом списке: перетаскивается ИЛИ кликается.
function StateOption({ def, value, label, activeExecutorId, onAddTagToActive, onPicked }) {
  const { dragHandlers } = useDragSource(DND_TYPES.TAG, () => ({ key: def.key, value }));
  return (
    <div className="kb-suggest-item kb-state-item" {...dragHandlers}
      onClick={() => { if (activeExecutorId) { onAddTagToActive({ key: def.key, value }); onPicked(); } }}>
      {label}
    </div>
  );
}

function PaletteSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="kb-palette-section">
      <button type="button" className="kb-palette-title" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <ChevronDown size={13} strokeWidth={1.5} className={"kb-chevron" + (open ? " kb-chevron-open" : "")} />
      </button>
      {open && <div className="kb-palette-items">{children}</div>}
    </div>
  );
}

function PalettePanel({ activeExecutorId, activeExecutorTags, activeTaskId, onAddTagToActive, onAddStage, onAddTask, onAddExecutor }) {
  // подсказка: база → добавлен обычный тег (без оплаты) → добавлен кубик оплаты (приоритет)
  const tags = activeExecutorTags || [];
  const hasPayment = tags.some((t) => t.key === "payment");
  const hasOther = tags.some((t) => t.key !== "payment");
  const cubesHint = hasPayment
    ? "Так держать, за дело!"
    : hasOther
      ? "Так держать! И не забудь добавить кубик оплаты"
      : "На одного исполнителя можно добавить несколько кубиков";
  return (
    <aside className="kb-palette">
      <PaletteSection title="Этапы" defaultOpen={true}>
        {STAGE_PRESETS.map((p) => <StageChip key={p.key} preset={p} onClick={() => onAddStage(p)} />)}
        <StageChip preset={CUSTOM_STAGE} onClick={() => onAddStage(CUSTOM_STAGE)} />
        <p className="kb-palette-note">Клик добавляет этап в конец листа. Порядок можно менять перетаскиванием.</p>
      </PaletteSection>

      <PaletteSection title="Задача">
        <SimpleChip icon={ListTodo} label="Задача" dndType={DND_TYPES.TASK} payload={{}} onClick={onAddTask}
          hint="Перетащите в этап или кликните, чтобы добавить в выделенный этап" />
        <p className="kb-palette-note">Клик добавляет задачу в выделенный этап (кликните по этапу, чтобы выделить)</p>
      </PaletteSection>

      <PaletteSection title="Исполнитель">
        <SimpleChip icon={User} label="Исполнитель" dndType={DND_TYPES.EXECUTOR} payload={{}} onClick={onAddExecutor}
          hint="Перетащите в задачу или кликните, чтобы добавить в выделенную задачу" />
        <p className="kb-palette-note">
          {activeTaskId ? "Клик добавит исполнителя в выделенную задачу." : "Клик добавит исполнителя в выделенную задачу."}
        </p>
      </PaletteSection>

      <PaletteSection title="Кубики исполнителя">
        {TAG_DEFS.map((def) => (
          <TagPaletteItem key={def.key} def={def}
            activeExecutorId={activeExecutorId} onAddTagToActive={onAddTagToActive} />
        ))}
        <p className="kb-palette-note">{cubesHint}</p>
      </PaletteSection>
    </aside>
  );
}

/* ============================================================
   Тег НА исполнителе (чип). Пустой → клик открывает состояния.
   Заполненный → показывает значение, можно перетащить (копия) или
   переоткрыть/очистить. Перетаскивается payload с fromExecutor:true.
   ============================================================ */
function ExecutorTag({ tag, onSetValue, onSetPayment, onRemove }) {
  const def = TAG_DEF[tag.key];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const wrapRef = useRef(null);
  useOutsideClose(wrapRef, () => { setOpen(false); setEditing(false); });

  const filled = def.kind === "payment" ? !!(tag.payment && tag.payment.type) : !!tag.value;

  // перенос установленного тега на другого исполнителя = копирование
  const { dragHandlers } = useDragSource(DND_TYPES.TAG, () => ({
    key: tag.key,
    value: def.kind === "payment" ? (tag.payment?.type || "") : tag.value,
    fromExecutor: true,
    ...(def.kind === "payment" && tag.payment ? { payment: { ...tag.payment } } : {}),
  }));

  const Icon = def.icon;

  const displayValue = () => {
    if (def.kind === "payment") return tag.payment?.type ? PAYMENT_LABEL[tag.payment.type] : "";
    return tag.value;
  };

  // --- пустой тег: клик раскрывает состояния / поле ввода ---
  const openStates = () => {
    if (def.kind === "text") { setEditing(true); return; }
    if (def.kind === "combo") { setEditing(true); return; }
    setOpen(true);
  };

  return (
    <div className={"kb-tag" + (filled ? " kb-tag-filled" : " kb-tag-empty")} ref={wrapRef} {...(filled ? dragHandlers : {})}>
      <Icon size={11} strokeWidth={1.5} className="kb-tag-ic" />

      {/* text / combo: инлайн-ввод */}
      {(def.kind === "text" || def.kind === "combo") && (editing || filled) ? (
        def.kind === "combo" ? (
          <SuggestInput
            className="kb-tag-input"
            value={tag.value}
            dictionary={def.options}
            placeholder={def.label}
            autoFocus={editing && !filled}
            onChange={(v) => onSetValue(v)}
            onCommit={() => setEditing(false)}
          />
        ) : (
          <input className="kb-tag-input" placeholder={def.label} value={tag.value}
            autoFocus={editing && !filled}
            onChange={(e) => onSetValue(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === "Enter") setEditing(false); }} />
        )
      ) : filled ? (
        <span className="kb-tag-val" onClick={() => def.kind === "select" || def.kind === "payment" ? setOpen(true) : setEditing(true)}>
          {displayValue()}
        </span>
      ) : (
        <button type="button" className="kb-tag-placeholder" onClick={openStates}>
          {def.label}
        </button>
      )}

      <button type="button" className="kb-tag-x" onClick={onRemove} title="Убрать тег">
        <X size={10} strokeWidth={2} />
      </button>

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
   Строка исполнителя
   ============================================================ */
function ExecutorRow({ executor, active, flash, onActivate, onPatch, onRemove }) {
  const sum = executorSum(executor);
  const payTag = executor.tags.find((t) => t.key === "payment");
  const payType = payTag?.payment?.type;
  const isFix = payType === "fix_total" || payType === "fix_task";
  const isRateBased = payType === "hourly" || payType === "shift";
  const hasPay = !!payType;

  const setTags = (fn) => onPatch({ tags: fn(executor.tags) });

  const { isOver, dropHandlers } = useDropTarget(DND_TYPES.TAG, (payload) => {
    setTags((tags) => applyTagToExecutor(tags, payload));
    onActivate();
  });

  const setTagValue = (tagId, value) =>
    setTags((tags) => tags.map((t) => (t.id === tagId ? { ...t, value } : t)));
  const setTagPayment = (tagId, patch) =>
    setTags((tags) => tags.map((t) => (t.id === tagId ? { ...t, payment: { ...(t.payment || {}), ...patch } } : t)));
  const removeTag = (tagId) =>
    setTags((tags) => tags.filter((t) => t.id !== tagId));

  const cls = "kb-erow-group"
    + (isOver ? " kb-erow-group-over" : "")
    + (active ? " kb-erow-group-active" : "")
    + (flash ? " kb-erow-flash" : "");

  return (
    <div className={cls} onMouseDown={(e) => { e.stopPropagation(); onActivate(); }} {...dropHandlers}>
      <div className="kb-erow">
        <div className="kb-erow-tags">
          {executor.tags.length === 0 && (
            <span className="kb-erow-empty">Добавьте кубики исполнителя</span>
          )}
          {executor.tags.map((t) => (
            <ExecutorTag key={t.id} tag={t}
              onSetValue={(v) => setTagValue(t.id, v)}
              onSetPayment={(patch) => setTagPayment(t.id, patch)}
              onRemove={() => removeTag(t.id)} />
          ))}

          {/* поля почасовой/посменной — сразу справа от тегов, на той же строке (п.4) */}
          {isRateBased && payTag && (
            <PaymentInlineFields payment={payTag.payment}
              onSetPayment={(patch) => setTagPayment(payTag.id, patch)} />
          )}
        </div>

        <div className="kb-erow-amount">
          {isFix ? (
            <input className="kb-input kb-input-num kb-amount-input" value={executor.amount} placeholder="0"
              onChange={(e) => onPatch({ amount: e.target.value })} onMouseDown={(e) => e.stopPropagation()} />
          ) : (
            <span className={"kb-erow-sum" + (hasPay ? "" : " kb-erow-sum-muted")}>{fmt(sum)} ₽</span>
          )}
        </div>

        <button type="button" className="kb-icon-btn kb-erow-del" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Удалить исполнителя">
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Подзадача
   ============================================================ */
function SubtaskBlock({ subtask, stageId, taskId, activeSubtaskId, activeExecutorId, flashId, onActivateSubtask, onActivateExecutor, onPatch, onRemove, onAddExecutor, onPatchExecutor, onRemoveExecutor }) {
  const { isOver, dropHandlers } = useDropTarget(DND_TYPES.EXECUTOR, () => onAddExecutor());
  const isActive = activeSubtaskId === subtask.id && !activeExecutorId;
  // клик по подзадаче выделяет её как контекст для добавления исполнителя (п.1);
  // stopPropagation, чтобы не всплыло к задаче и не переопределило контекст
  const onSubtaskMouseDown = (e) => { e.stopPropagation(); onActivateSubtask(stageId, taskId, subtask.id); };
  return (
    <div className={"kb-subtask" + (isActive ? " kb-subtask-active" : "")} onMouseDown={onSubtaskMouseDown}>
      <div className="kb-subtask-head">
        <input className="kb-input kb-input-flex" placeholder="Название подзадачи" value={subtask.name}
          onChange={(e) => onPatch({ name: e.target.value })} />
        <span className="kb-sum kb-sum-task">{fmt(subtaskSum(subtask))} ₽</span>
        <button type="button" className="kb-icon-btn" onClick={onRemove} title="Удалить подзадачу">
          <Trash2 size={12} strokeWidth={1.5} />
        </button>
      </div>
      <div className={"kb-subtask-body" + (isOver ? " kb-dropzone-over" : "")} {...dropHandlers}>
        {subtask.executors.length === 0 && <div className="kb-empty-hint">Перетащите исполнителя сюда или просто кликните на него в панели кубиков</div>}
        {subtask.executors.map((e) => (
          <ExecutorRow key={e.id} executor={e}
            active={activeExecutorId === e.id}
            flash={flashId === e.id}
            onActivate={() => onActivateExecutor(stageId, taskId, subtask.id, e.id)}
            onPatch={(patch) => onPatchExecutor(e.id, patch)}
            onRemove={() => onRemoveExecutor(e.id)} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Задача
   ============================================================ */
function TaskBlock({ task, stageId, dispatch, activeTaskId, activeSubtaskId, activeExecutorId, onActivateTask, onActivateSubtask, onActivateExecutor, onPatch, onRemove }) {
  const total = taskSum(task);
  const isActive = activeTaskId === task.id && !activeSubtaskId && !activeExecutorId;
  const [justAddedId, setJustAddedId] = useState(null);

  const flashExecutor = (id) => {
    setJustAddedId(id);
    setTimeout(() => setJustAddedId((cur) => (cur === id ? null : cur)), 300);
  };

  const { isOver, dropHandlers } = useDropTarget(DND_TYPES.EXECUTOR, () => {
    const executor = makeExecutor();
    dispatch((p) => withTask(p, stageId, task.id, (t) => ({ ...t, executors: [...t.executors, executor] })));
    onActivateExecutor(stageId, task.id, null, executor.id);
    flashExecutor(executor.id);
  });

  const patchExecutor = (executorId, patch, subtaskId) =>
    dispatch((p) => patchExecutorIn(p, stageId, task.id, subtaskId, executorId, patch));
  const removeExecutor = (executorId, subtaskId) =>
    dispatch((p) => withExecutorList(p, stageId, task.id, subtaskId, (list) => list.filter((e) => e.id !== executorId)));
  const addExecutorToSubtask = (subtaskId) => {
    const executor = makeExecutor();
    dispatch((p) => withExecutorList(p, stageId, task.id, subtaskId, (list) => [...list, executor]));
    onActivateExecutor(stageId, task.id, subtaskId, executor.id);
    flashExecutor(executor.id);
  };

  const addSubtask = () =>
    dispatch((p) => withTask(p, stageId, task.id, (t) => ({ ...t, subtasks: [...t.subtasks, makeSubtask()] })));
  const patchSubtask = (subtaskId, patch) =>
    dispatch((p) => withSubtask(p, stageId, task.id, subtaskId, (st) => ({ ...st, ...patch })));
  const removeSubtask = (subtaskId) =>
    dispatch((p) => withTask(p, stageId, task.id, (t) => ({ ...t, subtasks: t.subtasks.filter((st) => st.id !== subtaskId) })));

  const onTaskMouseDown = (e) => { e.stopPropagation(); onActivateTask(stageId, task.id); };

  return (
    <div className={"kb-task" + (isActive ? " kb-task-active" : "")} onMouseDown={onTaskMouseDown}>
      <div className="kb-task-head">
        <SuggestInput className="kb-input kb-input-medium kb-task-name" value={task.name}
          dictionary={TASK_DICTIONARY} placeholder="Название задачи…"
          onChange={(v) => onPatch({ name: v })} />
        <span className="kb-sum kb-sum-task">{fmt(total)} ₽</span>
        <button type="button" className="kb-icon-btn" onClick={onRemove} title="Удалить задачу">
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      <div className={"kb-task-body" + (isOver ? " kb-dropzone-over" : "")} {...dropHandlers}>
        {task.executors.length === 0 && task.subtasks.length === 0 && (
          <div className="kb-empty-hint">Перетащите исполнителя сюда или просто кликните на него из панели кубиков</div>
        )}
        {task.executors.map((e) => (
          <ExecutorRow key={e.id} executor={e}
            active={activeExecutorId === e.id}
            flash={justAddedId === e.id}
            onActivate={() => onActivateExecutor(stageId, task.id, null, e.id)}
            onPatch={(patch) => patchExecutor(e.id, patch)}
            onRemove={() => removeExecutor(e.id)} />
        ))}
        {task.subtasks.map((st) => (
          <SubtaskBlock key={st.id} subtask={st} stageId={stageId} taskId={task.id}
            activeSubtaskId={activeSubtaskId} activeExecutorId={activeExecutorId} flashId={justAddedId}
            onActivateSubtask={onActivateSubtask} onActivateExecutor={onActivateExecutor}
            onPatch={(patch) => patchSubtask(st.id, patch)}
            onRemove={() => removeSubtask(st.id)}
            onAddExecutor={() => addExecutorToSubtask(st.id)}
            onPatchExecutor={(exId, patch) => patchExecutor(exId, patch, st.id)}
            onRemoveExecutor={(exId) => removeExecutor(exId, st.id)} />
        ))}
      </div>

      <button type="button" className="kb-link-btn" onClick={addSubtask}>
        <Plus size={12} strokeWidth={1.5} /> Подзадача
      </button>
    </div>
  );
}

/* ============================================================
   Зона дропа этапа на листе
   ============================================================ */
function CanvasDropZone({ isEmpty, onDropStage }) {
  const { isOver, dropHandlers } = useDropTarget(DND_TYPES.STAGE, onDropStage);
  return (
    <div className={"kb-dropzone" + (isEmpty ? " kb-dropzone-empty" : "") + (isOver ? " kb-dropzone-over" : "")} {...dropHandlers}>
      {isEmpty ? (
        <>
          <Box size={20} strokeWidth={1.25} />
          <p>Перетащите сюда Этап из панели кубиков, чтобы начать.</p>
        </>
      ) : (
        <span>перетащите этап сюда, чтобы добавить в конец</span>
      )}
    </div>
  );
}

/* ============================================================
   Этап
   ============================================================ */
function StageCard({ stage, dispatch, activeStageId, activeTaskId, activeSubtaskId, activeExecutorId, onActivateStage, onActivateTask, onActivateSubtask, onActivateExecutor, onRemove }) {
  const StageIcon = (STAGE_PRESETS.find((p) => p.key === stage.presetKey) || CUSTOM_STAGE).icon;
  const total = stageSum(stage);
  const isActive = activeStageId === stage.id && !activeTaskId && !activeExecutorId;

  const { isDragging, dragHandlers } = useDragSource(DND_TYPES.STAGE, { moveStageId: stage.id });
  const { isOver: isOverReorder, dropHandlers: reorderHandlers } = useDropTarget(
    DND_TYPES.STAGE, (payload) => dispatch((p) => insertStage(p, payload, stage.id)));
  const { isOver: isOverTask, dropHandlers: taskDropHandlers } = useDropTarget(
    DND_TYPES.TASK, () => dispatch((p) => mapStage(p, stage.id, (s) => ({ ...s, tasks: [...s.tasks, makeTask()] }))));

  const patchStage = (patch) => dispatch((p) => mapStage(p, stage.id, (s) => ({ ...s, ...patch })));
  const patchTask = (taskId, patch) => dispatch((p) => withTask(p, stage.id, taskId, (t) => ({ ...t, ...patch })));
  const removeTask = (taskId) =>
    dispatch((p) => mapStage(p, stage.id, (s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) })));

  // клик по карточке этапа выделяет его и НЕ всплывает до нейтральной зоны (иначе сброс)
  const onStageMouseDown = (e) => { e.stopPropagation(); onActivateStage(stage.id); };

  return (
    <div className={"kb-stage" + (isActive ? " kb-stage-active" : "") + (isOverReorder ? " kb-stage-over" : "") + (isDragging ? " kb-stage-dragging" : "")}
      {...reorderHandlers} onMouseDown={onStageMouseDown}>
      <div className="kb-stage-head">
        <span className="kb-grip" title="Перетащите, чтобы переставить" {...dragHandlers}>
          <GripVertical size={14} strokeWidth={1.5} />
        </span>
        <StageIcon size={15} strokeWidth={1.5} className="kb-stage-icon" />
        <input className="kb-input kb-input-flex kb-stage-name" value={stage.name}
          onChange={(e) => patchStage({ name: e.target.value })} />
        <button type="button" className="kb-icon-btn" onClick={() => patchStage({ collapsed: !stage.collapsed })}
          title={stage.collapsed ? "Развернуть" : "Свернуть"}>
          {stage.collapsed ? <ChevronDown size={15} strokeWidth={1.5} /> : <ChevronUp size={15} strokeWidth={1.5} />}
        </button>
        <span className="kb-sum kb-sum-stage">{fmt(total)} ₽</span>
        <button type="button" className="kb-icon-btn" onClick={onRemove} title="Удалить этап">
          <Trash2 size={14} strokeWidth={1.5} />
        </button>
      </div>

      {!stage.collapsed && (
        <div className={"kb-stage-body" + (isOverTask ? " kb-dropzone-over" : "")} {...taskDropHandlers}>
          {stage.tasks.length === 0 && <div className="kb-empty-hint">Перетащите задачу сюда или просто кликните на нее из панели кубиков</div>}
          {stage.tasks.map((t) => (
            <TaskBlock key={t.id} task={t} stageId={stage.id} dispatch={dispatch}
              activeTaskId={activeTaskId} activeSubtaskId={activeSubtaskId} activeExecutorId={activeExecutorId}
              onActivateTask={onActivateTask} onActivateSubtask={onActivateSubtask} onActivateExecutor={onActivateExecutor}
              onPatch={(patch) => patchTask(t.id, patch)} onRemove={() => removeTask(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Заглушка «Собрать внешнюю смету»
   ============================================================ */
function ExternalEstimateModal({ onClose }) {
  return (
    <div className="kb-modal-overlay" onClick={onClose}>
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        <button className="kb-modal-close" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
        <div className="kb-modal-icon"><Wallet size={19} strokeWidth={1.25} /></div>
        <h3>Внешняя смета</h3>
        <p>Скоро будет доступно.</p>
        <p className="kb-modal-sub">Наценка и клиентская смета появятся отдельной итерацией — после проверки логики себестоимости на реальных проектах.</p>
      </div>
    </div>
  );
}

/* ============================================================
   Рабочая зона
   ============================================================ */
function Workspace({ project, onChange, onBack }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeExecutorId, setActiveExecutorId] = useState(null);
  const [activeSubtaskId, setActiveSubtaskId] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeStageId, setActiveStageId] = useState(null);
  const dispatch = (fn) => onChange(fn);
  const total = projectSum(project);

  // теги выделенного исполнителя — для контекстной подсказки под «Кубиками исполнителя»
  const activeExecutorTags = (() => {
    if (!activeExecutorId) return null;
    for (const s of project.stages) {
      for (const t of s.tasks) {
        const direct = t.executors.find((e) => e.id === activeExecutorId);
        if (direct) return direct.tags;
        for (const st of t.subtasks) {
          const nested = st.executors.find((e) => e.id === activeExecutorId);
          if (nested) return nested.tags;
        }
      }
    }
    return null;
  })();

  const clearSelection = () => {
    setActiveExecutorId(null); setActiveSubtaskId(null); setActiveTaskId(null); setActiveStageId(null);
  };

  // выбор с верхних уровней автоматически задаёт контекст ниже,
  // чтобы «клик по этапу → клик Задача» и «клик по задаче → клик Исполнитель» работали интуитивно
  const activateStage = (stageId) => { setActiveStageId(stageId); setActiveTaskId(null); setActiveSubtaskId(null); setActiveExecutorId(null); };
  const activateTask = (stageId, taskId) => { setActiveStageId(stageId); setActiveTaskId(taskId); setActiveSubtaskId(null); setActiveExecutorId(null); };
  const activateSubtask = (stageId, taskId, subtaskId) => { setActiveStageId(stageId); setActiveTaskId(taskId); setActiveSubtaskId(subtaskId); setActiveExecutorId(null); };
  const activateExecutor = (stageId, taskId, subtaskId, executorId) => { setActiveStageId(stageId); setActiveTaskId(taskId); setActiveSubtaskId(subtaskId || null); setActiveExecutorId(executorId); };

  const removeStage = (stageId) => {
    dispatch((p) => ({ ...p, stages: p.stages.filter((s) => s.id !== stageId) }));
    if (activeStageId === stageId) clearSelection();
  };

  /* ---- добавление кликом из палитры ---- */
  const addStageByClick = (preset) => {
    const stage = makeStage(preset);
    dispatch((p) => ({ ...p, stages: [...p.stages, stage] }));
    activateStage(stage.id);
  };

  const addTaskByClick = () => {
    // цель — выделенный этап; если не выделен, но этап один — берём его; иначе последний
    const stages = project.stages;
    if (stages.length === 0) return;
    const targetStageId = activeStageId && stages.some((s) => s.id === activeStageId)
      ? activeStageId
      : stages[stages.length - 1].id;
    const task = makeTask();
    dispatch((p) => mapStage(p, targetStageId, (s) => ({ ...s, tasks: [...s.tasks, task] })));
    activateTask(targetStageId, task.id);
  };

  const addExecutorByClick = () => {
    // приоритет цели: выделенная подзадача → выделенная задача → последняя задача этапа
    if (activeSubtaskId && activeTaskId && activeStageId) {
      const executor = makeExecutor();
      dispatch((p) => withExecutorList(p, activeStageId, activeTaskId, activeSubtaskId, (list) => [...list, executor]));
      activateExecutor(activeStageId, activeTaskId, activeSubtaskId, executor.id);
      return;
    }
    let targetStageId = activeStageId;
    let targetTaskId = activeTaskId;
    if (!targetTaskId) {
      const stage = (activeStageId && project.stages.find((s) => s.id === activeStageId))
        || project.stages[project.stages.length - 1];
      if (!stage || stage.tasks.length === 0) return;
      targetStageId = stage.id;
      targetTaskId = stage.tasks[stage.tasks.length - 1].id;
    }
    const executor = makeExecutor();
    dispatch((p) => withTask(p, targetStageId, targetTaskId, (t) => ({ ...t, executors: [...t.executors, executor] })));
    activateExecutor(targetStageId, targetTaskId, null, executor.id);
  };

  // добавить тег активному исполнителю (клик из палитры)
  const addTagToActive = (payload) => {
    if (!activeExecutorId) return;
    dispatch((p) => ({
      ...p,
      stages: p.stages.map((s) => ({
        ...s,
        tasks: s.tasks.map((t) => ({
          ...t,
          executors: t.executors.map((e) =>
            e.id === activeExecutorId ? { ...e, tags: applyTagToExecutor(e.tags, payload) } : e),
          subtasks: t.subtasks.map((st) => ({
            ...st,
            executors: st.executors.map((e) =>
              e.id === activeExecutorId ? { ...e, tags: applyTagToExecutor(e.tags, payload) } : e),
          })),
        })),
      })),
    }));
  };

  return (
    <div className="kb-root">
      <header className="kb-header">
        <button type="button" className="kb-back" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={1.5} /> Проекты
        </button>
        <input className="kb-input kb-project-name" value={project.name}
          onChange={(e) => dispatch((p) => ({ ...p, name: e.target.value }))} />
        <div className="kb-spacer" />
        <button type="button" className="kb-btn-secondary" onClick={() => setModalOpen(true)}>
          Собрать внешнюю смету
        </button>
        <div className="kb-total-badge">
          <span className="kb-total-label">Итого себестоимость</span>
          <span className="kb-total-figure">{fmt(total)} ₽</span>
        </div>
      </header>

      <div className="kb-layout">
        <PalettePanel
          activeExecutorId={activeExecutorId}
          activeExecutorTags={activeExecutorTags}
          activeTaskId={activeTaskId}
          onAddTagToActive={addTagToActive}
          onAddStage={addStageByClick}
          onAddTask={addTaskByClick}
          onAddExecutor={addExecutorByClick}
        />
        {/* клик по нейтральной зоне листа снимает все выделения (п.5).
            Останавливаем всплытие у карточек этапов, чтобы клик по ним не сбрасывал. */}
        <main className="kb-canvas" onMouseDown={clearSelection}>
          {project.stages.map((s) => (
            <StageCard key={s.id} stage={s} dispatch={dispatch}
              activeStageId={activeStageId} activeTaskId={activeTaskId}
              activeSubtaskId={activeSubtaskId} activeExecutorId={activeExecutorId}
              onActivateStage={activateStage}
              onActivateTask={activateTask}
              onActivateSubtask={activateSubtask}
              onActivateExecutor={activateExecutor}
              onRemove={() => removeStage(s.id)} />
          ))}
          <CanvasDropZone isEmpty={project.stages.length === 0}
            onDropStage={(payload) => dispatch((p) => insertStage(p, payload, null))} />
        </main>
      </div>

      {modalOpen && <ExternalEstimateModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

/* ============================================================
   Дашборд проектов
   ============================================================ */
function Logo({ size = 20 }) {
  const s = size / 2 - 1;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="0" y="0" width={s} height={s} rx="2" fill="#1A2230" />
      <rect x={s + 2} y="0" width={s} height={s} rx="2" fill="#CBD5E1" />
      <rect x="0" y={s + 2} width={s} height={s} rx="2" fill="#CBD5E1" />
      <rect x={s + 2} y={s + 2} width={s} height={s} rx="2" fill="#5B8DEF" />
    </svg>
  );
}

function Dashboard({ projects, onOpen, onCreate, onDelete }) {
  return (
    <div className="kb-root">
      <header className="kb-header kb-header-dash">
        <Logo size={21} />
        <div className="kb-brand">
          <span className="kb-brand-name">Kubiki</span>
          <span className="kb-brand-sub">умная смета для CG-производства</span>
        </div>
      </header>

      <div className="kb-dashboard">
        <div className="kb-board">
          {projects.map((p) => (
            <div key={p.id} className="kb-card" onClick={() => onOpen(p.id)}>
              <button type="button" className="kb-card-del"
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} title="Удалить проект">
                <X size={12} strokeWidth={1.5} />
              </button>
              <div className="kb-card-icon"><Box size={19} strokeWidth={1.25} /></div>
              <div className="kb-card-name">{p.name || "Без названия"}</div>
              <div className="kb-card-sum">{fmt(projectSum(p))} ₽</div>
              <div className="kb-card-meta">
                {p.stages.reduce((a, s) => a + s.tasks.length, 0)} задач
              </div>
            </div>
          ))}
          <button type="button" className="kb-card kb-card-new" onClick={onCreate}>
            <Plus size={20} strokeWidth={1.25} />
            <span>Новый проект</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Root App
   ============================================================ */
export default function KubikiApp() {
  useGeistFont();
  const [projects, setProjects] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const currentProject = projects.find((p) => p.id === currentId) || null;

  const createProject = () => {
    const p = makeProject();
    setProjects((prev) => [...prev, p]);
    setCurrentId(p.id);
  };
  const deleteProject = (id) => setProjects((prev) => prev.filter((p) => p.id !== id));
  const updateCurrent = (updater) =>
    setProjects((prev) => prev.map((p) => (p.id === currentId ? updater(p) : p)));

  return (
    <>
      <style>{CSS}</style>
      {currentProject ? (
        <Workspace project={currentProject} onChange={updateCurrent} onBack={() => setCurrentId(null)} />
      ) : (
        <Dashboard projects={projects} onOpen={setCurrentId} onCreate={createProject} onDelete={deleteProject} />
      )}
    </>
  );
}

/* ============================================================
   CSS — Raw Minimal / B2B SaaS, Geist
   ============================================================ */
const CSS = `
:root{
  --bg:#FCFDFE;
  --bg-elevated:#FEFEFF;
  --surface:#FFFFFF;
  --surface-sunken:#FAFBFD;
  --line:#EAEEF3;
  --line-strong:#D3DAE3;
  --text:#1A2230;
  --text-muted:#64748B;
  --text-faint:#94A3B8;
  --accent:#5B8DEF;
  --accent-soft:#EEF4FE;

  --fs-2xs:12px; --fs-xs:12.5px; --fs-sm:15px; --fs-base:15.5px;
  --fs-md:17px; --fs-lg:20px; --fs-xl:26px;
  --fw-regular:400; --fw-medium:500; --fw-semibold:600;
}
.kb-root *{box-sizing:border-box}
.kb-root{
  font-family:'Geist','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  color:var(--text); background:var(--bg); min-height:100%;
  line-height:1.5; font-weight:var(--fw-regular); font-feature-settings:"tnum" 1;
}
.kb-root button{font-family:inherit}

/* header */
.kb-header{display:flex; align-items:center; gap:16px; padding:13px 12px; max-width:calc(248px + 960px); margin:0 auto;
  border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); z-index:20}
.kb-header-dash{padding:17px 24px; max-width:1080px}
.kb-brand{display:flex; flex-direction:column; line-height:1.2}
.kb-brand-name{font-weight:var(--fw-semibold); font-size:var(--fs-lg); letter-spacing:-.02em}
.kb-brand-sub{font-size:var(--fs-2xs); color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-top:2px; font-weight:var(--fw-medium)}
.kb-back{display:flex; align-items:center; gap:6px; background:none; border:none;
  color:var(--text-muted); font-size:var(--fs-base); font-weight:var(--fw-medium); cursor:pointer; padding:6px 4px; border-radius:5px}
.kb-back:hover{color:var(--text)}
.kb-project-name{font-size:var(--fs-lg); font-weight:var(--fw-semibold); letter-spacing:-.02em; min-width:160px; max-width:320px}
.kb-spacer{flex:1}
.kb-btn-secondary{border:1px solid var(--line); background:transparent; color:var(--text);
  font-size:var(--fs-base); font-weight:var(--fw-medium); padding:7px 13px; border-radius:6px; cursor:pointer; transition:.15s}
.kb-btn-secondary:hover{background:var(--accent-soft); border-color:var(--accent)}
.kb-total-badge{display:flex; flex-direction:column; align-items:flex-end; gap:2px; line-height:1.2;
  padding:7px 16px; border-radius:9px; background:var(--accent-soft)}
.kb-total-label{font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:var(--fw-semibold)}
.kb-total-figure{font-size:var(--fs-xl); font-weight:var(--fw-semibold); color:var(--text); font-variant-numeric:tabular-nums; letter-spacing:-.02em}

/* layout */
.kb-layout{display:flex; align-items:stretch; max-width:calc(248px + 960px); margin:0 auto; min-height:calc(100vh - 60px)}
.kb-palette{width:248px; flex-shrink:0; background:var(--surface); border-right:1px solid var(--line-strong);
  padding:14px 12px 22px; position:sticky; top:60px; display:flex; flex-direction:column; gap:2px}
.kb-canvas{flex:1; min-width:0; max-width:960px; margin:0 auto; padding:20px 28px 120px}

/* palette accordion */
.kb-palette-section{padding-bottom:4px; margin-bottom:6px}
.kb-palette-title{width:100%; display:flex; align-items:center; justify-content:space-between; background:none; border:none;
  cursor:pointer; padding:8px 6px; font-size:var(--fs-2xs); font-weight:var(--fw-semibold); text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted)}
.kb-palette-title:hover{color:var(--text)}
.kb-chevron{transition:transform .15s; color:var(--text-faint); flex-shrink:0}
.kb-chevron-open{transform:rotate(180deg)}
.kb-palette-items{display:flex; flex-direction:column; gap:1px; padding:2px 0 4px}
.kb-chip{display:flex; align-items:center; gap:9px; border:none; border-radius:6px; padding:7px 8px;
  font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text); background:transparent; cursor:grab; user-select:none; transition:background .12s}
.kb-chip:hover{background:var(--accent-soft)}
.kb-chip:active{cursor:grabbing}
.kb-chip span{flex:1; min-width:0}
.kb-chip-dashed{color:var(--text-muted)}
.kb-chip-dragging{opacity:.45}
.kb-chip-tag{padding-right:4px}
.kb-chip-caret{background:none; border:none; color:var(--text-faint); cursor:pointer; padding:2px; border-radius:4px; display:flex; flex-shrink:0}
.kb-chip-caret:hover{color:var(--text); background:var(--surface)}
.kb-tagitem{position:relative}
.kb-palette-note{font-size:var(--fs-xs); color:var(--text-faint); line-height:1.45; margin-top:8px; padding:0 6px}

/* stage */
.kb-stage{border:1px solid var(--line); border-radius:8px; background:var(--surface); margin-bottom:14px; transition:.15s}
.kb-stage-active{border-color:var(--accent); box-shadow:0 0 0 1px var(--accent)}
.kb-stage-over{outline:1.5px dashed var(--accent); outline-offset:-1px; background:var(--accent-soft)}
.kb-stage-dragging{opacity:.45}
.kb-stage-head{display:flex; align-items:center; gap:9px; padding:9px 13px; border-bottom:1px solid var(--line)}
.kb-grip{display:flex; color:var(--text-faint); cursor:grab; padding:2px; border-radius:3px}
.kb-grip:hover{color:var(--text-muted); background:var(--accent-soft)}
.kb-grip:active{cursor:grabbing}
.kb-stage-icon{color:var(--text-faint); flex-shrink:0}
.kb-stage-name{font-size:var(--fs-md); font-weight:var(--fw-semibold); letter-spacing:-.01em}
.kb-stage-body{padding:2px 13px 8px}
.kb-dropzone-over{background:var(--accent-soft); outline:1.5px dashed var(--accent); outline-offset:-4px; border-radius:5px}
.kb-empty-hint{font-size:var(--fs-xs); color:var(--text-faint); padding:9px 4px}

/* иерархия сумм: все выровнены по правому краю, вес/размер = уровень */
.kb-sum{font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; margin-left:auto}
.kb-sum-stage{font-size:var(--fs-md); font-weight:var(--fw-semibold); color:var(--text); letter-spacing:-.01em; min-width:120px}
.kb-sum-task{font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text-muted); min-width:120px}

/* task */
.kb-task{padding:9px 0; border-radius:6px; transition:background .12s}
.kb-task-active{background:var(--surface-sunken)}
.kb-task-active > .kb-task-body{border-left-color:var(--accent)}
.kb-task-head{display:flex; align-items:center; gap:10px; margin-bottom:1px}
.kb-task-name{flex:1}
.kb-task-body{padding-left:20px; border-left:1px solid var(--line-strong); margin-top:3px; min-height:4px}
.kb-link-btn{display:inline-flex; align-items:center; gap:5px; background:none; border:none; color:var(--text-muted);
  font-size:var(--fs-xs); font-weight:var(--fw-medium); cursor:pointer; padding:4px 0 0 20px}
.kb-link-btn:hover{color:var(--accent)}

/* subtask */
.kb-subtask{background:var(--surface-sunken); border:1px solid var(--line); border-radius:6px; padding:6px 9px; margin:5px 0; transition:border-color .12s}
.kb-subtask-active{border-color:var(--accent)}
.kb-subtask-active > .kb-subtask-body{border-left-color:var(--accent)}
.kb-subtask-head{display:flex; align-items:center; gap:8px; margin-bottom:1px}
.kb-subtask-body{padding-left:14px; border-left:1px solid var(--line-strong); margin-top:2px}

/* executor row — заметность через структуру (отступ, размер), не через цвет */
.kb-erow-group{padding:3px 6px 3px 10px; border-radius:6px; transition:background .12s; cursor:default; border:1px solid transparent}
.kb-erow-group:hover{background:var(--surface-sunken)}
/* активная строка — только чуть тёмный фон, без цветной черты и рамки */
.kb-erow-group-active{background:#F5F7FA}
/* приём тега/кубика — тончайшая нейтральная рамка, не акцентная */
.kb-erow-group-over{background:var(--surface-sunken); border-color:var(--line)}
/* появление нового исполнителя — короткая мягкая вспышка и угасание */
.kb-erow-flash{animation:kbFlash .3s ease-out}
@keyframes kbFlash{
  0%{background:var(--accent-soft)}
  100%{background:transparent}
}
.kb-erow{display:flex; align-items:flex-start; gap:10px}
.kb-erow-tags{flex:1; min-width:0; display:flex; flex-wrap:wrap; gap:5px; align-items:center; padding:2px 0}
.kb-erow-empty{font-size:var(--fs-xs); color:var(--text-faint); padding:3px 0}
.kb-erow-amount{flex-shrink:0; min-width:120px; display:flex; justify-content:flex-end; align-items:center; padding-top:2px}
.kb-erow-sum{font-size:var(--fs-xs); font-weight:var(--fw-regular); color:var(--text-muted); font-variant-numeric:tabular-nums; white-space:nowrap}
.kb-erow-sum-muted{color:var(--text-faint)}
.kb-amount-input{max-width:120px; text-align:right; font-size:var(--fs-sm); font-weight:var(--fw-medium)}
.kb-erow-del{flex-shrink:0; margin-top:2px}

/* tag chip on executor */
.kb-tag{position:relative; display:inline-flex; align-items:center; gap:5px; border:1px solid var(--line-strong);
  border-radius:5px; padding:3px 5px 3px 7px; background:var(--surface); font-size:var(--fs-xs); max-width:100%}
.kb-tag-empty{border-style:dashed; background:transparent}
.kb-tag-filled{cursor:grab}
.kb-tag-filled:active{cursor:grabbing}
.kb-tag-ic{color:var(--text-faint); flex-shrink:0}
.kb-tag-val{font-weight:var(--fw-medium); color:var(--text); cursor:pointer; white-space:nowrap}
.kb-tag-placeholder{background:none; border:none; color:var(--text-muted); font-size:var(--fs-xs); cursor:pointer; padding:0; font-family:inherit; white-space:nowrap}
.kb-tag-input{border:none; background:transparent; outline:none; font-size:var(--fs-xs); font-weight:var(--fw-medium);
  color:var(--text); font-family:inherit; min-width:70px; width:auto; padding:0}
.kb-tag-input::placeholder{color:var(--text-faint); font-weight:var(--fw-regular)}
.kb-tag-x{background:none; border:none; color:var(--text-faint); cursor:pointer; padding:1px; border-radius:3px; display:flex; flex-shrink:0}
.kb-tag-x:hover{color:var(--text); background:var(--surface-sunken)}
.kb-suggest-tagstates{min-width:150px}

/* payment inline (hourly/shift) — справа от тегов, на той же строке (п.4) */
.kb-payinline{display:inline-flex; align-items:center; gap:4px}
.kb-payinline .kb-input-num{max-width:64px}
.kb-payinline-unit{font-size:var(--fs-2xs); color:var(--text-muted); font-weight:var(--fw-medium); white-space:nowrap}
.kb-payinline-x{color:var(--text-faint); font-size:var(--fs-xs); padding:0 1px}

/* inputs */
.kb-input, .kb-select{border:1px solid transparent; background:transparent; border-radius:4px; padding:4px 6px;
  font-size:var(--fs-base); font-weight:var(--fw-regular); color:var(--text); outline:none; width:100%; font-family:inherit; transition:.15s}
.kb-input:hover, .kb-select:hover{border-color:var(--line)}
.kb-input:focus, .kb-select:focus{border-color:var(--accent); background:var(--surface)}
.kb-input::placeholder{color:var(--text-faint)}
.kb-input-medium{font-weight:var(--fw-medium); font-size:var(--fs-md)}
.kb-input-flex{flex:1; min-width:0}
.kb-input-num{font-variant-numeric:tabular-nums; text-align:right; max-width:74px; border:1px solid var(--line); background:var(--surface)}

/* autocomplete / dropdowns */
.kb-autocomplete{position:relative; flex:1; min-width:0}
.kb-suggest{position:absolute; top:calc(100% + 3px); left:0; z-index:40; min-width:100%;
  background:var(--surface); border:1px solid var(--line-strong); border-radius:6px; box-shadow:0 6px 20px rgba(26,34,48,.1);
  max-height:230px; overflow-y:auto; padding:3px}
.kb-suggest-states{left:0; right:auto; min-width:180px}
.kb-suggest-item{padding:7px 9px; font-size:var(--fs-sm); font-weight:var(--fw-regular); border-radius:4px; cursor:pointer; color:var(--text); white-space:nowrap}
.kb-suggest-item:hover{background:var(--accent-soft); color:var(--accent)}
.kb-state-item{cursor:grab}
.kb-state-item:active{cursor:grabbing}

/* icon button */
.kb-icon-btn{display:flex; align-items:center; justify-content:center; background:none; border:none; color:var(--text-faint);
  cursor:pointer; padding:4px; border-radius:5px; transition:.15s; flex-shrink:0}
.kb-icon-btn:hover{color:var(--text); background:var(--accent-soft)}

/* canvas dropzone */
.kb-dropzone{display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; text-align:center;
  color:var(--text-faint); border:1px dashed var(--line); border-radius:8px; padding:16px; font-size:var(--fs-sm); transition:.15s}
.kb-dropzone-empty{padding:52px 20px; font-size:var(--fs-base); color:var(--text-muted)}
.kb-dropzone.kb-dropzone-over{background:var(--accent-soft); border-color:var(--accent); color:var(--accent)}

/* dashboard */
.kb-dashboard{max-width:1080px; margin:0 auto; padding:32px 24px}
.kb-board{display:grid; grid-template-columns:repeat(auto-fill,minmax(176px,1fr)); gap:12px}
.kb-card{position:relative; aspect-ratio:1/1; background:var(--surface); border:1px solid var(--line); border-radius:8px;
  padding:15px; display:flex; flex-direction:column; gap:5px; cursor:pointer; transition:border-color .15s}
.kb-card:hover{border-color:var(--line-strong)}
.kb-card-icon{color:var(--text-faint)}
.kb-card-name{font-weight:var(--fw-semibold); font-size:var(--fs-base); margin-top:auto; color:var(--text); letter-spacing:-.01em}
.kb-card-sum{font-weight:var(--fw-semibold); font-size:var(--fs-lg); color:var(--text); font-variant-numeric:tabular-nums; letter-spacing:-.01em}
.kb-card-meta{font-size:var(--fs-xs); color:var(--text-muted)}
.kb-card-del{position:absolute; top:8px; right:8px; background:none; border:none; color:var(--text-faint); border-radius:4px;
  padding:4px; cursor:pointer; opacity:0; transition:.15s}
.kb-card:hover .kb-card-del{opacity:1}
.kb-card-del:hover{color:var(--text)}
.kb-card-new{align-items:center; justify-content:center; border-style:dashed; color:var(--text-muted); font-weight:var(--fw-medium); font-size:var(--fs-sm); gap:7px}
.kb-card-new:hover{border-color:var(--accent); color:var(--accent)}

/* modal */
.kb-modal-overlay{position:fixed; inset:0; background:rgba(26,34,48,.3); backdrop-filter:blur(2px);
  display:flex; align-items:center; justify-content:center; z-index:100; padding:20px}
.kb-modal{position:relative; background:var(--bg-elevated); border:1px solid var(--line-strong); border-radius:10px;
  padding:24px 22px; max-width:340px; width:100%; text-align:center}
.kb-modal-close{position:absolute; top:10px; right:10px; background:none; border:none; color:var(--text-muted); cursor:pointer; padding:5px; border-radius:5px}
.kb-modal-close:hover{color:var(--text)}
.kb-modal-icon{color:var(--text-muted); display:flex; justify-content:center; margin-bottom:9px}
.kb-modal h3{font-size:var(--fs-md); font-weight:var(--fw-semibold); margin-bottom:4px; letter-spacing:-.01em}
.kb-modal p{font-size:var(--fs-base); color:var(--text-muted); margin-bottom:4px; line-height:1.5}
.kb-modal-sub{font-size:var(--fs-xs)}
`;
