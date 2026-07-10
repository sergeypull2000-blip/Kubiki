import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { fmt } from "../utils.js";
import { taskSum } from "../calculations.js";
import { DND_TYPES, useDropTarget, makeExecutor, withTask, moveExecutor, patchExecutorIn, withExecutorList } from "../store.js";
import { SuggestInput } from "./SuggestInput.jsx";
import { ExecutorRow } from "./Executor.jsx";

/* ============================================================
   Задача
   ============================================================ */
export function TaskBlock({ task, stageId, dispatch, taskDict, taskFeatured, activeTaskId, activeExecutorId, onActivateTask, onActivateExecutor, onPatch, onRemove }) {
  const total = taskSum(task);
  const isActive = activeTaskId === task.id && !activeExecutorId;
  const [justAddedId, setJustAddedId] = useState(null);

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
    if (payload && payload.moveExecutorId) {
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
    <div className={"kb-task" + (isActive ? " kb-task-active" : "") + (isOver ? " kb-task-over" : "")}
      onMouseDown={onTaskMouseDown} {...dropHandlers}>
      <div className="kb-task-head">
        <button type="button" className="kb-icon-btn kb-task-collapse" onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onPatch({ collapsed: !task.collapsed }); }}
          title={task.collapsed ? "Развернуть задачу" : "Свернуть задачу"}>
          {task.collapsed ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronUp size={14} strokeWidth={1.5} />}
        </button>
        <SuggestInput className="kb-input kb-input-medium kb-task-name" value={task.name}
          dictionary={taskDict || []} featured={taskFeatured} placeholder="Название задачи…"
          onChange={(v) => onPatch({ name: v })} />
        <span className="kb-sum kb-sum-task">{fmt(total)} ₽</span>
        <button type="button" className="kb-icon-btn" onClick={onRemove} title="Удалить задачу">
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>

      {!task.collapsed && (
      <div className="kb-task-body">
        {task.executors.map((e) => (
          <ExecutorRow key={e.id} executor={e}
            active={activeExecutorId === e.id}
            flash={justAddedId === e.id}
            stageId={stageId} taskId={task.id}
            onActivate={() => onActivateExecutor(stageId, task.id, e.id)}
            onPatch={(patch) => patchExecutor(e.id, patch)}
            onRemove={() => removeExecutor(e.id)} />
        ))}
        <button type="button" className="kb-add-btn" onClick={(e) => { e.stopPropagation(); addExecutor(); }} onMouseDown={(e) => e.stopPropagation()}>
          <Plus size={13} strokeWidth={1.75} /> Новый исполнитель
        </button>
      </div>
      )}
    </div>
  );
}
