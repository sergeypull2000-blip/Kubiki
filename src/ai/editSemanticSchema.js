export const AI_EDIT_SEMANTIC_COMMAND_TYPES = Object.freeze([
  "stage.create", "executor.createAnonymous", "executor.setCompensation",
  "executor.setTax", "executor.setTaxBulk", "task.delete", "executor.replacePerformer",
]);

const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const exact = (value, required, optional = []) => object(value) && required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const id = (value) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const text = (value, max = 500) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const numberValue = (value) => (typeof value === "number" || typeof value === "string") && String(value).trim().length > 0;

function validCommand(command) {
  if (!object(command) || !AI_EDIT_SEMANTIC_COMMAND_TYPES.includes(command.type)) return false;
  switch (command.type) {
    case "stage.create": return exact(command, ["type"], ["name"]) && (command.name === undefined || text(command.name, 160));
    case "executor.createAnonymous": return exact(command, ["type", "name", "role"], ["compensation"]) && text(command.name, 160) && text(command.role, 160) && (command.compensation === undefined || numberValue(command.compensation));
    case "executor.setCompensation": return exact(command, ["type", "value"]) && numberValue(command.value);
    case "executor.setTax":
    case "executor.setTaxBulk": return exact(command, ["type", "percent"]) && numberValue(command.percent);
    case "task.delete": return exact(command, ["type"]);
    case "executor.replacePerformer": return exact(command, ["type"]);
    default: return false;
  }
}

export function parseAiEditSemanticResponse(raw) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : raw; } catch { return null; }
  if (!object(value) || !["command", "clarification", "out_of_scope", "error"].includes(value.kind)) return null;
  if (value.kind === "command") return exact(value, ["kind", "summary", "command", "warnings"]) && text(value.summary) && validCommand(value.command) && Array.isArray(value.warnings) && value.warnings.length <= 20 && value.warnings.every((item) => typeof item === "string" && item.length <= 500) ? value : null;
  if (value.kind === "clarification") return exact(value, ["kind", "question"]) && text(value.question) && value.question.includes("?") ? value : null;
  if (value.kind === "out_of_scope") return exact(value, ["kind", "message"]) && text(value.message) ? value : null;
  return exact(value, ["kind", "code", "message"]) && id(value.code) && text(value.message) ? value : null;
}

export function diagnoseAiEditSemanticResponse(raw) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : raw; } catch { return "ai_semantic_invalid_json"; }
  if (!object(value)) return "ai_semantic_invalid_schema";
  if (value.kind === "diff" || Array.isArray(value.operations)) return "ai_semantic_low_level_forbidden";
  if (value.kind === "command" && !AI_EDIT_SEMANTIC_COMMAND_TYPES.includes(value.command?.type)) return "ai_semantic_unknown_command";
  return "ai_semantic_invalid_schema";
}

export function attachTrustedAiEditMetadata(semantic, request) {
  return { schemaVersion: 1, ...semantic, requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope };
}
