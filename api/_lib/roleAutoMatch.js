import { matchTaskToRoles, normalizeRoleText } from "../../src/cgTaskRoleTaxonomy.js";

/* Детерминированный пост-процессор «Использовать шаблоны студии»:
   заменяет анонимных исполнителей с ролью на performer_binding из базы,
   когда роль однозначно указывает на исполнителя. */

const displayName = (performer) => [performer?.firstName, performer?.lastName].filter(Boolean).join(" ").trim();

function stable(performers) {
  return [...performers].sort((a, b) => {
    const x = String(a.id ?? ""), y = String(b.id ?? "");
    return x === y ? 0 : x < y ? -1 : 1;
  });
}

function exactPrimary(role, performers) {
  const target = normalizeRoleText(role);
  return target ? performers.filter((performer) => normalizeRoleText(performer.primaryRole) === target) : [];
}

function exactAdditional(role, performers) {
  const target = normalizeRoleText(role);
  return target ? performers.filter((performer) => (performer.additionalRoles || []).some((item) => normalizeRoleText(item) === target)) : [];
}

function fuzzy(role, performers) {
  const target = normalizeRoleText(role);
  if (!target) return [];
  const tokens = target.split(" ").filter((token) => token.length >= 3);
  if (!tokens.length) return [];
  return performers.filter((performer) => {
    const roles = [performer.primaryRole, ...(performer.additionalRoles || [])].map(normalizeRoleText).filter(Boolean);
    return roles.some((item) => tokens.some((token) => item.includes(token) || item.split(" ").some((part) => part.startsWith(token) || token.startsWith(part))));
  });
}

function firstByPriority(roles, performers) {
  for (const role of roles) {
    for (const matcher of [exactPrimary, exactAdditional, fuzzy]) {
      const matches = stable(matcher(role, performers));
      if (matches.length) return matches[0];
    }
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
      const taskRoles = matchTaskToRoles(task.name);
      for (const executor of task.executors || []) {
        if (executor.type !== "anonymous_unnamed") continue;
        const candidateRoles = executor.role ? [executor.role, ...taskRoles] : taskRoles;
        const match = firstByPriority(candidateRoles, active);
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
