import { useState, useRef } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { fmt } from "../utils.js";
import { stageSum } from "../calculations.js";
import { useOutsideClose } from "../hooks.js";
import { STAGE_PRESETS, CUSTOM_STAGE, stageTaskDictionary, stageFeaturedTasks } from "../constants.js";
import { DND_TYPES, useDragSource, useDropTarget, insertStage, mapStage, makeTask, withTask } from "../store.js";
import { TaskBlock } from "./Task.jsx";

/* ============================================================
   Поле названия этапа: свободный ввод + выпадающий список типов.
   Выбор пункта проставляет и название, и presetKey (тип этапа),
   от которого позже зависит словарь задач этого этапа (п.1).
   Пресеты работают как подсказки; можно вписать любое своё имя.
   ============================================================ */
function StageNameInput({ value, onPick, onType }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useOutsideClose(wrapRef, () => setOpen(false));
  const q = (value || "").trim().toLowerCase();
  const matches = q.length > 0
    ? STAGE_PRESETS.filter((p) => p.name.toLowerCase().includes(q))
    : STAGE_PRESETS;
  return (
    <div className="kb-autocomplete kb-input-flex" ref={wrapRef}>
      <input
        className="kb-input kb-stage-name"
        placeholder="Название этапа…"
        value={value}
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter") setOpen(false); }}
      />
      {open && matches.length > 0 && (
        <div className="kb-suggest">
          {matches.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.key} className="kb-suggest-item kb-stage-suggest-item"
                onMouseDown={(e) => { e.stopPropagation(); onPick(p); setOpen(false); }}>
                <Icon size={14} strokeWidth={1.5} />
                <span>{p.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Зона дропа этапа на листе
   ============================================================ */
export function CanvasDropZone({ isEmpty, onDropStage, onAddStage }) {
  const { isOver, dropHandlers } = useDropTarget(DND_TYPES.STAGE, onDropStage);
  return (
    <button type="button"
      className={"kb-dropzone kb-dropzone-btn" + (isEmpty ? " kb-dropzone-empty" : "") + (isOver ? " kb-dropzone-over" : "")}
      onClick={onAddStage} {...dropHandlers}>
      <Plus size={isEmpty ? 18 : 15} strokeWidth={1.75} />
      <span>Новый этап</span>
    </button>
  );
}

/* ============================================================
   Этап
   ============================================================ */
export function StageCard({ stage, dispatch, activeStageId, activeTaskId, activeExecutorId, onActivateStage, onActivateTask, onActivateExecutor, onRemove }) {
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
  const addTask = (e) => {
    if (e) e.stopPropagation();
    const task = makeTask();
    dispatch((p) => mapStage(p, stage.id, (s) => ({ ...s, tasks: [...s.tasks, task] })));
    onActivateTask(stage.id, task.id);
  };

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
        <StageNameInput
          value={stage.name}
          onPick={(preset) => patchStage({ name: preset.name, presetKey: preset.key })}
          onType={(val) => {
            const match = STAGE_PRESETS.find((p) => p.name.toLowerCase() === val.trim().toLowerCase());
            patchStage({ name: val, presetKey: match ? match.key : "custom" });
          }}
        />
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
          {stage.tasks.map((t) => (
            <TaskBlock key={t.id} task={t} stageId={stage.id} dispatch={dispatch}
              taskDict={stageTaskDictionary(stage.presetKey)}
              taskFeatured={stageFeaturedTasks(stage.presetKey)}
              activeTaskId={activeTaskId} activeExecutorId={activeExecutorId}
              onActivateTask={onActivateTask} onActivateExecutor={onActivateExecutor}
              onPatch={(patch) => patchTask(t.id, patch)} onRemove={() => removeTask(t.id)} />
          ))}
          <button type="button" className="kb-add-btn" onClick={addTask} onMouseDown={(e) => e.stopPropagation()}>
            <Plus size={13} strokeWidth={1.75} /> Новая задача
          </button>
        </div>
      )}
    </div>
  );
}
