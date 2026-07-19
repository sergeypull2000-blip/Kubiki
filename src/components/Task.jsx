import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Bookmark } from "lucide-react";
import { fmt } from "../utils.js";
import { taskSum } from "../calculations.js";
import { DND_TYPES, useDragSource, useDropTarget, makeExecutor, moveTask, withTask, moveExecutor, patchExecutorIn, withExecutorList } from "../store.js";
import { SuggestInput } from "./SuggestInput.jsx";
import { ExecutorRow } from "./Executor.jsx";

/* ============================================================
   Задача
   ============================================================ */
export function TaskBlock({ task, stageId, dispatch, taskDict, taskFeatured,
  activeTaskId, activeExecutorId, onActivateTask, onActivateExecutor,
  onPatch, onRemove,
  onSaveTaskTemplate, onSavePerformerTemplate,
  taskTemplates, onApplyTaskTemplate, performerTemplates, onApplyPerformerTemplate }) {
  const total = taskSum(task);
  const isActive = activeTaskId === task.id && !activeExecutorId;
  const [justAddedId, setJustAddedId] = useState(null);
  const { isDragging, dragHandlers } = useDragSource(DND_TYPES.TASK, { moveTaskId: task.id });
  const { isOver: isTaskOver, dropHandlers: taskDropHandlers } = useDropTarget(DND_TYPES.TASK, (payload) => {
    if (payload?.templateTaskId) {
      const template = taskTemplates?.find((item) => item.id === payload.templateTaskId);
      if (template && onApplyTaskTemplate) onApplyTaskTemplate(template, stageId);
    } else if (payload?.moveTaskId) {
      dispatch((p) => moveTask(p, payload.moveTaskId, stageId, task.id));
    }
  });

  const flashExecutor = (id) => {
    setJustAddedId(id);
    setTimeout(() => setJustAddedId((cur) => (cur === id ? null : cur)), 300);
  };

  const addExecutor = () => {
    const executor = makeExecutor();
    dispatch((p) => withTask(p, stageId, task.id, (t) => ({ ...t, executors: [...t.executors, executor] })));
    onActivateExecutor(stageId, task.id, executor.id);
    flashExecutor(executor.id);
  };

  const { isOver, dropHandlers } = useDropTarget(DND_TYPES.EXECUTOR, (payload) => {
    if (payload && payload.templateExecutorId) {
      const tpl = performerTemplates?.find((t) => t.id === payload.templateExecutorId);
      if (tpl && onApplyPerformerTemplate) {
        onApplyPerformerTemplate(tpl, stageId, task.id);
      }
    } else if (payload && payload.moveExecutorId) {
      // перенос существующего исполнителя в эту задачу (со всеми кубиками)
      dispatch((p) => moveExecutor(p, payload.moveExecutorId, stageId, task.id));
      onActivateExecutor(stageId, task.id, payload.moveExecutorId);
      flashExecutor(payload.moveExecutorId);
    } else {
      addExecutor(); // новый из палитры
    }
  });

  const patchExecutor = (executorId, patch) =>
    dispatch((p) => patchExecutorIn(p, stageId, task.id, executorId, patch));
  const removeExecutor = (executorId) =>
    dispatch((p) => withExecutorList(p, stageId, task.id, (list) => list.filter((e) => e.id !== executorId)));

  const onTaskMouseDown = (e) => { e.stopPropagation(); onActivateTask(stageId, task.id); };

  return (
    <div className={"kb-task" + (isActive ? " kb-task-active" : "") + (isOver ? " kb-task-over" : "") + (isTaskOver ? " kb-task-reorder-over" : "") + (isDragging ? " kb-task-dragging" : "")}
      onMouseDown={onTaskMouseDown} {...taskDropHandlers}>
      <div className="kb-task-head" {...dragHandlers} {...dropHandlers} title="Перетащите строку, чтобы переставить задачу"
        onMouseDownCapture={(event) => { event.currentTarget.draggable = !event.target.closest("input, textarea, button, select"); }}
        onMouseUp={(event) => { event.currentTarget.draggable = true; }}>
        <button type="button" className="kb-icon-btn kb-task-collapse" onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onPatch({ collapsed: !task.collapsed }); }}
          title={task.collapsed ? "Развернуть задачу" : "Свернуть задачу"}>
          {task.collapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
        </button>
        <SuggestInput className="kb-input kb-input-medium kb-task-name" value={task.name}
          dictionary={taskDict || []} featured={taskFeatured} placeholder="Название задачи…"
          onChange={(v) => onPatch({ name: v })} />
        {task.executors.length === 0 ? (
          <span className="kb-sum kb-sum-task kb-task-directcost">
            <input className="kb-input kb-input-num kb-task-directcost-input" value={task.directCost ?? ""} placeholder="0"
              title="Стоимость задачи напрямую — пока у неё нет исполнителей"
              onChange={(e) => onPatch({ directCost: e.target.value === "" ? null : e.target.value })}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
            <span className="kb-task-directcost-cur">₽</span>
          </span>
        ) : (
          <span className="kb-sum kb-sum-task">{fmt(total)} ₽</span>
        )}
        {onSaveTaskTemplate && (
          <button type="button" className="kb-icon-btn" onClick={() => onSaveTaskTemplate(task)} title="Сохранить задачу как шаблон">
            <Bookmark size={13} strokeWidth={1.5} />
          </button>
        )}
        <button type="button" className="kb-icon-btn" onClick={onRemove} title="Удалить задачу">
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      {!task.collapsed && (
      <div className="kb-task-body" {...dropHandlers}>
        {task.executors.map((e) => (
          <ExecutorRow key={e.id} executor={e}
            active={activeExecutorId === e.id}
            flash={justAddedId === e.id}
            stageId={stageId} taskId={task.id}
            onActivate={() => onActivateExecutor(stageId, task.id, e.id)}
            onPatch={(patch) => patchExecutor(e.id, patch)}
            onRemove={() => removeExecutor(e.id)}
            onSavePerformerTemplate={onSavePerformerTemplate} />
        ))}
        <button type="button" className="kb-add-btn" onClick={(e) => { e.stopPropagation(); addExecutor(); }} onMouseDown={(e) => e.stopPropagation()}>
          <Plus size={13} strokeWidth={1.75} /> Новый исполнитель
        </button>
      </div>
      )}
    </div>
  );
}
