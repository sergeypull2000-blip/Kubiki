import { normalizeQuickAccessItem, normalizeQuickAccessState, QUICK_ACCESS_KEY } from "./quickAccess.js";

export const QUICK_ACCESS_PRE_SERVER_BACKUP_KEY = "kubiki_quick_access_pre_server_backup_v1";
export const QUICK_ACCESS_SERVER_OWNER_KEY = "kubiki_quick_access_server_user_v1";

const KNOWN_FIELDS = new Set(["id", "performerId", "pinned", "order", "performer", "project", "executor", "session", "authSession", "env", "secret", "secrets"]);
const clone = (value) => { try { return structuredClone(value); } catch { try { return JSON.parse(JSON.stringify(value)); } catch { return {}; } } };

export function getQuickAccessItemClientId(item) {
  const id = item?.id;
  if (typeof id !== "string" && typeof id !== "number") throw new Error("QuickAccessItem must have an id");
  const result = String(id).trim();
  if (!result) throw new Error("QuickAccessItem must have a non-empty id");
  return result;
}

export function serializeQuickAccessItemForServer(item) {
  const normalized = normalizeQuickAccessItem(clone(item));
  if (!normalized) throw new Error("QuickAccessItem must reference a Performer");
  const itemData = Object.fromEntries(Object.entries(normalized).filter(([key]) => !KNOWN_FIELDS.has(key)));
  return { clientId: normalized.id, performerClientId: normalized.performerId, pinned: normalized.pinned, sortOrder: normalized.order, itemData: clone(itemData) };
}

export function buildQuickAccessRow(userId, item) {
  if (!userId) throw new Error("userId is required");
  const serialized = serializeQuickAccessItemForServer(item);
  return { user_id: userId, client_id: serialized.clientId, performer_client_id: serialized.performerClientId, pinned: serialized.pinned, sort_order: serialized.sortOrder, item_data: serialized.itemData };
}

export function deserializeQuickAccessItemFromServer(row) {
  const extra = row?.item_data && typeof row.item_data === "object" && !Array.isArray(row.item_data) ? clone(row.item_data) : {};
  return normalizeQuickAccessItem({ ...extra, id: String(row?.client_id || "").trim(), performerId: String(row?.performer_client_id || "").trim(), pinned: row?.pinned, order: row?.sort_order });
}

export function normalizeQuickAccessServerRows(rows, expectedUserId, performerIds) {
  const validPerformers = performerIds instanceof Set ? performerIds : new Set(performerIds || []);
  const filterPerformers = performerIds !== undefined && performerIds !== null;
  return normalizeQuickAccessState({ items: (Array.isArray(rows) ? rows : [])
    .filter((row) => (!expectedUserId || row?.user_id === expectedUserId) && (!filterPerformers || validPerformers.has(row?.performer_client_id)))
    .map(deserializeQuickAccessItemFromServer).filter(Boolean) });
}

export function createQuickAccessBackup(storage = globalThis.localStorage) {
  if (!storage || storage.getItem(QUICK_ACCESS_PRE_SERVER_BACKUP_KEY) !== null) return false;
  const original = storage.getItem(QUICK_ACCESS_KEY);
  if (original === null) return false;
  storage.setItem(QUICK_ACCESS_PRE_SERVER_BACKUP_KEY, original);
  return true;
}

export function localQuickAccessForUser(userId, storage = globalThis.localStorage) {
  if (!storage || (storage.getItem(QUICK_ACCESS_SERVER_OWNER_KEY) && storage.getItem(QUICK_ACCESS_SERVER_OWNER_KEY) !== userId)) return { items: [] };
  try { return normalizeQuickAccessState(JSON.parse(storage.getItem(QUICK_ACCESS_KEY) || "{}")); } catch { return { items: [] }; }
}

export const markQuickAccessServerOwner = (userId, storage = globalThis.localStorage) => storage?.setItem(QUICK_ACCESS_SERVER_OWNER_KEY, userId);

export function missingLocalQuickAccessItems(localState, serverState, performerIds) {
  const serverPerformers = new Set(normalizeQuickAccessState(serverState).items.map((item) => item.performerId));
  const valid = new Set(performerIds || []);
  const skipped = [];
  const items = normalizeQuickAccessState(localState).items.filter((item) => {
    if (serverPerformers.has(item.performerId)) return false;
    if (!valid.has(item.performerId)) { skipped.push(item); return false; }
    return true;
  });
  return { items, skipped };
}

export async function migrateLocalQuickAccess({ userId, items, performerIds, repository, storage = globalThis.localStorage }) {
  createQuickAccessBackup(storage);
  const valid = new Set(performerIds || []), results = [];
  for (const item of normalizeQuickAccessState({ items }).items) {
    if (!valid.has(item.performerId)) { results.push({ itemId: item.id, ok: false, skipped: true, error: new Error("Performer не найден") }); continue; }
    try { results.push({ itemId: item.id, ok: true, value: await repository.upsertQuickAccessItem(userId, item) }); }
    catch (error) { results.push({ itemId: item.id, ok: false, error }); }
  }
  const failed = results.filter((result) => !result.ok && !result.skipped);
  if (failed.length) { const error = new Error(`Не удалось перенести элементов: ${failed.length}`); error.results = results; throw error; }
  return results;
}
