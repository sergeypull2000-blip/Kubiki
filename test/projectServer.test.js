import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PRE_SERVER_BACKUP_KEY, PROJECTS_STORAGE_KEY, buildProjectRow,
  createLocalServerBackup, deserializeProjectFromServer, diffProjectCollections,
  getProjectClientId, migrateLocalProjects, normalizeServerProjects,
  serializeProjectForServer, shouldOfferProjectMigration,
} from "../src/projectServer.js";
import { PROJECT_DATA_VERSION } from "../src/store.js";

const project = () => ({ id: "abc123", name: "Одинаковое имя", dataVersion: 7, stages: [{ id: "s", tasks: [{ id: "t", executors: [] }] }], unknown: { kept: true } });

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), values };
}

test("Project преобразуется в серверную строку без мутации", () => {
  const input = project();
  const before = structuredClone(input);
  const row = buildProjectRow("user-1", input);
  assert.deepEqual(input, before);
  assert.equal(row.user_id, "user-1");
  assert.equal(row.client_id, "abc123");
  assert.equal(row.name, input.name);
  assert.equal(row.data_version, 7);
  assert.deepEqual(row.project_data.unknown, { kept: true });
});

test("undefined безопасно нормализуется в project_data", () => {
  const result = serializeProjectForServer({ ...project(), optional: undefined });
  assert.equal(result.optional, null);
});

test("legacy and broken projects always produce a valid data_version", () => {
  for (const input of [
    { id: "missing" },
    { id: "null", dataVersion: null },
    { id: "undefined", dataVersion: undefined },
    { id: "broken", dataVersion: "invalid", stages: [{ tasks: [{}] }] },
  ]) {
    const row = buildProjectRow("user-1", input);
    assert.equal(row.data_version, PROJECT_DATA_VERSION);
    assert.equal(row.project_data.dataVersion, PROJECT_DATA_VERSION);
    assert.notEqual(row.data_version, null);
  }
});

test("shared insert, update and upsert payload builder never emits null data_version", () => {
  const legacy = { id: "legacy", dataVersion: null, custom: { kept: true } };
  const payloads = ["insert", "update", "upsert"].map(() => buildProjectRow("user-1", legacy));
  for (const payload of payloads) {
    assert.equal(payload.data_version, PROJECT_DATA_VERSION);
    assert.equal(payload.project_data.dataVersion, PROJECT_DATA_VERSION);
    assert.deepEqual(payload.project_data.custom, { kept: true });
  }
});

test("серверная строка преобразуется в нормализованный Project", () => {
  const result = deserializeProjectFromServer({ client_id: "legacy", name: "Имя", data_version: 3, project_data: { broken: true, stages: [{ tasks: [{}] }] } });
  assert.equal(result.id, "legacy");
  assert.equal(result.name, "Имя");
  assert.equal(result.dataVersion, 3);
  assert.deepEqual(result.stages[0].tasks[0].executors, []);
  assert.equal(result.broken, true);
});

test("server client_id overrides a stale project_data id", () => {
  const result = deserializeProjectFromServer({ client_id: "saved-client-id", project_data: { id: "stale-payload-id", stages: [] } });
  assert.equal(result.id, "saved-client-id");
});

test("существующий id сохраняется и имя не используется как id", () => {
  assert.equal(getProjectClientId(project()), "abc123");
  assert.throws(() => getProjectClientId({ name: "abc123" }));
});

test("два одинаковых имени остаются разными", () => {
  const one = buildProjectRow("u", { ...project(), id: "one" });
  const two = buildProjectRow("u", { ...project(), id: "two" });
  assert.notEqual(one.client_id, two.client_id);
});

test("normalizeServerProjects отбрасывает строки другого пользователя", () => {
  const rows = [
    { user_id: "u1", client_id: "one", project_data: { id: "one" } },
    { user_id: "u2", client_id: "two", project_data: { id: "two" } },
  ];
  assert.deepEqual(normalizeServerProjects(rows, "u1").map((item) => item.id), ["one"]);
});

test("migration предлагается только для пустого сервера и непустой локальной копии", () => {
  assert.equal(shouldOfferProjectMigration([], [project()]), true);
  assert.equal(shouldOfferProjectMigration([], []), false);
  assert.equal(shouldOfferProjectMigration([project()], [project()]), false);
});

test("backup создаётся один раз и не перезаписывается", () => {
  const storage = memoryStorage({ [PROJECTS_STORAGE_KEY]: "first" });
  assert.equal(createLocalServerBackup(storage), true);
  storage.setItem(PROJECTS_STORAGE_KEY, "second");
  assert.equal(createLocalServerBackup(storage), false);
  assert.equal(storage.getItem(PRE_SERVER_BACKUP_KEY), "first");
});

test("перенос сохраняет каждый проект и не удаляет localStorage", async () => {
  const saved = [];
  const storage = memoryStorage({ [PROJECTS_STORAGE_KEY]: "local-state" });
  const repository = { upsertProject: async (userId, item) => saved.push([userId, item.id]) };
  await migrateLocalProjects({ userId: "u", localProjects: [project(), { ...project(), id: "second" }], repository, storage });
  assert.deepEqual(saved, [["u", "abc123"], ["u", "second"]]);
  assert.equal(storage.getItem(PROJECTS_STORAGE_KEY), "local-state");
  assert.equal(storage.getItem(PRE_SERVER_BACKUP_KEY), "local-state");
});

test("частичная ошибка переноса возвращает результаты и не отмечает успех", async () => {
  const repository = { upsertProject: async (_userId, item) => { if (item.id === "bad") throw new Error("network"); } };
  await assert.rejects(() => migrateLocalProjects({ userId: "u", localProjects: [project(), { ...project(), id: "bad" }], repository, storage: memoryStorage() }), (error) => {
    assert.equal(error.results.filter((item) => !item.ok).length, 1);
    return true;
  });
});

test("diff не объединяет коллекции молча", () => {
  const diff = diffProjectCollections([{ ...project(), id: "local" }], [{ ...project(), id: "server" }]);
  assert.equal(diff.onlyLocal[0].id, "local");
  assert.equal(diff.onlyServer[0].id, "server");
});

test("интеграция содержит hydration guard, debounce, flush и отдельный delete", () => {
  const source = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  assert.match(source, /syncEnabledRef\.current = false/);
  assert.match(source, /scheduleProjectSave\(next, delay\)/);
  assert.match(source, /delay = 800/);
  assert.match(source, /flushProject/);
  assert.match(source, /projectRepository\.deleteProject/);
  assert.match(source, /parsed\.serverUserId !== userId/);
});

test("уведомление о локальных проектах закрывается вручную и автоматически", () => {
  const source = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  assert.match(source, /setMigrationNotice\("На устройстве остались локальные проекты\./);
  assert.match(source, /setTimeout\(\(\) => setMigrationNotice\(""\), 7000\)/);
  assert.match(source, /aria-label="Закрыть уведомление"[\s\S]*setMigrationNotice\(""\)/);
  assert.doesNotMatch(source, /setServerMessage\("На устройстве остались локальные проекты\./);
});

test("repository использует owner-scoped conflict key и не содержит service role", () => {
  const source = readFileSync(new URL("../src/repositories/projectRepository.js", import.meta.url), "utf8");
  assert.match(source, /onConflict: "user_id,client_id"/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.insert\(buildProjectRow\(userId, project\)\)/);
  assert.match(source, /const row = buildProjectRow\(userId, project\)/);
  assert.match(source, /\.upsert\(buildProjectRow\(userId, project\)/);
  assert.doesNotMatch(source, /service_role|secret/i);
});

test("строка хранит только поля проекта, а не глобальное состояние", () => {
  const row = buildProjectRow("u", project());
  assert.deepEqual(Object.keys(row).sort(), ["client_id", "data_version", "name", "project_data", "user_id"]);
  assert.equal("session" in row.project_data, false);
  assert.equal("performers" in row.project_data, false);
  assert.equal("templates" in row.project_data, false);
});

test("serialized payload keeps sheets as the only source of stages and drops top-level stages", () => {
  const input = { id: "p1", name: "Multi", sheets: [
    { id: "a", name: "A", stages: [{ id: "sa", name: "S1", tasks: [{ id: "t", name: "T", executors: [] }] }] },
    { id: "b", name: "B", stages: [{ id: "sb", tasks: [] }] },
  ], activeSheetId: "a" };
  const serialized = serializeProjectForServer(input);
  assert.equal("stages" in serialized, false);
  assert.deepEqual(serialized.sheets.map((sheet) => sheet.id), ["a", "b"]);
  assert.deepEqual(serialized.sheets[0].stages.map((stage) => stage.id), ["sa"]);
  assert.deepEqual(serialized.sheets[1].stages.map((stage) => stage.id), ["sb"]);
  assert.equal(serialized.activeSheetId, "a");
});

test("deserialize rebuilds runtime project.stages from the active sheet", () => {
  const result = deserializeProjectFromServer({ client_id: "p1", project_data: { id: "p1", name: "Multi", sheets: [
    { id: "a", name: "A", stages: [{ id: "sa", tasks: [] }] },
    { id: "b", name: "B", stages: [{ id: "sb", tasks: [] }] },
  ], activeSheetId: "b" } });
  assert.equal(result.stages.length, 1);
  assert.equal(result.stages[0].id, "sb");
  assert.equal(result.sheets.length, 2);
  assert.equal(result.activeSheetId, "b");
});

test("serialize → deserialize round-trip preserves sheet ids and nested data", () => {
  const input = { id: "p1", name: "Multi", globalMarkup: 25, sheets: [
    { id: "sheet-a", name: "A", stages: [{ id: "sa", name: "S", tasks: [{ id: "t", name: "T", executors: [{ id: "e", amount: "100", tags: [] }] }] }] },
    { id: "sheet-b", name: "B", stages: [{ id: "sb", tasks: [] }] },
  ], activeSheetId: "sheet-b" };
  const serialized = serializeProjectForServer(input);
  assert.equal("stages" in serialized, false);
  const roundtrip = deserializeProjectFromServer({ client_id: input.id, project_data: serialized });
  assert.deepEqual(roundtrip.sheets.map((sheet) => sheet.id), ["sheet-a", "sheet-b"]);
  assert.deepEqual(roundtrip.sheets[0].stages[0].id, "sa");
  assert.deepEqual(roundtrip.sheets[0].stages[0].tasks[0].id, "t");
  assert.deepEqual(roundtrip.sheets[0].stages[0].tasks[0].executors[0].id, "e");
  assert.equal(roundtrip.activeSheetId, "sheet-b");
  assert.equal(roundtrip.stages[0].id, "sb");
  assert.equal(roundtrip.globalMarkup, 25);
});
