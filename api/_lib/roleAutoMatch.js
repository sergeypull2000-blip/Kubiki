import { matchTaskToRoles, normalizeRoleText } from "../../src/cgTaskRoleTaxonomy.js";

/* Детерминированный пост-процессор «Использовать шаблоны студии»:
   заменяет анонимных исполнителей с ролью на performer_binding из базы,
   когда роль однозначно указывает на исполнителя. */

const displayName = (performer) => [performer?.firstName, performer?.lastName].filter(Boolean).join(" ").trim();

function exactPrimary(role, performers) {
  const target = normalizeRoleText(role);
  return target ? performers.filter((performer) => normalizeRoleText(performer.primaryRole) === target) : [];
}

function exactAdditional(role, performers) {
  const target = normalizeRoleText(role);
  return target ? performers.filter((performer) => (performer.additionalRoles || []).some((item) => normalizeRoleText(item) === target)) : [];
}

function candidatesForRole(role, performers) {
  const primary = exactPrimary(role, performers);
  const additional = exactAdditional(role, performers).filter((performer) => !primary.includes(performer));
  return { primary, additional, all: [...primary, ...additional] };
}

function uniqueCandidateByPriority(roles, performers) {
  for (const role of roles) {
    const candidates = candidatesForRole(role, performers);
    if (candidates.all.length === 1) return candidates.all[0];
    if (candidates.all.length > 1) return null;
  }
  return null;
}

function uniqueName(performer, performers) {
  const name = displayName(performer);
  return Boolean(name) && performers.filter((item) => displayName(item) === name).length === 1;
}

export function autoMatchPerformersByRole(estimate, { performers = [], useStudioTemplates = false } = {}) {
  if (!estimate || !useStudioTemplates || !Array.isArray(performers) || !performers.length) return estimate;
  const active = performers.filter((performer) => performer?.id && performer?.active !== false);
  if (!active.length) return estimate;
  let counter = 0;
  const nextKey = () => `auto-role-${++counter}`;
  for (const stage of estimate.stages || []) {
    for (const task of stage.tasks || []) {
      const taskRoles = matchTaskToRoles(task.name, { includeCrossCutting: false });
      for (const executor of task.executors || []) {
        if (executor.type !== "anonymous_unnamed") continue;
        const candidateRoles = taskRoles.length ? taskRoles : executor.role ? [executor.role] : [];
        const match = uniqueCandidateByPriority(candidateRoles, active);
        if (!match || !uniqueName(match, active)) continue;
        executor.type = "performer_binding";
        executor.key = nextKey();
        executor.performerName = displayName(match);
        delete executor.name;
        delete executor.role;
        delete executor.paymentType;
        delete executor.compensation;
        delete executor.quantity;
        delete executor.tax;
      }
    }
  }
  return estimate;
}
