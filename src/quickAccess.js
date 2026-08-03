import { uid } from "./utils.js";

export const QUICK_ACCESS_KEY = "kubiki_quick_access_v2";
export const LEGACY_QUICK_ACCESS_KEY = "kubiki_quick_access_v1";
export const QUICK_ACCESS_MIGRATION_KEY = "kubiki_quick_access_v2_migrated";

const text = (value) => typeof value === "string" ? value.trim() : "";
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeQuickAccessItem(value = {}, fallbackOrder = 0, now = new Date().toISOString()) {
  const performerId = text(value.performerId);
  if (!performerId) return null;
  return { id: text(value.id) || uid(), performerId, pinned: Boolean(value.pinned), order: number(value.order, fallbackOrder), createdAt: text(value.createdAt) || now };
}

export function normalizeQuickAccessState(value) {
  const source = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
  const seenIds = new Set();
  const items = source.map((item, index) => normalizeQuickAccessItem(item, index)).filter((item) => item && !seenIds.has(item.id) && seenIds.add(item.id));
  return { items };
}

export function createQuickAccessItem(performerId, input = {}, now = new Date().toISOString()) {
  return normalizeQuickAccessItem({ ...input, performerId, createdAt: now }, input.order ?? 0, now);
}

export function sortQuickAccessItems(state) {
  return [...normalizeQuickAccessState(state).items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function addQuickAccessItem(state, input) {
  const next = normalizeQuickAccessState(state), item = normalizeQuickAccessItem(input, 0);
  if (!item) return next;
  if (next.items.some((entry) => entry.performerId === item.performerId)) return next;
  const pinned = next.items.filter((entry) => entry.pinned), unpinned = next.items.filter((entry) => !entry.pinned);
  if (item.pinned) return { items: [...pinned, { ...item, order: pinned.length }, ...unpinned] };
  return { items: [...pinned, { ...item, order: -1 }, ...unpinned.map((entry) => ({ ...entry, order: entry.order + 1 }))] };
}
export function applyQuickAccessPreference(state, performerId, enabled) {
  return enabled ? addQuickAccessItem(state, createQuickAccessItem(performerId)) : normalizeQuickAccessState(state);
}

export function pinQuickAccessItem(state, itemId) {
  const next = normalizeQuickAccessState(state), pinnedCount = next.items.filter((item) => item.pinned).length;
  return { items: next.items.map((item) => item.id === itemId ? { ...item, pinned: true, order: pinnedCount } : item) };
}
export function unpinQuickAccessItem(state, itemId) {
  const next = normalizeQuickAccessState(state);
  return { items: next.items.map((item) => item.id === itemId ? { ...item, pinned: false, order: -1 } : !item.pinned ? { ...item, order: item.order + 1 } : item) };
}
export function removeQuickAccessItem(state, itemId) { return { items: normalizeQuickAccessState(state).items.filter((item) => item.id !== itemId) }; }
export function removeQuickAccessByPerformerId(state, performerId) { return { items: normalizeQuickAccessState(state).items.filter((item) => item.performerId !== performerId) }; }

export function loadQuickAccessState(storage = globalThis.localStorage) {
  try { return normalizeQuickAccessState(JSON.parse(storage?.getItem(QUICK_ACCESS_KEY) || "{}")); } catch { return { items: [] }; }
}
export function saveQuickAccessState(state, storage = globalThis.localStorage) {
  const next = normalizeQuickAccessState(state); try { storage?.setItem(QUICK_ACCESS_KEY, JSON.stringify(next)); } catch { /* unavailable */ } return next;
}

export function migrateLegacyQuickAccess(state, storage = globalThis.localStorage) {
  const current = normalizeQuickAccessState(state);
  try {
    if (storage?.getItem(QUICK_ACCESS_MIGRATION_KEY) === "1") return current;
    const legacy = JSON.parse(storage?.getItem(LEGACY_QUICK_ACCESS_KEY) || "{}");
    const candidates = [
      ...(Array.isArray(legacy?.pinned) ? legacy.pinned.filter((item) => item.pinned !== false) : []),
      ...(Array.isArray(legacy?.items) ? legacy.items.filter((item) => item.pinned || item.performerId) : []),
    ];
    const existingLegacyIds = new Set(current.items.map((item) => item.id));
    const migrated = candidates.map((item, index) => normalizeQuickAccessItem({ ...item, pinned: Boolean(item.pinned), order: index }, index)).filter((item) => item && !existingLegacyIds.has(item.id) && existingLegacyIds.add(item.id));
    const result = normalizeQuickAccessState({ items: [...current.items, ...migrated] });
    storage?.setItem(QUICK_ACCESS_KEY, JSON.stringify(result)); storage?.setItem(QUICK_ACCESS_MIGRATION_KEY, "1");
    return result;
  } catch { return current; }
}
