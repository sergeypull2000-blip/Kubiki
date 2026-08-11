import { projectFinancialCommission, projectMarkupAmount, projectPrice, projectSum, projectTaxAmount, projectTotalWithTax, projectVatAmount } from "../calculations.js";
import { applyAiEditOperations } from "./editOperations.js";
import { projectRevision } from "./projectRevision.js";

function counts(project) {
  let tasks = 0, executors = 0;
  for (const stage of project?.stages || []) for (const task of stage.tasks || []) { tasks += 1; executors += (task.executors || []).length; }
  return { stages: (project?.stages || []).length, tasks, executors };
}

export function projectAiEditMetrics(project) {
  return {
    internalCost: projectSum(project),
    executorTaxes: projectFinancialCommission(project),
    markup: projectMarkupAmount(project),
    price: projectPrice(project),
    projectTax: projectTaxAmount(project),
    vat: projectVatAmount(project),
    total: projectTotalWithTax(project),
    ...counts(project),
  };
}

function entitySnapshot(project) {
  const stages = new Map(), tasks = new Map(), executors = new Map();
  for (const stage of project?.stages || []) { stages.set(stage.id, stage.name); for (const task of stage.tasks || []) { tasks.set(task.id, `${stage.name} / ${task.name}`); for (const executor of task.executors || []) executors.set(executor.id, `${stage.name} / ${task.name} / ${executor.tags?.find((tag) => tag.key === "name")?.value || "Без имени"}`); } }
  return { stages, tasks, executors };
}

function humanPlan(beforeProject, afterProject, operationCount) {
  const before = entitySnapshot(beforeProject), after = entitySnapshot(afterProject);
  const created = (kind) => [...after[kind]].filter(([id]) => !before[kind].has(id)).map(([, label]) => label);
  const changed = (kind) => [...after[kind]].filter(([id, label]) => before[kind].has(id) && before[kind].get(id) !== label).map(([, label]) => label);
  return {
    operationCount,
    stages: { created: created("stages"), changed: changed("stages") },
    tasks: { created: created("tasks"), changed: changed("tasks") },
    executors: { created: created("executors"), changed: changed("executors") },
  };
}

export async function buildAiEditPreview({ project, response, performers, idPool, expectedRevision, instruction = "", selectedSources = [] }) {
  const currentRevision = await projectRevision(project);
  if (currentRevision !== expectedRevision || response.baseRevision !== expectedRevision) {
    const error = new Error("Смета изменилась. Пересчитайте AI-запрос."); error.code = "stale_revision"; throw error;
  }
  const afterProject = applyAiEditOperations(project, response, { performers, idPool, instruction, selectedSources });
  return {
    kind: "diff",
    requestId: response.requestId,
    baseRevision: expectedRevision,
    scope: response.scope,
    summary: response.summary,
    operations: response.operations,
    warnings: response.warnings,
    beforeProject: structuredClone(project),
    afterProject,
    before: projectAiEditMetrics(project),
    after: projectAiEditMetrics(afterProject),
    plan: humanPlan(project, afterProject, response.operations.length),
    afterRevision: await projectRevision(afterProject),
    response,
    idPool,
    instruction,
    selectedSources,
  };
}
