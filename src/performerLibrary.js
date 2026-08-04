import { uid } from "./utils.js";
import { makeTag } from "./store.js";

export const PERFORMER_LIBRARY_KEY = "kubiki_performers_v1";
const text = (value) => typeof value === "string" ? value.trim() : "";
const nullableText = (value) => text(value) || null;
const nullableNumber = (value) => value === "" || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const list = (value) => (Array.isArray(value) ? value : []).map(text).filter(Boolean);
const getTag = (executor, key) => executor?.tags?.find((tag) => tag.key === key);
const paymentUnit = (type) => type === "hourly" ? "hour" : type === "shift" ? "shift" : type ? "total" : null;
const cloneObject = (value) => { try { return structuredClone(value); } catch { try { return JSON.parse(JSON.stringify(value)); } catch { return {}; } } };

export const performerDisplayName = (performer) => [performer?.firstName, performer?.lastName].map(text).filter(Boolean).join(" ");

export function searchPerformers(library, query) {
  const needle = text(query).toLocaleLowerCase("ru-RU");
  if (!needle) return normalizePerformerLibrary(library);
  return normalizePerformerLibrary(library).filter((performer) => [performer.firstName, performer.lastName, performer.primaryRole,
    ...performer.additionalRoles, ...performer.specializations, performer.grade, ...performer.software,
    performer.phone, performer.email, performer.telegram].filter(Boolean).join(" ").toLocaleLowerCase("ru-RU").includes(needle));
}

export const removePerformer = (library, id) => normalizePerformerLibrary(library).filter((performer) => performer.id !== id);

export function normalizePerformer(value = {}, now = new Date().toISOString()) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const primaryRole = text(source.primaryRole);
  return {
    ...cloneObject(source),
    id: text(source.id) || uid(), firstName: text(source.firstName), lastName: text(source.lastName), primaryRole,
    additionalRoles: list(source.additionalRoles).filter((role) => role !== primaryRole),
    specializations: list(source.specializations), grade: nullableText(source.grade), software: list(source.software),
    legalStatus: nullableText(source.legalStatus), defaultPaymentType: nullableText(source.defaultPaymentType),
    defaultRate: nullableNumber(source.defaultRate), defaultUnit: nullableText(source.defaultUnit),
    defaultTaxRate: nullableNumber(source.defaultTaxRate), defaultCommission: nullableNumber(source.defaultCommission),
    phone: text(source.phone), email: text(source.email), telegram: text(source.telegram), notes: text(source.notes),
    active: source.active !== false, createdAt: text(source.createdAt) || now, updatedAt: text(source.updatedAt) || now,
  };
}
export function normalizePerformerLibrary(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set(); return values.map((item) => normalizePerformer(item)).filter((item) => !seen.has(item.id) && seen.add(item.id));
}
export const createPerformer = (library, input, now = new Date().toISOString()) => [...normalizePerformerLibrary(library), normalizePerformer({ ...input, createdAt: now, updatedAt: now }, now)];
export function updatePerformer(library, id, patch, now = new Date().toISOString()) { return normalizePerformerLibrary(library).map((item) => item.id === id ? normalizePerformer({ ...item, ...patch, id: item.id, createdAt: item.createdAt, updatedAt: now }, now) : item); }
export function loadPerformerLibrary(storage = globalThis.localStorage) { try { return normalizePerformerLibrary(JSON.parse(storage?.getItem(PERFORMER_LIBRARY_KEY) || "[]")); } catch { return []; } }
export function savePerformerLibrary(library, storage = globalThis.localStorage) { const next = normalizePerformerLibrary(library); try { storage?.setItem(PERFORMER_LIBRARY_KEY, JSON.stringify(next)); } catch { /* unavailable */ } return next; }

export function buildPerformerFromExecutor(executor) {
  const payment = getTag(executor, "payment")?.payment || {}, names = text(getTag(executor, "name")?.value).split(/\s+/).filter(Boolean);
  return normalizePerformer({ id: "", firstName: names.shift() || "", lastName: names.join(" "), primaryRole: getTag(executor, "role")?.value,
    specializations: [getTag(executor, "spec")?.value].filter(Boolean), grade: getTag(executor, "grade")?.value,
    software: [getTag(executor, "soft")?.value].filter(Boolean), defaultPaymentType: payment.type,
    defaultRate: ["fix_total", "fix_task"].includes(payment.type) ? executor?.amount : payment.rate,
    defaultUnit: paymentUnit(payment.type), defaultTaxRate: getTag(executor, "tax")?.value });
}
export const performerSnapshot = (performer) => ({ name: performerDisplayName(performer), primaryRole: performer.primaryRole, paymentType: performer.defaultPaymentType, rate: performer.defaultRate, unit: performer.defaultUnit, taxRate: performer.defaultTaxRate, commission: performer.defaultCommission, legalStatus: performer.legalStatus });
export function buildExecutorFromPerformer(input) {
  const performer = normalizePerformer(input), name = performerDisplayName(performer), tags = [];
  if (performer.primaryRole) tags.push(makeTag("role", performer.primaryRole));
  if (name) tags.push(makeTag("name", name));
  if (performer.defaultPaymentType) { const payment = makeTag("payment", performer.defaultPaymentType); if (["hourly", "shift"].includes(performer.defaultPaymentType)) payment.payment.rate = String(performer.defaultRate ?? ""); tags.push(payment); }
  if (performer.defaultTaxRate != null) tags.push(makeTag("tax", String(performer.defaultTaxRate)));
  if (performer.specializations[0]) tags.push(makeTag("spec", performer.specializations[0]));
  if (performer.grade) tags.push(makeTag("grade", performer.grade));
  if (performer.software[0]) tags.push(makeTag("soft", performer.software[0]));
  return { id: uid(), tags, amount: ["fix_total", "fix_task"].includes(performer.defaultPaymentType) ? String(performer.defaultRate ?? "") : "", performerId: performer.id, performerSnapshot: performerSnapshot(performer) };
}
export function addPerformerToTask(project, stageId, taskId, performer) {
  if (!performer || !project?.stages?.some((stage) => stage.id === stageId && stage.tasks?.some((task) => task.id === taskId))) return project;
  const executor = buildExecutorFromPerformer(performer);
  return { ...project, stages: project.stages.map((stage) => stage.id !== stageId ? stage : { ...stage, tasks: stage.tasks.map((task) => task.id !== taskId ? task : { ...task, executors: [...task.executors, executor] }) }) };
}
export function linkExecutorToPerformer(project, executorId, performer) {
  if (!project || !performer) return project;
  return { ...project, stages: (project.stages || []).map((stage) => ({ ...stage, tasks: (stage.tasks || []).map((task) => ({ ...task, executors: (task.executors || []).map((executor) => executor.id === executorId ? { ...executor, performerId: performer.id, performerSnapshot: performerSnapshot(performer) } : executor) })) })) };
}
