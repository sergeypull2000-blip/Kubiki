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

export async function buildAiEditPreview({ project, response, performers, idPool, expectedRevision, instruction = "", selectedSources = [] }) {
  const currentRevision = await projectRevision(project);
  if (currentRevision !== expectedRevision || response.baseRevision !== expectedRevision) {
    const error = new Error("Смета изменилась. Пересчитайте AI-запрос."); error.code = "stale_revision"; throw error;
  }
  const afterProject = applyAiEditOperations(project, response, { performers, idPool, instruction, selectedSources });
  return {
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
    afterRevision: await projectRevision(afterProject),
    response,
    idPool,
    instruction,
    selectedSources,
  };
}
