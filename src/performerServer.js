import { normalizePerformer, normalizePerformerLibrary, PERFORMER_LIBRARY_KEY } from "./performerLibrary.js";

export const PERFORMER_PRE_SERVER_BACKUP_KEY = "kubiki_performers_pre_server_backup_v1";
export const PERFORMER_SERVER_OWNER_KEY = "kubiki_performers_server_user_v1";

const clone = (value) => JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? null : item));

export function getPerformerClientId(performer) {
  const id = performer?.id;
  if (typeof id !== "string" && typeof id !== "number") throw new Error("Performer must have an id");
  const clientId = String(id).trim();
  if (!clientId) throw new Error("Performer must have a non-empty id");
  return clientId;
}

export function serializePerformerForServer(performer) {
  return clone(normalizePerformer(performer));
}

export function buildPerformerRow(userId, performer) {
  if (!userId) throw new Error("userId is required");
  const canonical = serializePerformerForServer(performer);
  return { user_id: userId, client_id: getPerformerClientId(canonical), performer_data: canonical };
}

export function deserializePerformerFromServer(row) {
  const source = row?.performer_data && typeof row.performer_data === "object" && !Array.isArray(row.performer_data) ? clone(row.performer_data) : {};
  source.id = String(row?.client_id || source.id || "").trim();
  return normalizePerformer(source);
}

export function normalizePerformerRows(rows, expectedUserId) {
  return normalizePerformerLibrary((Array.isArray(rows) ? rows : [])
    .filter((row) => !expectedUserId || row?.user_id === expectedUserId)
    .map(deserializePerformerFromServer));
}

export function createPerformerBackup(storage = globalThis.localStorage) {
  if (!storage || storage.getItem(PERFORMER_PRE_SERVER_BACKUP_KEY) !== null) return false;
  const original = storage.getItem(PERFORMER_LIBRARY_KEY);
  if (original === null) return false;
  storage.setItem(PERFORMER_PRE_SERVER_BACKUP_KEY, original);
  return true;
}

export function localPerformersForUser(userId, storage = globalThis.localStorage) {
  if (!storage) return [];
  const owner = storage.getItem(PERFORMER_SERVER_OWNER_KEY);
  if (owner && owner !== userId) return [];
  try { return normalizePerformerLibrary(JSON.parse(storage.getItem(PERFORMER_LIBRARY_KEY) || "[]")); } catch { return []; }
}

export function markPerformerServerOwner(userId, storage = globalThis.localStorage) {
  storage?.setItem(PERFORMER_SERVER_OWNER_KEY, userId);
}

export function missingLocalPerformers(local, server) {
  const serverIds = new Set((server || []).map(getPerformerClientId));
  return normalizePerformerLibrary(local).filter((item) => !serverIds.has(getPerformerClientId(item)));
}

export function shouldOfferPerformerMigration(server, local) {
  return missingLocalPerformers(local, server).length > 0;
}

export async function migrateLocalPerformers({ userId, performers, repository, storage = globalThis.localStorage }) {
  createPerformerBackup(storage);
  const normalized = normalizePerformerLibrary(clone(performers || []));
  const results = [];
  for (const performer of normalized) {
    try { results.push({ performerId: performer.id, ok: true, value: await repository.upsertPerformer(userId, performer) }); }
    catch (error) { results.push({ performerId: performer.id, ok: false, error }); }
  }
  const failed = results.filter((item) => !item.ok);
  if (failed.length) { const error = new Error(`Не удалось перенести карточек: ${failed.length}`); error.results = results; throw error; }
  return results;
}
