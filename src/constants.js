import {
  Layers, Box, Cpu, Sparkles, Square, Pencil, AlertTriangle,
  Clapperboard, Music, Projector,
  Type, Briefcase, Palette,
  BadgeCheck, Monitor, Wallet, Percent,
} from "lucide-react";

/* ---------- этапы ---------- */
export const STAGE_PRESETS = [
  { key: "preprod", name: "Препродакшн", icon: Sparkles, tasks: [
    "Разработка концепции", "Написание сценария / синопсиса", "Концепт-арт",
    "Раскадровка (сториборд)", "Бордоматик", "Стилкадры / стилфреймы", "Аниматик",
    "Поиск / подбор ассетов", "Поиск референсов",
  ] },
  { key: "setup", name: "Сетап", icon: Projector, tasks: [
    "Подготовка сетапа для мэппинга", "Подготовка сетапа для нестандартного экрана",
  ] },
  { key: "liveaction", name: "Съёмка / гибрид (live-action)", icon: Clapperboard, tasks: [
    "Кеинг / хромакей", "Трекинг камеры", "Матчмувинг", "Ротоскопинг", "Клинап / чистка",
  ] },
  { key: "prod", name: "3D Продакшн", icon: Box,
    featured: ["3D-моделинг", "3D-анимация", "3D-визуализация", "Создание композиции", "Анимация камеры", "Симуляция", "Персонажная анимация"],
    tasks: [
    "3D-моделинг", "3D-анимация", "3D-визуализация", "Скульптинг", "Ретопология",
    "UV-развёртка", "Текстурирование", "Шейдинг / настройка материалов", "Риггинг", "Скиннинг",
    "Настройка сетапа", "Настройка окружения", "Настройка сцены", "Создание композиции",
    "Персонажная анимация", "Анимация объектов", "Анимация камеры", "Симуляция", "FX",
    "Партиклы", "Настройка освещения",
  ] },
  { key: "render", name: "Рендер", icon: Cpu, tasks: [
    "Настройка рендера", "Рендер по пассам", "Рендер-ферма (аренда)", "Аутсорс-рендер",
    "Тестовый рендер", "Финальный рендер",
  ] },
  { key: "comp", name: "Композитинг / пост", icon: Layers, tasks: [
    "Композитинг", "Сборка", "Сборка пассов", "Цветокоррекция", "Монтаж",
    "Моушн-дизайн / 2D-графика", "Титры / плашки / надписи", "Ресайзы / адаптации под форматы",
  ] },
  { key: "sound", name: "Звук", icon: Music, tasks: [
    "Саунд-дизайн", "Звуковые эффекты", "Музыка / подбор трека", "Сведение", "Озвучка / диктор",
  ] },
  { key: "revisions", name: "Правки", icon: Pencil, tasks: [
    "Правки сетапа", "Правки сцены", "Композные правки", "Перерендер",
  ] },
  { key: "forcemajeure", name: "Форс-мажёр", icon: AlertTriangle, tasks: [] },
];
export const CUSTOM_STAGE = { key: "custom", name: "", label: "Новый этап", icon: Square, tasks: [] };

// словарь задач для конкретного этапа по его типу; неизвестный тип → пусто
export const stageTaskDictionary = (presetKey) =>
  (STAGE_PRESETS.find((p) => p.key === presetKey) || CUSTOM_STAGE).tasks || [];
// «избранные» задачи этапа — показываются, пока поле названия пустое.
// Нет featured → показываем весь словарь (прежнее поведение).
export const stageFeaturedTasks = (presetKey) => {
  const preset = STAGE_PRESETS.find((p) => p.key === presetKey);
  return (preset && preset.featured) || null;
};

/* ---------- словари состояний тегов ---------- */
export const ROLE_OPTIONS = [
  "Продюсер", "Арт-директор", "Супервайзер", "Режиссёр",
  "Проджект-менеджер", "Аккаунт-менеджер", "Продакшн-директор", "Креативный директор",
  "3D артист", "2D моушн-дизайнер", "Графический дизайнер",
];

export const SPECIALIZATION_OPTIONS = [
  "Моделлер", "Текстурщик", "Риггер", "Аниматор", "FX / симуляции", "Гудинщик",
  "Композер", "Моушн-дизайнер", "Кеер", "Трекер", "Колорист", "Дженералист",
  "Саунд-дизайнер", "3D артист", "Композитор",
];

export const GRADE_OPTIONS = ["Джун", "Джун+", "Мидл", "Мидл+", "Сениор", "Тим-лид"];

export const SOFTWARE_OPTIONS = [
  "Blender", "Houdini", "Cinema 4D", "Maya", "ZBrush", "Substance Painter",
  "Nuke", "After Effects", "DaVinci Resolve", "Unreal Engine", "Photoshop", "Premiere Pro",
];

export const PAYMENT_OPTIONS = [
  { key: "fix_total", label: "Фикс за всё" },
  { key: "fix_task", label: "Фикс за задачу" },
  { key: "hourly", label: "Почасовая ставка" },
  { key: "shift", label: "Посменная ставка" },
];
export const PAYMENT_LABEL = Object.fromEntries(PAYMENT_OPTIONS.map((p) => [p.key, p.label]));
export const PAY_SHORT = { fix_total: "Фикс за всё", fix_task: "Фикс за задачу", hourly: "Почасовая", shift: "Посменная" };

/* ---------- определения тегов («кубиков исполнителя») ----------
   kind:
     "text"      — свободный ввод (Имя)
     "combo"     — свободный ввод + подсказка из словаря (Специализация)
     "select"    — выбор из фикс. списка (Роль, Грейд, Софт)
     "payment"   — кубик оплаты, несёт расчёт
   value  — строcovое состояние (для payment хранится в payment.*)         */
export const TAG_DEFS = [
  { key: "name",    label: "Имя / название", short: "Имя",           icon: Type,       kind: "text" },
  { key: "role",    label: "Роль",           short: "Роль",          icon: Briefcase,  kind: "select", options: ROLE_OPTIONS },
  { key: "spec",    label: "Специализация",  short: "Специализация", icon: Palette,    kind: "select", options: SPECIALIZATION_OPTIONS },
  { key: "grade",   label: "Грейд",          short: "Грейд",         icon: BadgeCheck, kind: "select", options: GRADE_OPTIONS },
  { key: "soft",    label: "Софт",           short: "Софт",          icon: Monitor,    kind: "select", options: SOFTWARE_OPTIONS },
  { key: "payment", label: "Кубик оплаты",   short: "Оплата",        icon: Wallet,     kind: "payment", options: PAYMENT_OPTIONS },
  { key: "tax",     label: "Налог",          short: "Налог",         icon: Percent,    kind: "tax" },
];
export const TAG_DEF = Object.fromEntries(TAG_DEFS.map((t) => [t.key, t]));
