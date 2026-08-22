import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authenticateRequest } from "../api/_lib/auth.js";
import { createRequestAuthenticator } from "../server/requestAuth.js";
import { createUserRepository } from "../server/repositories/userRepository.js";
import { createServerDataRepository } from "../server/repositories/serverDataRepository.js";
import { createUsageRecorder, UsageLimitError } from "../api/_lib/aiUsage.js";

test("trusted backend context ignores caller-supplied user_id", async () => {
  const serverData = {};
  const result = await authenticateRequest({ body: { user_id: "attacker" }, authContext: { user: { id: "internal-a" }, authUser: { id: "auth-a" } }, serverData });
  assert.equal(result.ok, true);
  assert.equal(result.user.id, "internal-a");
  assert.equal(result.client, serverData);
});

test("request authentication returns null without a Better Auth session", async () => {
  const authenticate = createRequestAuthenticator({ auth: { api: { getSession: async () => null } }, pool: { query: () => assert.fail("must not resolve user") }, logger: { error: () => {} } });
  assert.equal(await authenticate({ headers: {} }), null);
});

test("authenticated Better Auth identity resolves the internal user", async () => {
  const pool = { query: async (_sql, values) => ({ rows: [{ id: "internal-a", auth_user_id: values[0] }] }) };
  const authenticate = createRequestAuthenticator({ auth: { api: { getSession: async () => ({ user: { id: "auth-a", email: "profile@example.test" }, session: { id: "s1" } }) } }, pool });
  const context = await authenticate({ headers: {} });
  assert.equal(context.authUser.id, "auth-a");
  assert.equal(context.user.id, "internal-a");
});

test("internal user resolution is an atomic idempotent upsert", async () => {
  let id = null;
  const pool = { query: async (sql, values) => {
    assert.match(sql, /on conflict \(auth_user_id\) do update/);
    id ||= "internal-stable";
    return { rows: [{ id, auth_user_id: values[0] }] };
  } };
  const repository = createUserRepository(pool);
  const rows = await Promise.all(Array.from({ length: 8 }, () => repository.resolveByAuthUserId("auth-a")));
  assert.deepEqual(new Set(rows.map((row) => row.id)), new Set(["internal-stable"]));
});

test("owned server repositories bind trusted user id in project/settings/history SQL", async () => {
  const calls = [];
  const pool = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } };
  const repository = createServerDataRepository(pool);
  assert.equal(await repository.loadProject("user-a", "project-b"), null);
  await repository.loadAiSettings("user-a");
  await repository.loadKnowledge("user-a", { includeHistory: true });
  assert.ok(calls.every((call) => /user_id = \$1/.test(call.sql)));
  assert.ok(calls.every((call) => call.values[0] === "user-a"));
});

test("concurrent metered requests cannot both reserve the same user/month", async () => {
  let reserved = false;
  const repository = {
    reserve: async () => reserved ? { acquired: false, reason: "concurrent" } : (reserved = true, { acquired: true, reservationId: "r1", spentUsd: 0, limitUsd: 5, unlimited: false }),
    release: async () => { reserved = false; },
  };
  const first = createUsageRecorder({ client: repository, userId: "user-a" });
  const second = createUsageRecorder({ client: repository, userId: "user-a" });
  await first.assertAllowed();
  await assert.rejects(() => second.assertAllowed(), UsageLimitError);
  await first.release();
  await second.assertAllowed();
});

test("unlimited usage remains reservation-free and persistence is owner-bound", async () => {
  let recorded;
  const repository = {
    reserve: async () => ({ acquired: true, reservationId: null, spentUsd: 9000, limitUsd: null, unlimited: true }),
    record: async (userId, reservationId, event) => { recorded = { userId, reservationId, event }; return true; },
  };
  const recorder = createUsageRecorder({ client: repository, userId: "user-a" });
  const allowed = await recorder.assertAllowed();
  assert.equal(allowed.unlimited, true);
  await recorder.record({ model: "deepseek-v4-flash", data: { usage: { prompt_tokens: 2, completion_tokens: 3 } } });
  assert.equal(recorded.userId, "user-a");
  assert.equal(recorded.reservationId, null);
  assert.equal(recorded.event.inputTokens, 2);
});

test("quota SQL uses a unique lease and transactional usage persistence", () => {
  const schema = readFileSync(new URL("../db/migrations/004_ai_usage_cycle_anchor.sql", import.meta.url), "utf8");
  const source = readFileSync(new URL("../server/repositories/usageRepository.js", import.meta.url), "utf8");
  assert.match(schema, /add column cycle_anchor_at timestamptz/);
  assert.match(schema, /add primary key \(user_id\)/);
  assert.match(source, /on conflict \(user_id\) do nothing/);
  assert.match(source, /delete from public\.ai_usage_reservations[\s\S]*insert into public\.ai_usage_events/);
  assert.match(source, /cycle_anchor_at = coalesce\(public\.ai_usage_limits\.cycle_anchor_at, excluded\.cycle_anchor_at\)/);
});

test("failed request release cannot create a cycle anchor", () => {
  const source = readFileSync(new URL("../server/repositories/usageRepository.js", import.meta.url), "utf8");
  const release = source.slice(source.indexOf("async release"));
  assert.doesNotMatch(release, /cycle_anchor_at|ai_usage_events/);
});
