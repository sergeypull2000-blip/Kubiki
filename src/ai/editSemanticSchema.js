export const AI_EDIT_SEMANTIC_COMMAND_TYPES = Object.freeze([
  "stage.create", "stage.rename", "stage.delete", "task.create", "task.rename", "task.delete",
  "executor.createAnonymous", "executor.createFromPerformer", "executor.delete", "executor.setCompensation", "executor.setPaymentType",
  "executor.setPaymentRate", "executor.setPaymentQuantity", "executor.setRole", "executor.setName",
  "executor.setTax", "executor.setTaxBulk", "executor.replacePerformer",
]);
export const MAX_AI_EDIT_SEMANTIC_COMMANDS = 20;

const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const exact = (value, required, optional = []) => object(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const id = (value) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const text = (value, max = 500) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const numberValue = (value) => (typeof value === "number" || typeof value === "string") && String(value).trim().length > 0;

const localRef = (value, kind) => typeof value === "string" && new RegExp(`^new-${kind}-[1-9]\\d{0,2}$`).test(value);

export function isAiEditSemanticCommand(command, { multi = false } = {}) {
  if (!object(command) || !AI_EDIT_SEMANTIC_COMMAND_TYPES.includes(command.type)) return false;
  switch (command.type) {
    case "stage.create": return exact(command, ["type"], multi ? ["name", "ref"] : ["name"])
      && (command.name === undefined || text(command.name, 160)) && (command.ref === undefined || localRef(command.ref, "stage"));
    case "stage.rename": return multi
      ? exact(command, ["type", "name"], ["targetName"]) && text(command.name, 160) && (command.targetName === undefined || text(command.targetName, 160))
      : exact(command, ["type", "name"]) && text(command.name, 160);
    case "task.create": return multi
      ? exact(command, ["type"], ["name", "ref", "stageRef", "stageName"])
        && (command.name === undefined || text(command.name, 160)) && (command.ref === undefined || localRef(command.ref, "task"))
        && (command.stageRef === undefined || localRef(command.stageRef, "stage"))
        && (command.stageName === undefined || text(command.stageName, 160))
        && !(command.stageRef && command.stageName)
      : exact(command, ["type", "name"]) && text(command.name, 160);
    case "executor.setRole":
    case "executor.setName": return multi
      ? exact(command, ["type", "name"], ["targetRef", "targetName", "taskName", "stageName"])
        && text(command.name, 160) && validExecutorTarget(command)
      : exact(command, ["type", "name"]) && text(command.name, 160);
    case "task.rename": return multi
      ? exact(command, ["type", "name"], ["targetRef", "targetName", "stageName"])
        && text(command.name, 160) && validTaskTarget(command)
      : exact(command, ["type", "name"]) && text(command.name, 160);
    case "stage.delete": return multi ? exact(command, ["type"], ["targetName"]) && (command.targetName === undefined || text(command.targetName, 160)) : exact(command, ["type"]);
    case "task.delete": return multi ? exact(command, ["type"], ["targetRef", "targetName", "stageName"]) && validTaskTarget(command) : exact(command, ["type"]);
    case "executor.delete":
    case "executor.replacePerformer": return multi ? exact(command, ["type"], ["targetRef", "targetName", "taskName", "stageName"]) && validExecutorTarget(command) : exact(command, ["type"]);
    case "executor.createAnonymous": return multi
      ? exact(command, ["type"], ["ref", "name", "role", "paymentType", "compensation", "quantity", "tax", "taskId", "taskRef", "taskName", "stageName"])
        && (command.ref === undefined || localRef(command.ref, "executor"))
        && (command.name === undefined || text(command.name, 160)) && (command.role === undefined || text(command.role, 160))
        && Boolean(command.name || command.role)
        && (command.paymentType === undefined || text(command.paymentType, 40)) && (command.compensation === undefined || numberValue(command.compensation))
        && (command.quantity === undefined || numberValue(command.quantity)) && (command.tax === undefined || numberValue(command.tax))
        && (command.taskId === undefined || id(command.taskId))
        && (command.taskRef === undefined || localRef(command.taskRef, "task"))
        && (command.taskName === undefined || text(command.taskName, 160))
        && (command.stageName === undefined || text(command.stageName, 160))
        && !(command.taskRef && (command.taskId || command.taskName))
      : exact(command, ["type", "taskId"], ["name", "role", "paymentType", "compensation", "quantity", "tax"])
        && id(command.taskId) && Boolean(command.name || command.role)
        && (command.name === undefined || text(command.name, 160)) && (command.role === undefined || text(command.role, 160))
        && (command.paymentType === undefined || text(command.paymentType, 40)) && (command.compensation === undefined || numberValue(command.compensation))
        && (command.quantity === undefined || numberValue(command.quantity)) && (command.tax === undefined || numberValue(command.tax));
    case "executor.createFromPerformer": return multi
      ? exact(command, ["type"], ["taskId", "taskName", "stageName", "performerId", "performerName"])
        && (command.taskId === undefined || id(command.taskId)) && (command.taskName === undefined || text(command.taskName, 160))
        && (command.stageName === undefined || text(command.stageName, 160)) && (command.performerId === undefined || id(command.performerId))
        && (command.performerName === undefined || text(command.performerName, 160)) && Boolean(command.performerId || command.performerName)
      : exact(command, ["type", "taskId", "performerId"]) && id(command.taskId) && id(command.performerId);
    case "executor.setCompensation": return multi ? exact(command, ["type", "value"], ["targetRef", "targetName", "taskName", "stageName"]) && numberValue(command.value) && validExecutorTarget(command) : exact(command, ["type", "value"]) && numberValue(command.value);
    case "executor.setPaymentType": return multi ? exact(command, ["type", "paymentType"], ["targetRef", "targetName", "taskName", "stageName"]) && text(command.paymentType, 40) && validExecutorTarget(command) : exact(command, ["type", "paymentType"]) && text(command.paymentType, 40);
    case "executor.setPaymentRate":
    case "executor.setPaymentQuantity": return multi ? exact(command, ["type", "value"], ["targetRef", "targetName", "taskName", "stageName"]) && numberValue(command.value) && validExecutorTarget(command) : exact(command, ["type", "value"]) && numberValue(command.value);
    case "executor.setTax": return multi ? exact(command, ["type", "percent"], ["targetRef", "targetName", "taskName", "stageName"]) && numberValue(command.percent) && validExecutorTarget(command) : exact(command, ["type", "percent"]) && numberValue(command.percent);
    case "executor.setTaxBulk": return exact(command, ["type", "percent"]) && numberValue(command.percent);
    default: return false;
  }
}

function validTaskTarget(command) {
  return (command.targetRef === undefined || localRef(command.targetRef, "task"))
    && (command.targetName === undefined || text(command.targetName, 160))
    && (command.stageName === undefined || text(command.stageName, 160)) && !(command.targetRef && command.targetName);
}
function validExecutorTarget(command) {
  return (command.targetRef === undefined || localRef(command.targetRef, "executor"))
    && (command.targetName === undefined || text(command.targetName, 160))
    && (command.taskName === undefined || text(command.taskName, 160))
    && (command.stageName === undefined || text(command.stageName, 160)) && !(command.targetRef && command.targetName);
}

export function parseAiEditSemanticResponse(raw) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : raw; } catch { return null; }
  if (!object(value) || !["command", "commands", "clarification", "out_of_scope", "error"].includes(value.kind)) return null;
  if (value.kind === "command") return exact(value, ["kind", "summary", "command", "warnings"]) && text(value.summary) && isAiEditSemanticCommand(value.command) && validWarnings(value.warnings) ? value : null;
  if (value.kind === "commands") return exact(value, ["kind", "summary", "commands", "warnings"]) && text(value.summary)
    && Array.isArray(value.commands) && value.commands.length > 0 && value.commands.length <= MAX_AI_EDIT_SEMANTIC_COMMANDS
    && value.commands.every((command) => isAiEditSemanticCommand(command, { multi: true })) && validWarnings(value.warnings) ? value : null;
  if (value.kind === "clarification") return exact(value, ["kind", "question"]) && text(value.question) && value.question.includes("?") ? value : null;
  if (value.kind === "out_of_scope") return exact(value, ["kind", "message"]) && text(value.message) ? value : null;
  return exact(value, ["kind", "code", "message"]) && id(value.code) && text(value.message) ? value : null;
}

const validWarnings = (warnings) => Array.isArray(warnings) && warnings.length <= 20 && warnings.every((item) => typeof item === "string" && item.length <= 500);

export function diagnoseAiEditSemanticResponse(raw) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : raw; } catch { return "ai_semantic_invalid_json"; }
  if (!object(value)) return "ai_semantic_invalid_schema";
  if (value.kind === "diff" || Array.isArray(value.operations)) return "ai_semantic_low_level_forbidden";
  if ((value.kind === "command" && !AI_EDIT_SEMANTIC_COMMAND_TYPES.includes(value.command?.type))
    || (value.kind === "commands" && Array.isArray(value.commands) && value.commands.some((command) => !AI_EDIT_SEMANTIC_COMMAND_TYPES.includes(command?.type)))) return "ai_semantic_unknown_command";
  return "ai_semantic_invalid_schema";
}

export function attachTrustedAiEditMetadata(semantic, request) {
  return { schemaVersion: 1, ...semantic, requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope };
}
