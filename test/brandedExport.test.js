import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildExportEstimateModel, normalizeExportSettings } from "../src/exportEstimate.js";
import { buildExcelWorkbook } from "../src/excelExport.js";
import { normalizePresentationSettings, presentationSettingsForPreset } from "../src/exportSettings.js";
import { createExportPresetsRepository } from "../src/repositories/exportPresetsRepository.js";
import { createExportProfileRepository } from "../src/repositories/exportProfileRepository.js";

const executor = (id, role, name, amount) => ({ id, amount: String(amount), tags: [{ key: "role", value: role }, { key: "name", value: name }, { key: "payment", payment: { type: "fix_total" } }] });
const project = (settings = {}) => ({ id: "p1", name: "Project", globalMarkup: 0, markupMode: "embedded", tax: { percent: 0 }, vat: { percent: 0 }, exportSettings: settings, exportMetadata: { validUntil: "2026-12-31" }, stages: [{ id: "s1", name: "Stage", tasks: [{ id: "t1", name: "Task", exportComment: "Note", executors: [executor("e1", "Artist", "Anna", 150), executor("e2", "Director", "Mike", 250)] }] }] });

test("branding, typography, comments, visibility and row overrides enter the canonical model", () => {
  const settings = normalizeExportSettings({ content: { showComments: true, performerVisibility: "custom", visibleExecutorIds: ["e1"], rowColorOverrides: { t1: "#123456" } }, branding: { logoAssetPath: "user/logo.png", fontFamily: "Roboto" }, typography: { title: { size: 24, weight: 700 } } });
  const model = buildExportEstimateModel(project(settings), settings);
  assert.equal(model.brand.logoAssetPath, "user/logo.png");
  assert.equal(model.brand.fontFamily, "Roboto");
  assert.equal(model.typography.title.size, 24);
  assert.equal(model.stages[0].rows[0].comment, "Note");
  assert.deepEqual(model.stages[0].rows[0].performers, []);
  assert.equal(model.stages[0].rows[0].color, "#123456");
  assert.equal(JSON.stringify(settings).includes("data:image"), false);
});

test("Excel formulas survive branded fills, fonts and comment columns", () => {
  const model = buildExportEstimateModel(project({ content: { showComments: true }, branding: { colors: { stage: "#112233", task: "#ffffff", total: "#445566" }, fontFamily: "Arial" } }));
  const sheet = buildExcelWorkbook(model).worksheets[0];
  const formulaCells = [];
  sheet.eachRow((row) => row.eachCell((cell) => { if (cell.value?.formula) formulaCells.push(cell); }));
  assert.ok(formulaCells.length >= 2);
  assert.ok(formulaCells.every((cell) => typeof cell.value.formula === "string"));
  assert.equal(sheet.columnCount, 3);
  const stageRow = sheet.findRow(sheet.getColumn(1).values.findIndex((value) => value === "Stage"));
  const taskRow = sheet.findRow(sheet.getColumn(1).values.findIndex((value) => String(value).includes("Task")));
  const totalRow = sheet.findRow(sheet.getColumn(1).values.findIndex((value) => value === "ИТОГО"));
  assert.equal(stageRow.fill.fgColor.argb, "FF112233");
  assert.equal(taskRow.fill.fgColor.argb, "FFFFFFFF");
  assert.equal(totalRow.fill.fgColor.argb, "FF445566");
});

test("stage/task/total text colors reach Excel fonts", () => {
  const model = buildExportEstimateModel(project({ branding: { colors: { stage: "#101010", stageText: "#aabbcc", task: "#202020", taskText: "#ddeeff", total: "#303030", totalText: "#112233" } } }));
  const sheet = buildExcelWorkbook(model).worksheets[0];
  const stageRow = sheet.findRow(sheet.getColumn(1).values.findIndex((value) => value === "Stage"));
  const taskRow = sheet.findRow(sheet.getColumn(1).values.findIndex((value) => String(value).includes("Task")));
  const totalRow = sheet.findRow(sheet.getColumn(1).values.findIndex((value) => value === "ИТОГО"));
  assert.equal(stageRow.font.color.argb, "FFAABBCC");
  assert.equal(taskRow.font.color.argb, "FFDDEEFF");
  assert.equal(totalRow.font.color.argb, "FF112233");
});

test("legacy settings and canonical model apply safe text color defaults", () => {
  const normalized = normalizePresentationSettings({ branding: { colors: { stage: "#112233" } } });
  assert.equal(normalized.branding.colors.stageText, "#1A2230");
  assert.equal(normalized.branding.colors.taskText, "#1A2230");
  assert.equal(normalized.branding.colors.totalText, "#1A2230");
  assert.equal(normalizePresentationSettings({ branding: { colors: { stageText: "red" } } }).branding.colors.stageText, "#1A2230");

  const legacy = buildExportEstimateModel(project({ branding: { colors: { stage: "#112233" } } }));
  assert.equal(legacy.brand.colors.stageText, "#1A2230");
  assert.equal(legacy.stages[0].textColor, "#1A2230");
  assert.equal(legacy.stages[0].rows[0].textColor, "#1A2230");

  const branded = buildExportEstimateModel(project({ branding: { colors: { stageText: "#aabbcc", taskText: "#ddeeff", totalText: "#112233" } } }));
  assert.equal(branded.brand.colors.stageText, "#aabbcc");
  assert.equal(branded.stages[0].textColor, "#aabbcc");
  assert.equal(branded.stages[0].rows[0].textColor, "#ddeeff");
  assert.equal(branded.brand.colors.totalText, "#112233");
});

test("preset serialization preserves and defaults text colors", () => {
  const settings = presentationSettingsForPreset({ branding: { colors: { stage: "#101010", stageText: "#aabbcc" } } });
  assert.equal(settings.branding.colors.stageText, "#aabbcc");
  assert.equal(settings.branding.colors.taskText, "#1A2230");
  assert.equal(settings.branding.colors.totalText, "#1A2230");
});

test("preset create/duplicate/reload preserves text colors", async () => {
  const rows = [];
  const client = { from: () => {
    const state = { op: "select", payload: null, filters: [] };
    const execute = () => { let found = rows.filter((row) => state.filters.every(([key, value]) => row[key] === value)); if (state.op === "insert") { const row = { id: `p${rows.length + 1}`, created_at: "a", updated_at: "a", ...state.payload }; rows.push(row); found = [row]; } if (state.op === "update") { found.forEach((row) => Object.assign(row, state.payload)); } if (state.op === "delete") { for (const row of [...found]) rows.splice(rows.indexOf(row), 1); } return structuredClone(found); };
    const builder = { select: () => builder, eq: (key, value) => { state.filters.push([key, value]); return builder; }, order: () => builder, insert: (payload) => { state.op = "insert"; state.payload = payload; return builder; }, update: (payload) => { state.op = "update"; state.payload = payload; return builder; }, delete: () => { state.op = "delete"; return builder; }, single: async () => ({ data: execute()[0], error: null }), then: (resolve) => resolve({ data: execute(), error: null }) };
    return builder;
  } };
  const repo = createExportPresetsRepository(client);
  const created = await repo.create("u", "Branded", { branding: { companyName: "A", colors: { stageText: "#aabbcc", taskText: "#ddeeff", totalText: "#112233" } } });
  await repo.duplicate("u", created);
  const reloaded = await createExportPresetsRepository(client).list("u");
  for (const item of reloaded) {
    assert.equal(item.settings.branding.colors.stageText, "#aabbcc");
    assert.equal(item.settings.branding.colors.taskText, "#ddeeff");
    assert.equal(item.settings.branding.colors.totalText, "#112233");
  }
});

test("preview and PDF apply stage/task/total text colors", async () => {
  const source = await readFile(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  assert.match(source, /stage\.textColor/);
  assert.match(source, /row\.textColor/);
  assert.match(source, /model\.brand\.colors\.totalText/);
  assert.match(source, /model\.brand\.colors\.stageText/);
  assert.match(source, /model\.brand\.colors\.taskText/);
});

test("legacy performer export settings are cleared and never create subrows", () => {
  const all = buildExportEstimateModel(project({ content: { performerVisibility: "all" } }));
  const hidden = buildExportEstimateModel(project({ content: { performerVisibility: "none" } }));
  const custom = buildExportEstimateModel(project({ content: { performerVisibility: "custom", visibleExecutorIds: ["e2"] } }));
  assert.deepEqual(all.stages[0].rows[0].performers, []);
  assert.deepEqual(hidden.stages[0].rows[0].performers, []);
  assert.deepEqual(custom.stages[0].rows[0].performers, []);
  assert.equal(custom.settings.content.performerVisibility, "none");
  assert.deepEqual(custom.settings.content.visibleExecutorIds, []);
  assert.equal(all.stages[0].rows[0].exportedAmount, hidden.stages[0].rows[0].exportedAmount);
  assert.equal(all.summary.total, hidden.summary.total);
});

test("valid-until, company and all typography/color settings are canonical", () => {
  const model = buildExportEstimateModel(project({ branding: { companyName: "Kubiki", colors: { stage: "#112233", task: "#223344", total: "#334455" } }, typography: { title: { size: 22 }, stage: { size: 14 }, task: { size: 12 }, total: { size: 16 }, service: { size: 9 } }, service: { validUntil: true } }));
  assert.equal(model.brand.companyName, "Kubiki");
  assert.deepEqual(model.brand.colors, { stage: "#112233", task: "#223344", total: "#334455", stageText: "#1A2230", taskText: "#1A2230", totalText: "#1A2230", accent: "#1A2230", text: "#1A2230" });
  assert.deepEqual(Object.fromEntries(Object.entries(model.typography).map(([key, value]) => [key, value.size])), { title: 22, stage: 14, task: 12, total: 16, service: 9 });
  assert.ok(model.serviceBlocks.includes("Коммерческое предложение действительно до 31.12.2026"));
});

test("preset repository scopes CRUD and strips project-specific values", async () => {
  const calls = [];
  const terminal = { data: { id: "x", user_id: "u", name: "Preset", preset_json: {}, created_at: "a", updated_at: "b" }, error: null };
  const chain = new Proxy({}, { get: (_target, key) => key === "then" ? undefined : (...args) => { calls.push([key, ...args]); return key === "single" ? Promise.resolve(terminal) : chain; } });
  const client = { from: (table) => { calls.push(["from", table]); return chain; } };
  await createExportPresetsRepository(client).update("u", "x", "Preset", { projectName: "secret", exportMetadata: { validUntil: "2026-12-31" }, content: { visibleExecutorIds: ["e1"], rowColorOverrides: { t1: "#123456" } } });
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "user_id" && call[2] === "u"));
  const update = calls.find((call) => call[0] === "update")[1];
  assert.equal("projectName" in update.preset_json, false);
  assert.deepEqual(update.preset_json.content.visibleExecutorIds, []);
  assert.deepEqual(update.preset_json.content.rowColorOverrides, {});
  assert.equal("exportMetadata" in update.preset_json, false);
});

test("preset create/load/update/duplicate/delete survives a new repository instance", async () => {
  const rows = [];
  const client = { from: () => {
    const state = { op: "select", payload: null, filters: [] };
    const execute = () => { let found = rows.filter((row) => state.filters.every(([key, value]) => row[key] === value)); if (state.op === "insert") { const row = { id: `p${rows.length + 1}`, created_at: "a", updated_at: "a", ...state.payload }; rows.push(row); found = [row]; } if (state.op === "update") { found.forEach((row) => Object.assign(row, state.payload)); } if (state.op === "delete") { for (const row of [...found]) rows.splice(rows.indexOf(row), 1); } return structuredClone(found); };
    const builder = { select: () => builder, eq: (key, value) => { state.filters.push([key, value]); return builder; }, order: () => builder, insert: (payload) => { state.op = "insert"; state.payload = payload; return builder; }, update: (payload) => { state.op = "update"; state.payload = payload; return builder; }, delete: () => { state.op = "delete"; return builder; }, single: async () => ({ data: execute()[0], error: null }), then: (resolve) => resolve({ data: execute(), error: null }) };
    return builder;
  } };
  const first = createExportPresetsRepository(client);
  const created = await first.create("u", "One", { branding: { companyName: "A" }, content: { visibleExecutorIds: ["e1"] } });
  const updated = await first.update("u", created.id, "Two", { branding: { companyName: "B" } });
  const copy = await first.duplicate("u", updated);
  const reloaded = await createExportPresetsRepository(client).list("u");
  assert.deepEqual(reloaded.map((item) => item.name).sort(), ["Two", "Two — копия"]);
  assert.equal(reloaded.find((item) => item.id === created.id).settings.branding.companyName, "B");
  assert.deepEqual(reloaded[0].settings.content.visibleExecutorIds, []);
  await first.remove("u", copy.id);
  assert.equal((await createExportPresetsRepository(client).list("u")).length, 1);
});

test("migration has owner CRUD RLS, explicit grants and private bounded logo storage", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260816000000_create_branded_export.sql", import.meta.url), "utf8");
  for (const table of ["studio_export_profiles", "export_presets"]) for (const operation of ["select", "insert", "update", "delete"]) assert.match(sql, new RegExp(`${table}_${operation}_own`));
  assert.match(sql, /create index export_presets_user_id_updated_at_idx/i);
  assert.match(sql, /'export-logos'.*false, 2097152/s);
  assert.doesNotMatch(sql, /image\/svg\+xml/i);
  assert.doesNotMatch(sql, /service_role/i);
});

test("logo upload validates type/size and serializes only an owner path", async () => {
  const calls = [];
  const bucket = { upload: async (path, file) => { calls.push(["upload", path, file.type]); return { data: { path }, error: null }; }, remove: async (paths) => { calls.push(["remove", paths]); return { data: paths, error: null }; }, createSignedUrl: async (path) => ({ data: { signedUrl: `signed:${path}` }, error: null }) };
  const repository = createExportProfileRepository({ storage: { from: (name) => { assert.equal(name, "export-logos"); return bucket; } } });
  const path = await repository.uploadLogo("user-1", { size: 1024, type: "image/webp" });
  assert.match(path, /^user-1\/logo-\d+\.webp$/);
  assert.equal(await repository.createLogoUrl(path), `signed:${path}`);
  await repository.removeLogo(path);
  await assert.rejects(() => repository.uploadLogo("user-1", { size: 3 * 1024 * 1024, type: "image/png" }), /2 МБ/);
  await assert.rejects(() => repository.uploadLogo("user-1", { size: 10, type: "image/svg+xml" }), /PNG, JPEG или WebP/);
  assert.equal(JSON.stringify(calls).includes("base64"), false);
});

test("export modal hydrates presentation defaults for legacy projects before rendering controls", async () => {
  const source = await readFile(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  assert.match(source, /useState\(\(\) => \(\{[\s\S]*normalizeExportSettings\(project\.exportSettings\)[\s\S]*normalizePresentationSettings\(project\.exportSettings\)/);
  assert.doesNotMatch(source, /<summary>Содержимое<\/summary>/);
  assert.doesNotMatch(source, /visibleExecutorIds\.includes|toggleExecutor|executorOptions/);
});
