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
        && Boolean(command.name || command.role || command.compensation !== undefined || command.paymentType || command.quantity !== undefined || command.tax !== undefined)
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

const HARMLESS_MODEL_KEYS = new Set(["schemaVersion", "confidence", "explanation", "reasoning"]);
const HARMLESS_COMMAND_KEYS = new Set(["id", "reason", "description"]);

export function normalizeAiEditSemanticDto(raw) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : structuredClone(raw); } catch { return null; }
  if (!object(value)) return null;
  if (object(value.semantic)) {
    if (!Object.keys(value).every((key) => key === "semantic" || HARMLESS_MODEL_KEYS.has(key))) return null;
    value = value.semantic;
  } else if (object(value.result)) {
    if (!Object.keys(value).every((key) => key === "result" || HARMLESS_MODEL_KEYS.has(key))) return null;
    value = value.result;
  }
  if (!object(value)) return null;
  for (const key of HARMLESS_MODEL_KEYS) delete value[key];
  if (value.kind === "commands" && !Array.isArray(value.commands) && Array.isArray(value.plan)) { value.commands = value.plan; delete value.plan; }
  if (value.kind === "command" && !object(value.command) && object(value.commands)) { value.command = value.commands; delete value.commands; }
  if (!value.kind && object(value.command)) value.kind = "command";
  if (!value.kind && Array.isArray(value.commands)) value.kind = "commands";
  if (value.warnings === undefined && ["command", "commands"].includes(value.kind)) value.warnings = [];
  const commands = value.kind === "command" ? [value.command] : value.kind === "commands" ? value.commands : [];
  for (const command of commands || []) if (object(command)) for (const key of HARMLESS_COMMAND_KEYS) delete command[key];
  return value;
}

export function parseAiEditSemanticResponse(raw) {
  const value = normalizeAiEditSemanticDto(raw);
  if (!object(value) || !["command", "commands", "clarification", "out_of_scope", "error"].includes(value.kind)) return null;
  if (value.kind === "command") return exact(value, ["kind", "summary", "command", "warnings"]) && text(value.summary) && isAiEditSemanticCommand(value.command, { multi: true }) && validWarnings(value.warnings) ? value : null;
  if (value.kind === "commands") return exact(value, ["kind", "summary", "commands", "warnings"]) && text(value.summary)
    && Array.isArray(value.commands) && value.commands.length > 0 && value.commands.length <= MAX_AI_EDIT_SEMANTIC_COMMANDS
    && value.commands.every((command) => isAiEditSemanticCommand(command, { multi: true })) && validWarnings(value.warnings) ? value : null;
  if (value.kind === "clarification") return exact(value, ["kind", "question"]) && text(value.question) && value.question.includes("?") ? value : null;
  if (value.kind === "out_of_scope") return exact(value, ["kind", "message"]) && text(value.message) ? value : null;
  return exact(value, ["kind", "code", "message"]) && id(value.code) && text(value.message) ? value : null;
}

export function normalizeAiEditSemanticPlan(semantic) {
  if (semantic?.kind !== "command") return semantic;
  return { kind: "commands", summary: semantic.summary, commands: [semantic.command], warnings: semantic.warnings };
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
