import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TEMPLATE_FOLDERS_KEY, TEMPLATE_PRE_SERVER_BACKUP_KEY, TEMPLATE_SERVER_OWNER_KEY,
  createTemplateLibraryBackup, deserializeTemplateLibraryFromServer, hasMeaningfulTemplateLibrary,
  loadLocalTemplateLibrary, localTemplateLibraryForUser, migrateLocalTemplateLibrary,
  normalizeTemplateLibrary, saveLocalTemplateLibrary, serializeTemplateLibraryForServer,
} from "../src/templateLibrary.js";
import { TEMPLATE_KEYS, cloneProjectTemplate, cloneStageTemplate, cloneTaskTemplate } from "../src/templates.js";

const memoryStorage = (initial = {}) => { const values = new Map(Object.entries(initial)); return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values }; };
const library = () => ({ dataVersion: 3, projectTemplates: [{ id: "p", name: "Same", stages: [{ id: "s", tasks: [{ id: "t", executors: [{ id: "e", amount: "1250", performerId: "perf", performerSnapshot: { rate: "500" }, tags: [{ id: "tag", key: "tax", value: "6" }] }] }] }], exportSettings: { mode: "client" }, unknown: { kept: true } }], stageTemplates: [{ id: "st", tasks: [] }], taskTemplates: [{ id: "tt", executors: [], directCost: "9.50" }, { id: "tt2", name: "Same", executors: [] }], categories: [{ id: "new", name: "Новые", system: true }, { id: "c", name: "Folder", custom: 1 }], metadata: { openCategoryIds: ["c", "new"], future: true } });

test("library serialization round-trip preserves templates, nesting, order and unknown fields without mutation", () => {
  const input = library(), before = structuredClone(input);
  const serialized = serializeTemplateLibraryForServer(input);
  const restored = deserializeTemplateLibraryFromServer({ library_data: serialized });
  assert.deepEqual(input, before);
  assert.deepEqual(restored.projectTemplates[0].unknown, { kept: true });
  assert.equal(restored.projectTemplates[0].stages[0].tasks[0].executors[0].amount, "1250");
  assert.equal(restored.taskTemplates[0].directCost, "9.50");
  assert.deepEqual(restored.categories.map((item) => item.id), ["new", "c"]);
  assert.deepEqual(restored.metadata.openCategoryIds, ["c", "new"]);
});

test("normalization is safe, idempotent, does not duplicate New and keeps equal names with distinct ids", () => {
  const damaged = normalizeTemplateLibrary({ library_data: "bad", categories: [{ id: "new" }, { id: "new" }], taskTemplates: [{ id: "1", name: "x" }, { id: "2", name: "x" }] });
  assert.deepEqual(normalizeTemplateLibrary(damaged), damaged);
  assert.equal(damaged.categories.filter((item) => item.id === "new").length, 1);
  assert.equal(damaged.taskTemplates.length, 2);
  assert.deepEqual(deserializeTemplateLibraryFromServer({ library_data: "broken" }).projectTemplates, []);
});

test("auth session, env and secrets are excluded from library_data", () => {
  const value = serializeTemplateLibraryForServer({ ...library(), authSession: { token: "x" }, env: { key: "x" }, metadata: { secret: "x", okay: true } });
  assert.equal(value.authSession, undefined); assert.equal(value.env, undefined); assert.deepEqual(value.metadata, { okay: true });
});

test("local backup captures every template key including legacy performers once and never deletes localStorage", () => {
  const initial = Object.fromEntries([...Object.values(TEMPLATE_KEYS), TEMPLATE_FOLDERS_KEY].map((key) => [key, `["${key}"]`]));
  const storage = memoryStorage(initial);
  assert.equal(createTemplateLibraryBackup(storage), true);
  const first = storage.getItem(TEMPLATE_PRE_SERVER_BACKUP_KEY);
  storage.setItem(TEMPLATE_KEYS.projects, "changed");
  assert.equal(createTemplateLibraryBackup(storage), false);
  assert.equal(storage.getItem(TEMPLATE_PRE_SERVER_BACKUP_KEY), first);
  assert.equal(JSON.parse(first).values[TEMPLATE_KEYS.performers], initial[TEMPLATE_KEYS.performers]);
  assert.notEqual(storage.getItem(TEMPLATE_KEYS.tasks), null);
});

test("local canonical load/save excludes legacy performer templates from active library and is owner scoped", () => {
  const storage = memoryStorage({ [TEMPLATE_KEYS.performers]: '[{"id":"legacy"}]', [TEMPLATE_KEYS.tasks]: '[{"id":"task"}]', [TEMPLATE_SERVER_OWNER_KEY]: "u1" });
  assert.equal(loadLocalTemplateLibrary(storage).taskTemplates.length, 1);
  assert.equal("performerTemplates" in loadLocalTemplateLibrary(storage), false);
  assert.equal(localTemplateLibraryForUser("u2", storage).taskTemplates.length, 0);
  saveLocalTemplateLibrary(library(), storage);
  assert.equal(storage.getItem(TEMPLATE_KEYS.performers), '[{"id":"legacy"}]');
});

test("migration offers only meaningful local state, creates backup before one atomic upsert and keeps local data", async () => {
  assert.equal(hasMeaningfulTemplateLibrary(normalizeTemplateLibrary()), false);
  assert.equal(hasMeaningfulTemplateLibrary(library()), true);
  const storage = memoryStorage({ [TEMPLATE_KEYS.tasks]: '[{"id":"task"}]' });
  const calls = [];
  const repository = { upsertTemplateLibrary: async (userId, value) => { calls.push([userId, value]); assert.notEqual(storage.getItem(TEMPLATE_PRE_SERVER_BACKUP_KEY), null); return value; } };
  await migrateLocalTemplateLibrary({ userId: "u", library: library(), repository, storage });
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "u"); assert.notEqual(storage.getItem(TEMPLATE_KEYS.tasks), null);
});

test("using project, stage and task templates creates fresh ids and never mutates templates", () => {
  const original = library().projectTemplates[0], before = structuredClone(original);
  assert.notEqual(cloneProjectTemplate(original).id, original.id);
  assert.notEqual(cloneStageTemplate(original.stages[0]).id, original.stages[0].id);
  assert.notEqual(cloneTaskTemplate(original.stages[0].tasks[0]).id, original.stages[0].tasks[0].id);
  assert.deepEqual(original, before);
});

test("repository scopes every operation to user_id and migration has complete RLS CRUD without service role", () => {
  const repository = readFileSync(new URL("../src/repositories/templateLibraryRepository.js", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260804040000_create_template_libraries.sql", import.meta.url), "utf8");
  assert.match(repository, /\.eq\("user_id", userId\)/); assert.match(repository, /user_id: userId/); assert.doesNotMatch(repository, /service_role/i);
  for (const operation of ["select", "insert", "update", "delete"]) assert.match(migration, new RegExp(`for ${operation} to authenticated`));
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/); assert.doesNotMatch(migration, /service_role/i);
});

test("integration contains hydration guard, local fallback, debounce, retry, logout cleanup and shared Dashboard/Workspace state", () => {
  const app = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  assert.match(app, /templateSyncEnabledRef\.current = false/); assert.match(app, /if \(schedule && templateSyncEnabledRef\.current\)/);
  assert.match(app, /setTimeout[\s\S]*650/); assert.match(app, /replaceTemplateLibrary\(local, \{ schedule: false \}\)/);
  assert.match(app, /setTemplateRetry/); assert.match(app, /replaceTemplateLibrary\(normalizeTemplateLibrary\(\), \{ persist: false, schedule: false \}\)/);
  assert.match(app, /projectTemplates=\{projectTemplates\}/); assert.match(app, /taskTemplates=\{templateLibrary\.taskTemplates\}/);
  assert.match(app, /stageTemplates=\{templateLibrary\.stageTemplates\}/); assert.match(app, /flushTemplateLibrary/);
});
