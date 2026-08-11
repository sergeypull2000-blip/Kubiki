import { normalizeSearchText } from "./retrieval.js";

const ASSIGNMENT_INTENT = /(?:назнач\p{L}*|добав\p{L}*|постав\p{L}*|замен\p{L}*|исполнител\p{L}*)/iu;

function displayName(performer) { return [performer?.firstName, performer?.lastName].filter(Boolean).join(" ").trim(); }

export function resolveExplicitPerformers(instruction, performers, selectedSources = []) {
  const selectedIds = new Set(selectedSources.filter((item) => item.kind === "performer").map((item) => item.id));
  const selected = performers.filter((item) => selectedIds.has(item.id));
  if (selected.length) return { performers: selected, clarification: null };
  if (!ASSIGNMENT_INTENT.test(instruction)) return { performers: [], clarification: null };
  const query = normalizeSearchText(instruction);
  const full = performers.filter((item) => { const name = normalizeSearchText(displayName(item)); return name && query.includes(name); });
  if (full.length === 1) return { performers: full, clarification: null };
  if (full.length > 1) return ambiguity(full);
  const first = performers.filter((item) => { const name = normalizeSearchText(item.firstName), stem = name.slice(0, Math.max(3, name.length - 1)); return stem.length >= 3 && query.split(/\s+/).some((word) => word.startsWith(stem)); });
  if (first.length === 1) return { performers: first, clarification: null };
  if (first.length > 1) return ambiguity(first);
  return { performers: [], clarification: null };
}

function ambiguity(items) {
  return {
    performers: [],
    clarification: {
      question: `Какого исполнителя выбрать: ${items.map((item) => displayName(item) || item.primaryRole || item.id).join(" или ")}?`,
      choices: items.slice(0, 10).map((item) => ({ id: `performer:${item.id}`, label: [displayName(item), item.primaryRole].filter(Boolean).join(" — ") || item.id, source: { kind: "performer", id: item.id, name: displayName(item) || item.primaryRole || item.id } })),
    },
  };
}
