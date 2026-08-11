import { PROJECT_DATA_VERSION, normalizeProject } from "./store.js";

export const PROJECTS_STORAGE_KEY = "kubiki_state_v1";
export const PRE_SERVER_BACKUP_KEY = "kubiki_state_pre_server_backup_v1";

function jsonSafeClone(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value, (_key, item) => item === undefined ? null : item));
}

export function getProjectClientId(project) {
  const id = project?.id;
  if (typeof id !== "string" && typeof id !== "number") throw new Error("Project must have an id");
  const clientId = String(id).trim();
  if (!clientId) throw new Error("Project must have a non-empty id");
  return clientId;
}

export function serializeProjectForServer(project) {
  return jsonSafeClone(normalizeProject(project));
}

export function buildProjectRow(userId, project) {
  if (!userId) throw new Error("userId is required");
  const canonical = serializeProjectForServer(project);
  return {
    user_id: userId,
    client_id: getProjectClientId(canonical),
    name: typeof canonical.name === "string" ? canonical.name : "",
    data_version: Number.isInteger(canonical.dataVersion) && canonical.dataVersion > 0
      ? canonical.dataVersion
      : PROJECT_DATA_VERSION,
    project_data: canonical,
  };
}

export function deserializeProjectFromServer(row) {
  const source = row?.project_data && typeof row.project_data === "object" && !Array.isArray(row.project_data)
    ? jsonSafeClone(row.project_data)
    : {};
  // The indexed server identity is authoritative. project_data may contain a
  // stale legacy id, but runtime Project.id must always address client_id.
  if (row?.client_id !== undefined && row?.client_id !== null) source.id = String(row.client_id).trim();
  if (source.name === undefined && typeof row?.name === "string") source.name = row.name;
  if (source.dataVersion === undefined && row?.data_version !== undefined && row?.data_version !== null) source.dataVersion = row.data_version;
  return normalizeProject(source);
}

export const normalizeProjectRow = deserializeProjectFromServer;

export function normalizeServerProjects(rows, expectedUserId) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !expectedUserId || row?.user_id === expectedUserId)
    .map(deserializeProjectFromServer);
}

export function diffProjectCollections(localProjects, serverProjects) {
  const ids = (items) => new Set((items || []).map(getProjectClientId));
  const localIds = ids(localProjects);
  const serverIds = ids(serverProjects);
  return {
    onlyLocal: (localProjects || []).filter((project) => !serverIds.has(getProjectClientId(project))),
    onlyServer: (serverProjects || []).filter((project) => !localIds.has(getProjectClientId(project))),
  };
}

export function createLocalServerBackup(storage = globalThis.localStorage) {
  if (!storage || storage.getItem(PRE_SERVER_BACKUP_KEY) !== null) return false;
  const current = storage.getItem(PROJECTS_STORAGE_KEY);
  if (current === null) return false;
  storage.setItem(PRE_SERVER_BACKUP_KEY, current);
  return true;
}

export function shouldOfferProjectMigration(serverProjects, localProjects) {
  return (serverProjects?.length || 0) === 0 && (localProjects?.length || 0) > 0;
}

export async function migrateLocalProjects({ userId, localProjects, repository, storage = globalThis.localStorage }) {
  createLocalServerBackup(storage);
  const projects = (localProjects || []).map((project) => normalizeProject(jsonSafeClone(project)));
  const results = [];
  for (const project of projects) {
    try {
      results.push({ projectId: getProjectClientId(project), ok: true, value: await repository.upsertProject(userId, project) });
    } catch (error) {
      results.push({ projectId: getProjectClientId(project), ok: false, error });
    }
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    const error = new Error(`Не удалось перенести проектов: ${failed.length}`);
    error.results = results;
    throw error;
  }
  return results;
}
