import { useState } from "react";
import { uid } from "./utils.js";
import { STAGE_PRESETS, CUSTOM_STAGE, TAG_DEFS } from "./constants.js";

/* ---------- factories ----------
   Тег на исполнителе: { id, key, value, payment? }
   - value: строка-состояние (для text/combo/select). "" = пустой тег.
   - payment: { type, rate, hours, shifts } — только для tag.key === "payment".
     Сумма фикса вводится напрямую в общее поле «Сумма» → executor.amount. */
export const makeTag = (key, value = "") => {
  const tag = { id: uid(), key, value };
  if (key === "payment") tag.payment = { type: value || "", rate: "", hours: "", shifts: "" };
  return tag;
};
export const makeExecutor = () => ({ id: uid(), tags: [], amount: "" });
export const makeTask = () => ({ id: uid(), name: "", executors: [], markupOverride: null, collapsed: false, directCost: null });
export const makeStage = (preset) => ({
  id: uid(), presetKey: preset.key, name: preset.name, tasks: [], collapsed: false,
});
export const makeProject = () => ({ id: uid(), name: "Новый проект", stages: [], globalMarkup: 25, markupMode: "embedded", tax: { type: "osno", percent: "", visible: true }, vat: { percent: "" }, branding: { logo: "", studioName: "", contacts: "" } });

/* ---------- immutable project mutators ---------- */
export const mapStage = (project, stageId, fn) => ({
  ...project,
  stages: project.stages.map((s) => (s.id === stageId ? fn(s) : s)),
});
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
  for (const s of project.stages) {
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
  return {
    ...project,
    stages: project.stages.map((s) => ({
      ...s,
      tasks: s.tasks.map((t) => {
        let executors = t.executors;
        if (t.id === found.taskId) executors = executors.filter((e) => e.id !== executorId);
        if (t.id === toTaskId) executors = [...executors, moving];
        return executors === t.executors ? t : { ...t, executors };
      }),
    })),
  };
}

// Переставить задачу перед задачей-целью либо в конец этапа. Работает как
// внутри одного этапа, так и между этапами, сохраняя всю вложенную структуру.
export function moveTask(project, taskId, toStageId, beforeTaskId = null) {
  let moving = null;
  let fromStageId = null;
  for (const stage of project.stages) {
    const task = stage.tasks.find((item) => item.id === taskId);
    if (task) { moving = task; fromStageId = stage.id; break; }
  }
  if (!moving || taskId === beforeTaskId) return project;
  if (!project.stages.some((stage) => stage.id === toStageId)) return project;

  return {
    ...project,
    stages: project.stages.map((stage) => {
      let tasks = stage.tasks;
      if (stage.id === fromStageId) tasks = tasks.filter((task) => task.id !== taskId);
      if (stage.id === toStageId) {
        tasks = stage.id === fromStageId ? tasks : [...tasks];
        const targetIndex = beforeTaskId ? tasks.findIndex((task) => task.id === beforeTaskId) : -1;
        tasks.splice(targetIndex < 0 ? tasks.length : targetIndex, 0, moving);
      }
      return tasks === stage.tasks ? stage : { ...stage, tasks };
    }),
  };
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

export function insertStage(project, payload, beforeStageId) {
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
export function applyTagToExecutor(tags, incoming) {
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
