import { applyAiEditOperations, AiEditValidationError, indexProject } from "./editOperations.js";
import { PAYMENT_OPTIONS, ROLE_OPTIONS } from "../constants.js";

const source = { kind: "current_request" };
const operation = (id, type, targetId, value, reason) => ({ id, type, targetId, ...(value === undefined ? {} : { value }), reason, source });
const money = (value) => String(value).trim().replace(/\s/g, "").replace(/к$/iu, "000").replace(",", ".");
const taxValue = (value) => String(value).trim().replace("%", "").replace(",", ".");
const normalized = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const explicitStageName = (name, instruction) => name && normalized(name) !== "новый этап" && normalized(instruction).includes(normalized(name)) ? name.trim() : "Новый этап";
const roleValue = (value) => {
  const query = normalized(value), matches = ROLE_OPTIONS.filter((role) => { const candidate = normalized(role); return candidate === query || candidate.startsWith(query) || query.startsWith(candidate); });
  if (matches.length !== 1) throw new AiEditSemanticCompileError("ai_semantic_invalid_role", "Роль не поддерживается текущей моделью Executor");
  return matches[0];
};
const paymentTypeValue = (value) => {
  const query = normalized(value), matches = PAYMENT_OPTIONS.filter((item) => normalized(item.key) === query || normalized(item.label) === query);
  if (matches.length !== 1) throw new AiEditSemanticCompileError("ai_semantic_invalid_payment_type", "Тип оплаты не поддерживается текущей моделью Executor");
  return matches[0].key;
};
const target = (projectIndex, resolvedTarget, kind) => {
  const located = projectIndex[`${kind}s`]?.get(resolvedTarget?.id);
  if (resolvedTarget?.kind !== kind || !located) throw new AiEditSemanticCompileError("ai_semantic_missing_target", `Не подтверждён ${kind}`);
  return located;
};

export class AiEditSemanticCompileError extends Error {
  constructor(code, message) { super(message); this.name = "AiEditSemanticCompileError"; this.code = code; }
}

function take(pool, used, kind) {
  const value = (pool?.[kind] || []).find((item) => !used.has(item));
  if (!value) throw new AiEditSemanticCompileError("ai_compile_id_pool_exhausted", `Недостаточно ${kind} id`);
  used.add(value); return value;
}

export function compileAiEditSemanticCommand({ semantic, request, project, resolvedTarget, resolvedTask, performer, performers = [] }) {
  const command = semantic.command, used = new Set(), operations = [], projectIndex = indexProject(project);
  const add = (type, targetId, value, reason) => operations.push(operation(`semantic-${operations.length + 1}`, type, targetId, value, reason));
  switch (command.type) {
    case "stage.create":
      add("stage.add", project.id, { stageId: take(request.idPool, used, "stages"), name: explicitStageName(command.name, request.instruction), presetKey: "custom", beforeStageId: null }, "Создать явно запрошенный этап");
      break;
    case "stage.rename": add("stage.rename", target(projectIndex, resolvedTarget, "stage").stage.id, { name: command.name.trim() }, "Переименовать выбранный этап"); break;
    case "stage.delete": add("stage.delete", target(projectIndex, resolvedTarget, "stage").stage.id, undefined, "Удалить выбранный этап"); break;
    case "task.create": {
      const stage = target(projectIndex, resolvedTarget, "stage").stage;
      add("task.add", stage.id, { taskId: take(request.idPool, used, "tasks"), name: command.name.trim(), beforeTaskId: null }, "Создать задачу в выбранном этапе"); break;
    }
    case "task.rename": add("task.rename", target(projectIndex, resolvedTarget, "task").task.id, { name: command.name.trim() }, "Переименовать выбранную задачу"); break;
    case "executor.createAnonymous": { const executorId = take(request.idPool, used, "executors"), roleTagId = take(request.idPool, used, "tags"), nameTagId = command.name ? take(request.idPool, used, "tags") : null;
      if (!resolvedTask?.id) throw new AiEditSemanticCompileError("ai_semantic_missing_task", "Для нового Executor требуется Task");
      add("executor.addAnonymous", resolvedTask.id, { executorId, roleTagId }, "Создать анонимного Executor");
      if (command.role) add("executor.tag.update", roleTagId, { executorId, value: roleValue(command.role) }, "Установить роль");
      if (command.name) add("executor.tag.add", executorId, { tagId: nameTagId, key: "name", value: command.name }, "Установить имя");
      if (command.tax !== undefined) add("executor.tag.add", executorId, { tagId: take(request.idPool, used, "tags"), key: "tax", value: taxValue(command.tax) }, "Установить налог");
      if (command.paymentType !== undefined || command.compensation !== undefined || command.quantity !== undefined) {
        const type = command.paymentType === undefined ? "fix_total" : paymentTypeValue(command.paymentType);
        add("executor.payment.setType", executorId, { type }, "Установить тип оплаты");
        if (command.compensation !== undefined) add(type === "fix_total" ? "executor.amount.set" : "executor.payment.setRate", executorId, { value: money(command.compensation) }, "Установить оплату");
        if (command.quantity !== undefined) { const field = { fix_task: "units", hourly: "hours", shift: "shifts" }[type]; if (!field) throw new AiEditSemanticCompileError("ai_semantic_quantity_not_applicable", "Количество неприменимо к фиксированной общей оплате"); add("executor.payment.setQuantity", executorId, { field, value: money(command.quantity) }, "Установить количество"); }
      }
      break;
    }
    case "executor.createFromPerformer": {
      const trustedTaskId = resolvedTask?.id || command.taskId, task = projectIndex.tasks.get(trustedTaskId)?.task;
      const confirmedPerformer = performer?.id === command.performerId ? performers.find((item) => item.id === performer.id) : null;
      if (!task || !confirmedPerformer || command.taskId && command.taskId !== trustedTaskId) throw new AiEditSemanticCompileError("ai_semantic_missing_target", "Не подтверждены Task и Performer");
      add("executor.addFromPerformer", task.id, { executorId: take(request.idPool, used, "executors"), performerId: confirmedPerformer.id }, "Добавить подтверждённого Performer из библиотеки");
      operations[operations.length - 1].source = { kind: "performer", id: confirmedPerformer.id };
      break;
    }
    case "executor.setCompensation": { const executor = projectIndex.executors.get(resolvedTarget?.id)?.executor;
      if (resolvedTarget?.kind !== "executor" || !executor) throw new AiEditSemanticCompileError("ai_semantic_missing_target", "Не подтверждён Executor");
      const type = executor.tags?.find((tag) => tag.key === "payment")?.payment?.type;
      if (type === "fix_total") add("executor.amount.set", executor.id, { value: money(command.value) }, "Изменить оплату Executor");
      else if (["fix_task", "hourly", "shift"].includes(type)) add("executor.payment.setRate", executor.id, { value: money(command.value) }, "Изменить ставку Executor");
      else throw new AiEditSemanticCompileError("ai_semantic_missing_payment_type", "Не определён тип оплаты Executor");
      break;
    }
    case "executor.delete": add("executor.delete", target(projectIndex, resolvedTarget, "executor").executor.id, undefined, "Удалить выбранного исполнителя"); break;
    case "executor.setPaymentType": add("executor.payment.setType", target(projectIndex, resolvedTarget, "executor").executor.id, { type: paymentTypeValue(command.paymentType) }, "Изменить тип оплаты исполнителя"); break;
    case "executor.setPaymentRate": add("executor.payment.setRate", target(projectIndex, resolvedTarget, "executor").executor.id, { value: money(command.value) }, "Изменить ставку исполнителя"); break;
    case "executor.setPaymentQuantity": { const executor = target(projectIndex, resolvedTarget, "executor").executor;
      const type = executor.tags?.find((tag) => tag.key === "payment")?.payment?.type;
      const field = { fix_task: "units", hourly: "hours", shift: "shifts" }[type];
      if (!field) throw new AiEditSemanticCompileError("ai_semantic_quantity_not_applicable", "Количество доступно только для оплаты за единицу, по часам или сменам");
      add("executor.payment.setQuantity", executor.id, { field, value: money(command.value) }, "Изменить количество по текущему типу оплаты"); break;
    }
    case "executor.setRole":
    case "executor.setName": { const executor = target(projectIndex, resolvedTarget, "executor").executor, key = command.type === "executor.setRole" ? "role" : "name", value = key === "role" ? roleValue(command.name) : command.name.trim(), existing = executor.tags?.find((tag) => tag.key === key);
      if (existing) add("executor.tag.update", existing.id, { executorId: executor.id, value }, `Изменить ${key === "role" ? "роль" : "имя"} исполнителя`);
      else add("executor.tag.add", executor.id, { tagId: take(request.idPool, used, "tags"), key, value }, `Добавить ${key === "role" ? "роль" : "имя"} исполнителя`);
      break;
    }
    case "executor.setTax":
    case "executor.setTaxBulk": { const targets = command.type === "executor.setTaxBulk" ? [...projectIndex.executors.values()].filter((item) => request.scope.kind === "project" || item.stage.id === request.scope.stageId && (request.scope.kind === "stage" || item.task.id === request.scope.taskId && (request.scope.kind === "task" || item.executor.id === request.scope.executorId))) : [projectIndex.executors.get(resolvedTarget?.id)];
      if (!targets.length || targets.some((item) => !item?.executor)) throw new AiEditSemanticCompileError("ai_semantic_missing_target", "Не подтверждён Executor");
      for (const item of targets) { const executor = item.executor, existing = executor.tags?.find((tag) => tag.key === "tax");
        if (existing) add("executor.tag.update", existing.id, { executorId: executor.id, value: taxValue(command.percent) }, "Изменить налог Executor");
        else add("executor.tag.add", executor.id, { tagId: take(request.idPool, used, "tags"), key: "tax", value: taxValue(command.percent) }, "Добавить налог Executor");
      } break;
    }
    case "task.delete":
      if (resolvedTarget?.kind !== "task") throw new AiEditSemanticCompileError("ai_semantic_missing_target", "Не подтверждена Task");
      add("task.delete", resolvedTarget.id, undefined, "Удалить явно указанную Task"); break;
    case "executor.replacePerformer":
      if (resolvedTarget?.kind !== "executor" || !performer) throw new AiEditSemanticCompileError("ai_semantic_missing_target", "Не подтверждены Executor и Performer");
      operations.push({ id: "semantic-1", type: "executor.replacePerformer", targetId: resolvedTarget.id, value: { performerId: performer.id }, reason: "Заменить Performer по прямому запросу", source: { kind: "performer", id: performer.id } }); break;
    default: throw new AiEditSemanticCompileError("ai_semantic_unknown_command", "Неизвестная semantic command");
  }
  const diff = { schemaVersion: 1, kind: "diff", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, summary: semantic.summary, operations, warnings: semantic.warnings };
  try { applyAiEditOperations(project, diff, { performers, idPool: request.idPool, instruction: request.instruction, selectedSources: request.knowledge.selectedSources }); }
  catch (error) { if (error instanceof AiEditValidationError) throw new AiEditSemanticCompileError(`ai_compile_${error.code}`, error.message); throw error; }
  return diff;
}

const creationPhase = (type) => type === "stage.create" ? 1 : type === "task.create" ? 2 : ["executor.createAnonymous", "executor.createFromPerformer"].includes(type) ? 3 : type === "executor.setTaxBulk" ? 5 : 4;
const withoutPlanFields = (command) => Object.fromEntries(Object.entries(command).filter(([key]) => !["ref", "stageRef", "stageName", "taskRef", "taskName", "targetRef", "targetName"].includes(key)));

export function compileAiEditSemanticPlan({ semantic, request, project, confirmedTargets = {}, performer, performers = [] }) {
  if (semantic.kind === "command") return compileAiEditSemanticCommand({ semantic, request, project, resolvedTarget: confirmedTargets[0]?.target, resolvedTask: confirmedTargets[0]?.task, performer, performers });
  const refs = new Map();
  for (const command of semantic.commands) {
    if (!command.ref) continue;
    if (refs.has(command.ref)) throw new AiEditSemanticCompileError("ai_semantic_duplicate_ref", `Повторный local ref ${command.ref}`);
    refs.set(command.ref, { type: command.type });
  }
  for (const command of semantic.commands) {
    if (command.stageRef && refs.get(command.stageRef)?.type !== "stage.create") throw new AiEditSemanticCompileError("ai_semantic_invalid_ref", `Stage ref ${command.stageRef} не существует`);
    if (command.taskRef && refs.get(command.taskRef)?.type !== "task.create") throw new AiEditSemanticCompileError("ai_semantic_invalid_ref", `Task ref ${command.taskRef} не существует`);
    if (command.targetRef && !refs.has(command.targetRef)) throw new AiEditSemanticCompileError("ai_semantic_invalid_ref", `Target ref ${command.targetRef} не существует`);
  }
  const ordered = semantic.commands.map((command, index) => ({ command, index })).sort((a, b) => creationPhase(a.command.type) - creationPhase(b.command.type) || a.index - b.index);
  const allocated = new Map(), used = { stages: new Set(), tasks: new Set(), executors: new Set(), tags: new Set() };
  const availableRequest = () => { const existing = indexProject(projected).allIds; return { ...request, idPool: Object.fromEntries(Object.entries(request.idPool).map(([kind, ids]) => [kind, ids.filter((id) => !used[kind].has(id) && !existing.has(id))])) }; };
  let projected = structuredClone(project); const operations = [];
  for (const { command, index } of ordered) {
    const located = command.targetRef ? allocated.get(command.targetRef) : null;
    const resolvedTarget = located ? { kind: located.kind, id: located.id } : confirmedTargets[index]?.target || null;
    const taskId = command.taskRef ? allocated.get(command.taskRef)?.id : confirmedTargets[index]?.task?.id || command.taskId;
    const stageId = command.stageRef ? allocated.get(command.stageRef)?.id : confirmedTargets[index]?.stage?.id;
    const clean = withoutPlanFields(command);
    const one = { kind: "command", summary: semantic.summary, command: clean, warnings: [] };
    const diff = compileAiEditSemanticCommand({ semantic: one, request: availableRequest(), project: projected,
      resolvedTarget: command.type === "task.create" ? { kind: "stage", id: stageId } : resolvedTarget,
      resolvedTask: ["executor.createAnonymous", "executor.createFromPerformer"].includes(command.type) ? { id: taskId } : null,
      performer: command.type === "executor.createFromPerformer" ? performers.find((item) => item.id === command.performerId) : performer, performers });
    const offset = operations.length;
    operations.push(...diff.operations.map((operation, operationIndex) => ({ ...operation, id: `semantic-${offset + operationIndex + 1}` })));
    for (const operation of diff.operations) {
      if (operation.type === "stage.add") used.stages.add(operation.value.stageId);
      if (operation.type === "task.add") used.tasks.add(operation.value.taskId);
      if (["executor.addAnonymous", "executor.addFromPerformer"].includes(operation.type)) used.executors.add(operation.value.executorId);
      for (const key of ["roleTagId", "tagId"]) if (operation.value?.[key]) used.tags.add(operation.value[key]);
    }
    projected = applyAiEditOperations(projected, diff, { performers, idPool: request.idPool, instruction: request.instruction, selectedSources: request.knowledge.selectedSources });
    const first = diff.operations[0];
    if (command.ref && command.type === "stage.create") allocated.set(command.ref, { kind: "stage", id: first.value.stageId });
    if (command.ref && command.type === "task.create") allocated.set(command.ref, { kind: "task", id: first.value.taskId });
    if (command.ref && command.type === "executor.createAnonymous") allocated.set(command.ref, { kind: "executor", id: first.value.executorId });
  }
  const result = { schemaVersion: 1, kind: "diff", requestId: request.requestId, baseRevision: request.baseRevision, scope: request.scope, summary: semantic.summary, operations, warnings: semantic.warnings };
  try { applyAiEditOperations(project, result, { performers, idPool: request.idPool, instruction: request.instruction, selectedSources: request.knowledge.selectedSources }); }
  catch (error) { if (error instanceof AiEditValidationError) throw new AiEditSemanticCompileError(`ai_compile_${error.code}`, error.message); throw error; }
  return result;
}
