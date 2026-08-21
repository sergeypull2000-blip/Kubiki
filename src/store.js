import { useState } from "react";
import { uid } from "./utils.js";
import { STAGE_PRESETS, CUSTOM_STAGE } from "./constants.js";
import { DEFAULT_EXPORT_SETTINGS } from "./exportEstimate.js";
import { DEFAULT_SHEET_NAME, activeSheet, legacySheetId, sheetsOf, stagesOf } from "./sheets.js";

export const PROJECT_DATA_VERSION = 1;

function normalizeProjectDataVersion(value) {
  return Number.isInteger(value) && value > 0 ? value : PROJECT_DATA_VERSION;
}

/* ---------- factories ----------
   Тег на исполнителе: { id, key, value, payment? }
   - value: строка-состояние (для text/combo/select). "" = пустой тег.
   - payment: { type, rate, units, hours, shifts } — только для tag.key === "payment".
     Сумма фиксированной ставки вводится напрямую в поле executor.amount. */
export const makeTag = (key, value = "") => {
  const tag = { id: uid(), key, value };
  if (key === "payment") tag.payment = { type: value || "", rate: "", units: "", hours: "", shifts: "" };
  return tag;
};
export const makeExecutor = () => ({ id: uid(), tags: [makeTag("role"), makeTag("payment")], amount: "", performerId: null, performerSnapshot: null });
export const makeTask = () => ({ id: uid(), name: "", exportComment: "", executors: [], markupOverride: null, collapsed: false, directCost: null });
export const makeStage = (preset) => ({
  id: uid(), presetKey: preset.key, name: preset.name, tasks: [], collapsed: false,
});
export const makeSheet = (name = DEFAULT_SHEET_NAME) => ({ id: uid(), name, stages: [] });
export const makeProject = () => {
  const sheet = makeSheet();
  return { id: uid(), name: "Новый проект", dataVersion: PROJECT_DATA_VERSION, sheets: [sheet], activeSheetId: sheet.id, stages: sheet.stages, globalMarkup: 25, markupMode: "embedded", tax: { type: "osno", percent: "", visible: true }, vat: { percent: "" }, branding: { logo: "", studioName: "", contacts: "" }, exportSettings: { ...DEFAULT_EXPORT_SETTINGS } };
};

export function makeProjectFromEstimate(stages, meta = {}) {
  const project = makeProject();
  project.createdAt = new Date().toISOString();
  const withStages = withActiveSheetStages(project, stages);
  if (Number.isFinite(meta.globalMarkup)) withStages.globalMarkup = meta.globalMarkup;
  const previewName = typeof meta.projectName === "string" ? meta.projectName.trim() : "";
  if (previewName) withStages.name = previewName;
  if (meta.generationMetadata) withStages.metadata = { ...withStages.metadata, aiGeneration: meta.generationMetadata };
  return normalizeProject(withStages);
}

export function applyConfirmedEstimate(project, stages, meta = {}) {
  const source = normalizeProject(project);
  const previewName = typeof meta.projectName === "string" ? meta.projectName.trim() : "";
  const renameInitialProject = meta.generationScope === "whole_project" && source.stages.length === 0 && previewName;
  const withStages = withActiveSheetStages(source, [...source.stages, ...stages]);
  return normalizeProject({
    ...withStages,
    ...(renameInitialProject ? { name: previewName } : {}),
    ...(Number.isFinite(meta.globalMarkup) ? { globalMarkup: meta.globalMarkup } : {}),
    ...(meta.generationMetadata ? { metadata: { ...source.metadata, aiGeneration: meta.generationMetadata } } : {}),
  });
}

function normalizeStage(stage) {
  const stageSource = stage && typeof stage === "object" && !Array.isArray(stage) ? stage : {};
  const tasks = Array.isArray(stageSource.tasks) ? stageSource.tasks : [];
  return {
    ...stageSource,
    tasks: tasks.map((task) => {
      const taskSource = task && typeof task === "object" && !Array.isArray(task) ? task : {};
      return {
        ...taskSource,
        executors: Array.isArray(taskSource.executors) ? taskSource.executors : [],
      };
    }),
  };
}

function normalizeSheet(sheet) {
  const source = sheet && typeof sheet === "object" && !Array.isArray(sheet) ? sheet : {};
  return {
    ...source,
    id: typeof source.id === "string" && source.id ? source.id : uid(),
    name: typeof source.name === "string" && source.name ? source.name : DEFAULT_SHEET_NAME,
    stages: Array.isArray(source.stages) ? source.stages.map(normalizeStage) : [],
  };
}

/** Normalize persisted or external project data for safe runtime use.
    Migrates legacy stages into a single default sheet (idempotent, with a
    deterministic sheet id derived from project.id) and keeps stages as the
    active sheet's stages so single-sheet code keeps working unchanged. */
export function normalizeProject(project) {
  const source = project && typeof project === "object" && !Array.isArray(project) ? project : {};
  const { stages: _legacyStages, sheets: _rawSheets, ...rest } = source;
  const legacyStages = Array.isArray(_legacyStages) ? _legacyStages : [];
  const rawSheets = Array.isArray(_rawSheets) ? _rawSheets : [];

  let sheets;
  if (rawSheets.length) {
    sheets = rawSheets.map(normalizeSheet);
  } else {
    sheets = [{ id: legacySheetId(source.id), name: DEFAULT_SHEET_NAME, stages: legacyStages.map(normalizeStage) }];
  }

  const requestedActiveId = source.activeSheetId;
  const active = sheets.find((sheet) => sheet.id === requestedActiveId) || sheets[0] || null;

  return {
    ...rest,
    dataVersion: normalizeProjectDataVersion(source.dataVersion),
    sheets,
    ...(active ? { activeSheetId: active.id } : {}),
    stages: active ? active.stages : [],
  };
}

/* ---------- immutable project mutators ---------- */
/* Every stage mutator writes BOTH the active sheet and the derived `stages`
   view, keeping the invariant `project.stages === activeSheet(project).stages`. */
function withActiveSheetStages(project, nextStages) {
  const sheets = sheetsOf(project);
  const active = activeSheet(project);
  if (!active) {
    const sheet = makeSheet();
    return { ...project, sheets: [sheet], activeSheetId: sheet.id, stages: nextStages };
  }
  return {
    ...project,
    stages: nextStages,
    sheets: sheets.map((sheet) => (sheet.id === active.id ? { ...sheet, stages: nextStages } : sheet)),
  };
}

export const withStages = (project, nextStages) => withActiveSheetStages(project, nextStages);

export function setSheetStages(project, sheetId, stages) {
  return {
    ...project,
    sheets: sheetsOf(project).map((sheet) => (sheet.id === sheetId ? { ...sheet, stages } : sheet)),
  };
}

export const mapStage = (project, stageId, fn) =>
  withActiveSheetStages(project, stagesOf(project).map((s) => (s.id === stageId ? fn(s) : s)));
export const withTask = (project, stageId, taskId, fn) =>
  mapStage(project, stageId, (s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === taskId ? fn(t) : t)),
  }));
export const withExecutorList = (project, stageId, taskId, fn) =>
  withTask(project, stageId, taskId, (t) => ({ ...t, executors: fn(t.executors) }));
export const patchExecutorIn = (project, stageId, taskId, executorId, patch) =>
  withExecutorList(project, stageId, taskId, (list) =>
    list.map((e) => (e.id === executorId ? { ...e, ...patch } : e))
  );

/* ---------- sheet operations ---------- */
export function createSheet(project, name = DEFAULT_SHEET_NAME) {
  const source = normalizeProject(project);
  const sheet = makeSheet(name);
  return { ...source, sheets: [...source.sheets, sheet], activeSheetId: sheet.id, stages: sheet.stages };
}
export function renameSheet(project, sheetId, name) {
  const source = normalizeProject(project);
  return { ...source, sheets: source.sheets.map((sheet) => (sheet.id === sheetId ? { ...sheet, name } : sheet)) };
}
export function switchSheet(project, sheetId) {
  const source = normalizeProject(project);
  const target = source.sheets.find((sheet) => sheet.id === sheetId);
  if (!target) return source;
  return { ...source, activeSheetId: sheetId, stages: target.stages };
}
export function duplicateSheet(project, sheetId) {
  const source = normalizeProject(project);
  const original = source.sheets.find((sheet) => sheet.id === sheetId);
  if (!original) return source;
  const copy = cloneSheetWithFreshIds(original);
  copy.name = `${original.name} (копия)`;
  const index = source.sheets.findIndex((sheet) => sheet.id === sheetId);
  const sheets = [...source.sheets];
  sheets.splice(index + 1, 0, copy);
  return { ...source, sheets, activeSheetId: copy.id, stages: copy.stages };
}
export function deleteSheet(project, sheetId) {
  const source = normalizeProject(project);
  if (source.sheets.length <= 1) return source;
  const sheets = source.sheets.filter((sheet) => sheet.id !== sheetId);
  if (sheets.length === source.sheets.length) return source;
  const nextActive = source.activeSheetId === sheetId
    ? sheets[0]
    : source.sheets.find((sheet) => sheet.id === source.activeSheetId) || sheets[0];
  return { ...source, sheets, activeSheetId: nextActive.id, stages: nextActive.stages };
}

/* ============================================================
   === DND LAYER (заменить на dnd-kit при переносе) ===

   dataTransfer.getData() надёжно читается только внутри самого
   события drop; сам payload храним рядом в JS-переменной
   dndPayload.current, а dataTransfer используем только чтобы (а)
   запустить нативный drag и (б) на dragover понять тип объекта
   через e.dataTransfer.types, не трогая данные.

   Типы:
     STAGE    — этап (создать из пресета / переставить существующий)
     TASK     — задача (создать в этапе)
     EXECUTOR — исполнитель (создать в задаче)
     TAG      — тег «кубик исполнителя»: либо пустой, либо с состоянием,
                либо перенос установленного тега с другого исполнителя (копия)

   При переносе на dnd-kit: DND_TYPES и insertStage() остаются как есть,
   useDragSource/useDropTarget заменяются на useDraggable/useDroppable.
   ============================================================ */

export const DND_TYPES = {
  STAGE: "application/x-kubiki-stage",
  TASK: "application/x-kubiki-task",
  EXECUTOR: "application/x-kubiki-executor",
  PERFORMER: "application/x-kubiki-performer",
  TAG: "application/x-kubiki-tag",
};

// Обёртка-контейнер вместо обычной module-level переменной: ES-модули не
// позволяют импортёру переприсваивать импортированный биндинг напрямую
// (dndPayload = ... в другом файле — SyntaxError), а строка исполнителя в
// kubiki.jsx тоже пишет в этот payload напрямую (перетаскивание всей строки).
// Мутировать поле .current у shared-объекта можно из любого модуля.
export const dndPayload = { current: null };

// Найти исполнителя по id в любом этапе/задаче → { executor, stageId, taskId }
export function findExecutor(project, executorId) {
  for (const s of stagesOf(project)) {
    for (const t of s.tasks) {
      const e = t.executors.find((x) => x.id === executorId);
      if (e) return { executor: e, stageId: s.id, taskId: t.id };
    }
  }
  return null;
}

// Перенести существующего исполнителя (со всеми тегами) в задачу-цель.
// Если цель = исходная задача — ничего не меняем.
export function moveExecutor(project, executorId, toStageId, toTaskId) {
  const found = findExecutor(project, executorId);
  if (!found) return project;
  if (found.taskId === toTaskId) return project;
  const moving = found.executor;
  return withActiveSheetStages(project, stagesOf(project).map((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      let executors = t.executors;
      if (t.id === found.taskId) executors = executors.filter((e) => e.id !== executorId);
      if (t.id === toTaskId) executors = [...executors, moving];
      return executors === t.executors ? t : { ...t, executors };
    }),
  })));
}

// Переставить задачу перед задачей-целью либо в конец этапа. Работает как
// внутри одного этапа, так и между этапами, сохраняя всю вложенную структуру.
export function moveTask(project, taskId, toStageId, beforeTaskId = null) {
  let moving = null;
  let fromStageId = null;
  for (const stage of stagesOf(project)) {
    const task = stage.tasks.find((item) => item.id === taskId);
    if (task) { moving = task; fromStageId = stage.id; break; }
  }
  if (!moving || taskId === beforeTaskId) return project;
  if (!stagesOf(project).some((stage) => stage.id === toStageId)) return project;

  return withActiveSheetStages(project, stagesOf(project).map((stage) => {
    let tasks = stage.tasks;
    if (stage.id === fromStageId) tasks = tasks.filter((task) => task.id !== taskId);
    if (stage.id === toStageId) {
      tasks = stage.id === fromStageId ? tasks : [...tasks];
      const targetIndex = beforeTaskId ? tasks.findIndex((task) => task.id === beforeTaskId) : -1;
      tasks.splice(targetIndex < 0 ? tasks.length : targetIndex, 0, moving);
    }
    return tasks === stage.tasks ? stage : { ...stage, tasks };
  }));
}

// Глубокая копия исполнителя с новыми id (для Ctrl+V и копирования).
export function cloneExecutor(executor) {
  return {
    ...executor,
    id: uid(),
    tags: (executor.tags || []).map((tg) => ({
      ...tg,
      id: uid(),
      ...(tg.payment ? { payment: { ...tg.payment } } : {}),
    })),
  };
}

/* Deep copy with fresh ids for sheet duplication. Performer linkage
   (performerId / performerSnapshot) is intentionally preserved. */
export function cloneTaskWithFreshIds(task) {
  return { ...task, id: uid(), executors: (task.executors || []).map(cloneExecutor) };
}
export function cloneStageWithFreshIds(stage) {
  return { ...stage, id: uid(), tasks: (stage.tasks || []).map(cloneTaskWithFreshIds) };
}
export function cloneSheetWithFreshIds(sheet) {
  return { ...sheet, id: uid(), stages: (sheet.stages || []).map(cloneStageWithFreshIds) };
}

export function insertStage(project, payload, beforeStageId) {
  let stages = [...stagesOf(project)];
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
  return withActiveSheetStages(project, stages);
}

// Применить входящий тег к списку тегов исполнителя.
// Правила: name/payment уникальны (заменяем существующий), остальные — тоже
// держим по одному на исполнителя для чистоты строки (заменяем).
export function applyTagToExecutor(tags, incoming) {
  const fresh = incoming.fromExecutor
    ? { id: uid(), key: incoming.key, value: incoming.value, ...(incoming.payment ? { payment: { ...incoming.payment } } : {}) }
    : makeTag(incoming.key, incoming.value || "");
  if (incoming.fromExecutor && incoming.payment) fresh.payment = { ...incoming.payment };
  const rest = tags.filter((t) => t.key !== incoming.key);
  // порядок тегов — по TAG_DEFS, чтобы строка не «прыгала»
  const next = [...rest, fresh];
  const order = ["role", "payment", "name", "spec", "grade", "soft", "tax"];
  next.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return next;
}

export function useDragSource(type, getPayload) {
  const [isDragging, setIsDragging] = useState(false);
  function handleDragStart(e) {
    dndPayload.current = { type, payload: typeof getPayload === "function" ? getPayload() : getPayload };
    e.dataTransfer.setData(type, "1");
    e.dataTransfer.setData("text/plain", "kubiki");
    e.dataTransfer.effectAllowed = "all";
    setIsDragging(true);
    e.stopPropagation();
  }
  function handleDragEnd() {
    dndPayload.current = null;
    setIsDragging(false);
  }
  return { isDragging, dragHandlers: { draggable: true, onDragStart: handleDragStart, onDragEnd: handleDragEnd } };
}

export function useDropTarget(type, onDrop) {
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
    const stashed = dndPayload.current;
    dndPayload.current = null;
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
