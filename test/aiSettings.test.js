import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_SETTINGS_KEY, AI_SETTINGS_OWNER_KEY, DEFAULT_AI_PERSONALIZATION, loadLocalAiSettings, normalizeAiSettings, sanitizePersonalization, saveLocalAiSettings } from "../src/aiSettings.js";
import { createAiSettingsRepository } from "../src/repositories/aiSettingsRepository.js";
import { failClosedServerAiSettings, loadOwnAiSettings, loadServerAiSettings, normalizeServerAiSettings } from "../api/_lib/aiSettings.js";

const memoryStorage = (initial = {}) => { const values = new Map(Object.entries(initial)); return { values, getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value) }; };

test("AI settings are minimal, history is explicit opt-in and studio templates default on", () => {
  assert.deepEqual(normalizeAiSettings(), { personalization: "", useProjectHistory: false, useStudioTemplates: true });
  assert.deepEqual(normalizeAiSettings({ personalization: "  Делить на этапы ", use_project_history: true }), { personalization: "  Делить на этапы ", useProjectHistory: true, useStudioTemplates: true });
  assert.deepEqual(normalizeAiSettings({ personalization: "x", use_studio_templates: true }), { personalization: "x", useProjectHistory: false, useStudioTemplates: true });
  assert.deepEqual(normalizeAiSettings({ personalization: "x", use_studio_templates: false }), { personalization: "x", useProjectHistory: false, useStudioTemplates: false });
  assert.deepEqual(Object.keys(normalizeAiSettings({ universal: true, currency: "RUB" })), ["personalization", "useProjectHistory", "useStudioTemplates"]);
});

test("new users get the performer-library default without overriding a saved empty personalization", () => {
  assert.equal(normalizeAiSettings(undefined, { defaults: true }).personalization, DEFAULT_AI_PERSONALIZATION);
  assert.equal(normalizeAiSettings({ personalization: "" }, { defaults: true }).personalization, "");
  assert.equal(loadLocalAiSettings("new-user", memoryStorage()).personalization, DEFAULT_AI_PERSONALIZATION);
  assert.equal(normalizeServerAiSettings(undefined, { defaults: true }).personalization, DEFAULT_AI_PERSONALIZATION);
});

test("personalization keeps multiline financial rules and removes only secret-bearing lines", () => {
  const source = "Этапы дроби как можно подробнее — чтобы клиент мог всё прозрачно увидеть\n\nДля всех исполнителей добавлять 6% налога\nСтавка режиссёра — 100 000 ₽\nТип оплаты: безналичный\nМаркап 25%\nПисать на studio@example.com\nAPI key: sk-1234567890abcdef\naccess_token=eyJhbGciOiJIUzI1NiJ9.payload.signature\nНе дробить микрозадачи";
  const result = sanitizePersonalization(source);
  assert.equal(result, "Этапы дроби как можно подробнее — чтобы клиент мог всё прозрачно увидеть\n\nДля всех исполнителей добавлять 6% налога\nСтавка режиссёра — 100 000 ₽\nТип оплаты: безналичный\nМаркап 25%\nПисать на studio@example.com\nНе дробить микрозадачи");
  assert.equal(normalizeServerAiSettings({ personalization: result }).personalization, result);
});

test("personalization formatting survives local Save, reopen and F5 hydration", () => {
  const text = "Первая строка\n\n\nСтрока после двух пустых строк\n";
  const storage = memoryStorage();
  const saved = saveLocalAiSettings({ personalization: text }, "u1", storage);
  assert.equal(saved.personalization, text);
  assert.equal(loadLocalAiSettings("u1", storage).personalization, text);
  assert.equal(loadLocalAiSettings("u1", storage).personalization, text);
});

test("local fallback is owner scoped and keeps opt-in", () => {
  const storage = memoryStorage();
  saveLocalAiSettings({ personalization: "Учитывать препродакшн", useProjectHistory: true }, "u1", storage);
  assert.equal(storage.getItem(AI_SETTINGS_OWNER_KEY), "u1");
  assert.equal(loadLocalAiSettings("u1", storage).useProjectHistory, true);
  assert.deepEqual(loadLocalAiSettings("u2", storage), { personalization: DEFAULT_AI_PERSONALIZATION, useProjectHistory: false, useStudioTemplates: true });
  assert.ok(storage.getItem(AI_SETTINGS_KEY));
});

function repositoryClient(responseFactory) {
  return { from(table) {
    assert.equal(table, "ai_settings");
    const state = { operation: "", payload: null, userId: "" };
    const builder = {
      select() { state.operation ||= "select"; return builder; },
      eq(column, value) { assert.equal(column, "user_id"); state.userId = value; return builder; },
      maybeSingle: async () => responseFactory(state),
      upsert(payload, options) { state.operation = "upsert"; state.payload = payload; assert.deepEqual(options, { onConflict: "user_id" }); return builder; },
      single: async () => responseFactory(state),
    };
    return builder;
  } };
}

test("AI settings repository scopes load/upsert to user_id", async () => {
  const calls = [];
  const client = repositoryClient((state) => { calls.push(structuredClone(state)); return { data: { user_id: "u1", personalization: state.payload?.personalization || "Текст", use_project_history: state.payload?.use_project_history ?? false, use_studio_templates: state.payload?.use_studio_templates ?? false }, error: null }; });
  const repository = createAiSettingsRepository(client);
  assert.equal((await repository.loadAiSettings("u1")).settings.personalization, "Текст");
  const personalization = "Правило Stage\n\n\nДля всех исполнителей добавлять 6% налога\n";
  const saved = await repository.upsertAiSettings("u1", { personalization, useProjectHistory: true, useStudioTemplates: true });
  assert.equal(saved.useProjectHistory, true);
  assert.equal(saved.useStudioTemplates, true);
  assert.deepEqual(calls[1].payload, { user_id: "u1", personalization, use_project_history: true, use_studio_templates: true });
  assert.deepEqual(saved, { personalization, useProjectHistory: true, useStudioTemplates: true });
});

test("AI settings repository surfaces an upsert error without normalizing it into empty settings", async () => {
  const failure = { message: "write rejected", code: "42501" };
  const repository = createAiSettingsRepository(repositoryClient(() => ({ data: null, error: failure })));
  await assert.rejects(
    () => repository.upsertAiSettings("u1", { personalization: "Не терять этот текст", useProjectHistory: false }),
    (error) => error.message.includes("write rejected") && error.cause === failure,
  );
});

test("server settings loader rejects a foreign row", async () => {
  const client = repositoryClient(() => ({ data: { user_id: "u2", personalization: "foreign", use_project_history: true }, error: null }));
  await assert.rejects(() => loadOwnAiSettings(client, "u1"), /недоступны/);
});

test("fail-closed server settings keep studio templates off explicitly", () => {
  assert.deepEqual(failClosedServerAiSettings(), { personalization: "", useProjectHistory: false, useStudioTemplates: false });
});

test("generation uses useStudioTemplates=false when the server settings read throws", async () => {
  const client = repositoryClient(() => ({ data: null, error: { code: "42703", message: "column ai_settings.use_studio_templates does not exist" } }));
  const settings = await loadServerAiSettings(client, "u1");
  assert.deepEqual(settings, { personalization: "", useProjectHistory: false, useStudioTemplates: false });
});

test("loadServerAiSettings preserves saved settings when the read succeeds", async () => {
  const client = repositoryClient(() => ({ data: { user_id: "u1", personalization: "x", use_project_history: true, use_studio_templates: true }, error: null }));
  const settings = await loadServerAiSettings(client, "u1");
  assert.deepEqual(settings, { personalization: "x", useProjectHistory: true, useStudioTemplates: true });
});

test("ai_settings migration is one narrow table with complete owner RLS", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260804050000_create_ai_settings.sql", import.meta.url), "utf8");
  assert.match(sql, /create table public\.ai_settings/);
  assert.match(sql, /personalization text not null default ''/);
  assert.match(sql, /use_project_history boolean not null default false/);
  assert.doesNotMatch(sql, /jsonb|service_role/i);
  for (const operation of ["select", "insert", "update", "delete"]) assert.match(sql, new RegExp(`for ${operation}`));
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test("use_studio_templates migration adds a default-true boolean column", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260820090000_add_use_studio_templates.sql", import.meta.url), "utf8");
  assert.match(sql, /alter table public\.ai_settings/);
  assert.match(sql, /add column if not exists use_studio_templates boolean not null default true/);
});

test("Kubiki integrates owner-bound hydration, local fallback, save and logout cleanup", () => {
  const source = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  assert.match(source, /aiSettingsRepository\.loadAiSettings\(userId\)/);
  assert.match(source, /replaceAiSettings\(local\)/);
  assert.match(source, /aiSettingsRepository\.upsertAiSettings\(userId, value\)/);
  assert.match(source, /await aiSettingsHydrationRef\.current/);
  assert.doesNotMatch(source, /const value = replaceAiSettings\(draft\)/);
  assert.match(source, /aiSettingsSyncEnabledRef\.current = false/);
  assert.match(source, /replaceAiSettings\(normalizeAiSettings\(\), false\)/);
});
