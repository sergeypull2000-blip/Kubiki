const MAX_TEXT = 160;
const MAX_STAGES = 30;
const MAX_TASKS = 100;
const MAX_EXECUTORS = 20;

const rawText = (value) => typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, MAX_TEXT) : "";
const looksSensitive = (value) => /\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+?\d[\s().-]*){7,}|(?:^|\s)@[a-zA-Z0-9_]{3,}|https?:\/\//i.test(value);
const text = (value) => { const result = rawText(value); return result && !looksSensitive(result) ? result : ""; };
const idText = (value) => rawText(value);
const list = (value, limit = 20) => [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].slice(0, limit);
const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const tag = (executor, key) => (Array.isArray(executor?.tags) ? executor.tags : []).find((item) => item?.key === key);

function projectExecutor(executor) {
  const payment = object(tag(executor, "payment")?.payment);
  const paymentTypeValue = text(payment.type);
  const paymentType = ["fix_total", "fix_task", "hourly", "shift"].includes(paymentTypeValue) ? paymentTypeValue : "";
  const fixedRate = ["fix_total", "fix_task"].includes(paymentType) ? finitePositive(executor?.amount) : null;
  const variableRate = ["hourly", "shift"].includes(paymentType) ? finitePositive(payment.rate) : null;
  return {
    role: text(tag(executor, "role")?.value),
    specialization: text(tag(executor, "spec")?.value),
    grade: text(tag(executor, "grade")?.value),
    ...(paymentType && (fixedRate || variableRate) ? { rateHint: { paymentType, rate: fixedRate || variableRate, unit: paymentType === "hourly" ? "hour" : paymentType === "shift" ? "shift" : "total", basis: "template-executor-rate" } } : {}),
  };
}

export function projectTaskTemplate(value) {
  const source = object(value);
  const executors = (Array.isArray(source.executors) ? source.executors : []).slice(0, MAX_EXECUTORS).map(projectExecutor);
  const directCost = finitePositive(source.directCost);
  const rateHints = executors.map((item) => item.rateHint).filter(Boolean);
  if (directCost) rateHints.unshift({ paymentType: "fix_task", rate: directCost, unit: "total", basis: "template-task-total" });
  return {
    id: idText(source.id),
    name: text(source.name),
    roles: list(executors.map((item) => item.role)),
    specializations: list(executors.map((item) => item.specialization)),
    grades: list(executors.map((item) => item.grade)),
    rateHints: rateHints.slice(0, 5),
  };
}

export function projectStageTemplate(value) {
  const source = object(value);
  return { id: idText(source.id), name: text(source.name), tasks: (Array.isArray(source.tasks) ? source.tasks : []).slice(0, MAX_TASKS).map(projectTaskTemplate).filter((item) => item.name) };
}

export function projectProjectTemplate(value) {
  const source = object(value);
  return {
    id: idText(source.id),
    name: text(source.templateName) || text(source.name),
    stages: (Array.isArray(source.stages) ? source.stages : []).slice(0, MAX_STAGES).map(projectStageTemplate).filter((item) => item.name),
  };
}

export function projectHistoricalProject(value) {
  const projected = projectProjectTemplate(value);
  return {
    ...projected,
    stages: projected.stages.map((stage) => ({ ...stage, tasks: stage.tasks.map((task) => ({ ...task, rateHints: task.rateHints.map((hint) => ({ ...hint, basis: "historical-task-rate" })) })) })),
  };
}

export function projectPerformer(value) {
  const source = object(value);
  if (source.active === false) return null;
  const paymentTypeValue = text(source.defaultPaymentType);
  const paymentType = ["fix_total", "fix_task", "hourly", "shift"].includes(paymentTypeValue) ? paymentTypeValue : "";
  const rate = finitePositive(source.defaultRate);
  const declaredUnit = text(source.defaultUnit);
  const unit = ["hour", "shift", "total"].includes(declaredUnit) ? declaredUnit : paymentType === "hourly" ? "hour" : paymentType === "shift" ? "shift" : "total";
  return {
    id: idText(source.id),
    displayName: list([source.firstName, source.lastName], 2).join(" "),
    roles: list([source.primaryRole, ...(Array.isArray(source.additionalRoles) ? source.additionalRoles : [])]),
    specializations: list(source.specializations),
    grade: text(source.grade),
    software: list(source.software),
    ...(paymentType && rate ? { rateHint: { paymentType, rate, unit, basis: "performer-default" } } : {}),
  };
}

export function projectKnowledge({ templateLibrary, performers, historicalProjects } = {}) {
  const library = object(templateLibrary);
  return {
    projectTemplates: (Array.isArray(library.projectTemplates) ? library.projectTemplates : []).map(projectProjectTemplate).filter((item) => item.id && item.name),
    stageTemplates: (Array.isArray(library.stageTemplates) ? library.stageTemplates : []).map(projectStageTemplate).filter((item) => item.id && item.name),
    taskTemplates: (Array.isArray(library.taskTemplates) ? library.taskTemplates : []).map(projectTaskTemplate).filter((item) => item.id && item.name),
    performers: (Array.isArray(performers) ? performers : []).map(projectPerformer).filter((item) => item?.id && (item.displayName || item.roles.length || item.specializations.length || item.grade || item.software.length || item.rateHint)),
    historicalProjects: (Array.isArray(historicalProjects) ? historicalProjects : []).map(projectHistoricalProject).filter((item) => item.id && item.name),
  };
}
