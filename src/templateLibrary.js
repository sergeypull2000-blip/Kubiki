import { TEMPLATE_KEYS, loadTemplates, saveTemplates } from "./templates.js";

export const TEMPLATE_LIBRARY_DATA_VERSION = 1;
export const TEMPLATE_FOLDERS_KEY = "kubiki_template_folders";
export const TEMPLATE_PRE_SERVER_BACKUP_KEY = "kubiki_templates_pre_server_backup_v1";
export const TEMPLATE_SERVER_OWNER_KEY = "kubiki_templates_server_user_v1";

export const DEFAULT_TEMPLATE_CATEGORIES = [
  { id: "new", name: "Новые", system: true },
  { id: "cg", name: "CG" },
  { id: "marketing", name: "Маркетинг" },
  { id: "production", name: "Съёмки" },
  { id: "web", name: "Разработка" },
];

const FORBIDDEN_KEYS = new Set(["session", "authSession", "auth", "env", "secret", "secrets", "accessToken", "refreshToken"]);

function cloneSafe(value) {
  if (Array.isArray(value)) return value.map(cloneSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_KEYS.has(key))
    .map(([key, item]) => [key, cloneSafe(item)]));
  return value === undefined ? null : value;
}

const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];

function normalizeCategories(value) {
  const result = [], ids = new Set();
  const source = array(value);
  const incomingNew = source.find((item) => String(item?.id) === "new");
  result.push({ ...DEFAULT_TEMPLATE_CATEGORIES[0], ...object(incomingNew), id: "new", system: true });
  ids.add("new");
  for (const category of source) {
    const copy = cloneSafe(object(category));
    const id = String(copy.id || "").trim();
    if (!id || id === "new" || id === "uncategorized" || ids.has(id)) continue;
    ids.add(id); result.push({ ...copy, id });
  }
  return result;
}

export function normalizeTemplateLibrary(input) {
  const source = object(input);
  return {
    ...cloneSafe(source),
    dataVersion: Number.isInteger(source.dataVersion) && source.dataVersion > 0 ? source.dataVersion : TEMPLATE_LIBRARY_DATA_VERSION,
    projectTemplates: cloneSafe(array(source.projectTemplates)),
    stageTemplates: cloneSafe(array(source.stageTemplates)),
    taskTemplates: cloneSafe(array(source.taskTemplates)),
    categories: normalizeCategories(source.categories),
    metadata: cloneSafe(object(source.metadata)),
  };
}

export const serializeTemplateLibraryForServer = (library) => cloneSafe(normalizeTemplateLibrary(library));
export const deserializeTemplateLibraryFromServer = (row) => normalizeTemplateLibrary(row?.library_data);
export const hasMeaningfulTemplateLibrary = (library) => {
  const value = normalizeTemplateLibrary(library);
  if (value.metadata.hasPersistedLocalData === false) return false;
  return value.projectTemplates.length + value.stageTemplates.length + value.taskTemplates.length > 0 || value.categories.some((item) => item.id !== "new");
};

function parseArray(storage, key) {
  try { const value = JSON.parse(storage?.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}

export function loadLocalTemplateLibrary(storage = globalThis.localStorage) {
  const templateKeys = [TEMPLATE_KEYS.projects, TEMPLATE_KEYS.stages, TEMPLATE_KEYS.tasks];
  const hasPersistedLocalData = [...templateKeys, TEMPLATE_FOLDERS_KEY].some((key) => storage?.getItem(key) !== null);
  let categories = parseArray(storage, TEMPLATE_FOLDERS_KEY);
  if (!categories.length && storage?.getItem(TEMPLATE_FOLDERS_KEY) === null) categories = DEFAULT_TEMPLATE_CATEGORIES;
  return normalizeTemplateLibrary({
    projectTemplates: parseArray(storage, TEMPLATE_KEYS.projects),
    stageTemplates: parseArray(storage, TEMPLATE_KEYS.stages),
    taskTemplates: parseArray(storage, TEMPLATE_KEYS.tasks),
    categories,
    metadata: { openCategoryIds: ["new"], hasPersistedLocalData },
  });
}

export function saveLocalTemplateLibrary(library, storage = globalThis.localStorage) {
  const value = normalizeTemplateLibrary(library);
  try {
    storage?.setItem(TEMPLATE_KEYS.projects, JSON.stringify(value.projectTemplates));
    storage?.setItem(TEMPLATE_KEYS.stages, JSON.stringify(value.stageTemplates));
    storage?.setItem(TEMPLATE_KEYS.tasks, JSON.stringify(value.taskTemplates));
    storage?.setItem(TEMPLATE_FOLDERS_KEY, JSON.stringify(value.categories.filter((item) => !item.system)));
  } catch { /* local backup may be unavailable */ }
  return value;
}

export function createTemplateLibraryBackup(storage = globalThis.localStorage) {
  if (!storage || storage.getItem(TEMPLATE_PRE_SERVER_BACKUP_KEY) !== null) return false;
  const keys = [...Object.values(TEMPLATE_KEYS), TEMPLATE_FOLDERS_KEY];
  const values = Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]));
  storage.setItem(TEMPLATE_PRE_SERVER_BACKUP_KEY, JSON.stringify({ dataVersion: 1, createdAt: new Date().toISOString(), values }));
  return true;
}

export const markTemplateServerOwner = (userId, storage = globalThis.localStorage) => storage?.setItem(TEMPLATE_SERVER_OWNER_KEY, userId);
export function localTemplateLibraryForUser(userId, storage = globalThis.localStorage) {
  const owner = storage?.getItem(TEMPLATE_SERVER_OWNER_KEY);
  return owner && owner !== userId ? normalizeTemplateLibrary() : loadLocalTemplateLibrary(storage);
}
export const templateLibrariesEqual = (a, b) => JSON.stringify(normalizeTemplateLibrary(a)) === JSON.stringify(normalizeTemplateLibrary(b));

export async function migrateLocalTemplateLibrary({ userId, library, repository, storage = globalThis.localStorage }) {
  createTemplateLibraryBackup(storage);
  const canonical = normalizeTemplateLibrary(library);
  const saved = await repository.upsertTemplateLibrary(userId, canonical);
  return normalizeTemplateLibrary(saved);
}

// Kept for compatibility with callers/tests that use the old helpers directly.
export { loadTemplates, saveTemplates };
