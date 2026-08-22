import { stagesOf } from "../src/sheets.js";

const scalar = (value) => value == null ? null : (typeof value === "number" ? value : String(value));
const payment = (executor) => (executor?.tags || []).find((tag) => tag?.key === "payment")?.payment || {};
const tagValue = (executor, key) => (executor?.tags || []).find((tag) => tag?.key === key)?.value || null;

export function feedbackProjection(project) {
  const stages = stagesOf(project).map((stage) => ({
    id: String(stage?.id || ""), name: String(stage?.name || ""),
    tasks: (stage?.tasks || []).map((task) => ({
      id: String(task?.id || ""), name: String(task?.name || ""),
      quantity: scalar(task?.quantity), duration: scalar(task?.duration), unit: scalar(task?.unit), directCost: scalar(task?.directCost),
      executors: (task?.executors || []).map((executor) => ({
        id: String(executor?.id || ""), role: scalar(tagValue(executor, "role")), grade: scalar(tagValue(executor, "grade")),
        amount: scalar(executor?.amount), paymentType: scalar(payment(executor).type), rate: scalar(payment(executor).rate),
        units: scalar(payment(executor).units), hours: scalar(payment(executor).hours), shifts: scalar(payment(executor).shifts),
      })),
    })),
  }));
  return { stages, counts: { stages: stages.length, tasks: stages.reduce((n, s) => n + s.tasks.length, 0), executors: stages.reduce((n, s) => n + s.tasks.reduce((m, t) => m + t.executors.length, 0), 0) } };
}

const index = (items) => new Map(items.map((item) => [item.id, item]));
const change = (changes, type, id, field, before, after) => { if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ type, id, field, before, after }); };

export function structuralDiff(before, after) {
  const changes = [], beforeStages = index(before.stages), afterStages = index(after.stages);
  for (const [id] of beforeStages) if (!afterStages.has(id)) changes.push({ type: "stage_removed", id });
  for (const [id] of afterStages) if (!beforeStages.has(id)) changes.push({ type: "stage_added", id });
  for (const [stageId, oldStage] of beforeStages) {
    const newStage = afterStages.get(stageId); if (!newStage) continue;
    const oldTasks = index(oldStage.tasks), newTasks = index(newStage.tasks);
    for (const [id] of oldTasks) if (!newTasks.has(id)) changes.push({ type: "task_removed", id, stageId });
    for (const [id] of newTasks) if (!oldTasks.has(id)) changes.push({ type: "task_added", id, stageId });
    for (const [taskId, oldTask] of oldTasks) {
      const newTask = newTasks.get(taskId); if (!newTask) continue;
      for (const field of ["duration", "quantity", "unit", "directCost"]) change(changes, `${field}_changed`, taskId, field, oldTask[field], newTask[field]);
      const oldExecutors = index(oldTask.executors), newExecutors = index(newTask.executors);
      for (const [executorId, oldExecutor] of oldExecutors) {
        const next = newExecutors.get(executorId); if (!next) continue;
        for (const field of ["role", "grade", "amount", "paymentType", "rate", "units", "hours", "shifts"]) change(changes, `${field}_changed`, executorId, field, oldExecutor[field], next[field]);
      }
    }
  }
  return { changes, counts: { before: before.counts, after: after.counts } };
}

export const projectionsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
