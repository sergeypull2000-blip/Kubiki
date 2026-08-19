export const AI_EDIT_SCHEMA_VERSION = 1;
export const AI_EDIT_OPERATION_TYPES = Object.freeze([
  "stage.add", "stage.rename", "stage.delete",
  "task.add", "task.rename", "task.delete",
  "executor.addAnonymous", "executor.addFromPerformer", "executor.replacePerformer",
  "executor.payment.setType", "executor.payment.setRate", "executor.payment.setQuantity",
  "executor.amount.set", "executor.tag.add", "executor.tag.update", "executor.tag.remove",
  "executor.delete",
  "project.setTargetBudget",
]);
export const AI_EDIT_RESPONSE_KINDS = Object.freeze(["diff", "clarification", "out_of_scope", "error"]);
export const AI_EDIT_SCOPE_KINDS = Object.freeze(["project", "stage", "task", "executor"]);
export const AI_EDIT_SOURCE_KINDS = Object.freeze(["current_request", "imported_data", "project", "personalization", "performer", "project_template", "stage_template", "task_template"]);
export const MAX_AI_EDIT_INSTRUCTION_CHARS = 4_000;
export const MAX_AI_EDIT_OPERATIONS = 50;

const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, required, optional = []) => object(value)
  && required.every((key) => Object.hasOwn(value, key))
  && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const id = (value) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const text = (value, max = 500) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const nullableId = (value) => value === null || id(value);
const cleanPlainText = (value) => [...String(value ?? "")].filter((character) => { const code = character.codePointAt(0); return code === 9 || code === 10 || code === 13 || code > 31 && code !== 127; }).join("").normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[\t\f\v]+/g, " ").replace(/[ ]{2,}/g, " ").replace(/\n{4,}/g, "\n\n\n").trim();

export function isAiEditScope(scope) {
  if (!object(scope) || !AI_EDIT_SCOPE_KINDS.includes(scope.kind) || !id(scope.projectId)) return false;
  const expected = {
    project: ["kind", "projectId"],
    stage: ["kind", "projectId", "stageId"],
    task: ["kind", "projectId", "stageId", "taskId"],
    executor: ["kind", "projectId", "stageId", "taskId", "executorId"],
  }[scope.kind];
  return exactKeys(scope, expected, ["sheetId"]) && expected.filter((key) => key.endsWith("Id")).every((key) => id(scope[key])) && (scope.sheetId === undefined || id(scope.sheetId));
}

function isIdPool(pool) {
  return exactKeys(pool, ["stages", "tasks", "executors", "tags"])
    && ["stages", "tasks", "executors", "tags"].every((key) => Array.isArray(pool[key]) && pool[key].length <= 250 && pool[key].every(id) && new Set(pool[key]).size === pool[key].length);
}

function isKnowledge(value) {
  if (!exactKeys(value, ["useStudioKnowledge", "selectedSources"]) || typeof value.useStudioKnowledge !== "boolean" || !Array.isArray(value.selectedSources) || value.selectedSources.length > 20) return false;
  return value.selectedSources.every((source) => exactKeys(source, ["kind", "id"])
    && ["performer", "project_template", "stage_template", "task_template"].includes(source.kind) && id(source.id));
}
function isConfirmed(value) {
  return exactKeys(value, [], ["projectEntityId", "performerId"])
    && (value.projectEntityId === undefined || id(value.projectEntityId))
    && (value.performerId === undefined || id(value.performerId));
}
function isContinuation(value) {
  return value === undefined || exactKeys(value, ["token"], ["answer", "source"])
    && text(value.token, 50_000)
    && (value.answer === undefined || text(value.answer, 500))
    && (value.source === undefined || exactKeys(value.source, ["kind", "id"]) && ["project", "performer"].includes(value.source.kind) && id(value.source.id));
}

export function validateAiEditRequest(body) {
  if (!exactKeys(body, ["schemaVersion", "requestId", "projectId", "baseRevision", "scope", "instruction", "knowledge", "confirmed", "idPool"], ["continuation"])) return { ok: false, status: 400, error: "Некорректное тело AI-edit запроса" };
  if (body.schemaVersion !== AI_EDIT_SCHEMA_VERSION || !id(body.requestId) || !id(body.projectId) || !id(body.baseRevision) || !isAiEditScope(body.scope) || body.scope.projectId !== body.projectId || !isKnowledge(body.knowledge) || !isConfirmed(body.confirmed) || !isIdPool(body.idPool) || !isContinuation(body.continuation)) return { ok: false, status: 400, error: "Некорректная схема AI-edit запроса" };
  const instruction = cleanPlainText(body.instruction);
  if (!instruction) return { ok: false, status: 400, error: "Введите запрос на изменение сметы" };
  if (instruction.length > MAX_AI_EDIT_INSTRUCTION_CHARS) return { ok: false, status: 413, error: `Запрос слишком большой. Максимум ${MAX_AI_EDIT_INSTRUCTION_CHARS} символов` };
  return { ok: true, value: { ...body, instruction } };
}

function isSource(source) {
  if (!exactKeys(source, ["kind"], ["id", "name"]) || !AI_EDIT_SOURCE_KINDS.includes(source.kind)) return false;
  const referenced = ["performer", "project_template", "stage_template", "task_template"].includes(source.kind);
  return (!referenced || id(source.id)) && (source.name === undefined || text(source.name, 200));
}

function operationValueIsValid(operation) {
  const value = operation.value;
  switch (operation.type) {
    case "stage.add": return exactKeys(value, ["stageId", "name", "presetKey", "beforeStageId"]) && id(value.stageId) && text(value.name, 160) && id(value.presetKey) && nullableId(value.beforeStageId);
    case "stage.rename":
    case "task.rename": return exactKeys(value, ["name"]) && text(value.name, 160);
    case "stage.delete":
    case "task.delete":
    case "executor.delete": return value === undefined;
    case "task.add": return exactKeys(value, ["taskId", "name", "beforeTaskId"]) && id(value.taskId) && text(value.name, 160) && nullableId(value.beforeTaskId);
    case "executor.addAnonymous": return exactKeys(value, ["executorId", "roleTagId"]) && id(value.executorId) && id(value.roleTagId);
    case "executor.addFromPerformer": return exactKeys(value, ["executorId", "performerId"], ["inheritFinancials"]) && id(value.executorId) && id(value.performerId) && (value.inheritFinancials === undefined || typeof value.inheritFinancials === "boolean");
    case "executor.replacePerformer": return exactKeys(value, ["performerId"]) && id(value.performerId);
    case "executor.payment.setType": return exactKeys(value, ["type"]) && typeof value.type === "string";
    case "executor.payment.setRate":
    case "executor.amount.set": return exactKeys(value, ["value"]) && (typeof value.value === "string" || typeof value.value === "number");
    case "executor.payment.setQuantity": return exactKeys(value, ["field", "value"]) && ["units", "hours", "shifts"].includes(value.field) && (typeof value.value === "string" || typeof value.value === "number");
    case "executor.tag.add": return exactKeys(value, ["tagId", "key", "value"]) && id(value.tagId) && id(value.key) && typeof value.value === "string";
    case "executor.tag.update": return exactKeys(value, ["executorId", "value"]) && id(value.executorId) && typeof value.value === "string";
    case "executor.tag.remove": return exactKeys(value, ["executorId"]) && id(value.executorId);
    case "project.setTargetBudget": return exactKeys(value, ["target"]) && (typeof value.target === "string" || typeof value.target === "number");
    default: return false;
  }
}

export function isAiEditOperation(operation) {
  if (!exactKeys(operation, ["id", "type", "targetId", "reason", "source"], ["value"]) || !id(operation.id) || !AI_EDIT_OPERATION_TYPES.includes(operation.type) || !id(operation.targetId) || !text(operation.reason, 500) || !isSource(operation.source)) return false;
  return operationValueIsValid(operation);
}

function commonResponse(value) {
  return value.schemaVersion === AI_EDIT_SCHEMA_VERSION && id(value.requestId) && id(value.baseRevision) && isAiEditScope(value.scope);
}

export function parseAiEditResponse(raw, expected = {}) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : raw; } catch { return null; }
  if (!object(value) || !AI_EDIT_RESPONSE_KINDS.includes(value.kind) || !commonResponse(value)) return null;
  if (expected.requestId && value.requestId !== expected.requestId || expected.baseRevision && value.baseRevision !== expected.baseRevision || expected.scope && JSON.stringify(value.scope) !== JSON.stringify(expected.scope)) return null;
  if (value.kind === "diff") {
    if (!exactKeys(value, ["schemaVersion", "kind", "requestId", "baseRevision", "scope", "summary", "operations", "warnings"]) || !text(value.summary, 500) || !Array.isArray(value.operations) || !value.operations.length || value.operations.length > MAX_AI_EDIT_OPERATIONS || !value.operations.every(isAiEditOperation) || new Set(value.operations.map((item) => item.id)).size !== value.operations.length || !Array.isArray(value.warnings) || value.warnings.length > 20 || !value.warnings.every((item) => typeof item === "string" && item.length <= 500)) return null;
  } else if (value.kind === "clarification") {
    if (!exactKeys(value, ["schemaVersion", "kind", "requestId", "baseRevision", "scope", "question"], ["choices", "continuationToken"]) || !text(value.question, 500) || value.question.includes("?") === false || value.continuationToken !== undefined && !text(value.continuationToken, 50_000) || value.choices !== undefined && (!Array.isArray(value.choices) || value.choices.length > 10 || !value.choices.every((choice) => exactKeys(choice, ["id", "label", "source"]) && id(choice.id) && text(choice.label, 200) && isSource(choice.source)))) return null;
  } else if (value.kind === "out_of_scope") {
    if (!exactKeys(value, ["schemaVersion", "kind", "requestId", "baseRevision", "scope", "message"]) || !text(value.message, 500)) return null;
  } else if (!exactKeys(value, ["schemaVersion", "kind", "requestId", "baseRevision", "scope", "code", "message"]) || !id(value.code) || !text(value.message, 500)) return null;
  return value;
}

export function diagnoseAiEditResponse(raw, expected = {}) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : raw; } catch { return "ai_diff_invalid_json"; }
  if (!object(value)) return "ai_diff_invalid_envelope";
  if (value.requestId !== expected.requestId || value.baseRevision !== expected.baseRevision || JSON.stringify(value.scope) !== JSON.stringify(expected.scope)) return "ai_diff_request_mismatch";
  if (value.kind === "diff" && (!Array.isArray(value.operations) || !value.operations.length)) return "ai_diff_empty_operations";
  if (value.kind === "diff" && !value.operations.every(isAiEditOperation)) return "ai_diff_invalid_operation";
  return "ai_diff_invalid_schema";
}
