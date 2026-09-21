import test from "node:test";
import assert from "node:assert/strict";
import { createEmailDeliveryLimitRepository } from "../server/repositories/emailDeliveryLimitRepository.js";

function bucket(index = 1) {
  return {
    scope: "recipient:verify_email",
    subjectHash: Buffer.alloc(32, index),
    windowSeconds: 600,
    max: 3,
  };
}

function fakePool({ allowed = true, failUpdate = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (/select count\(\*\)/i.test(sql)) {
        const rows = JSON.parse(parameters[0]);
        return { rows: [{ rowCount: rows.length, allowed }] };
      }
      if (/update auth\.email_delivery_rate_limits/i.test(sql)) {
        if (failUpdate) throw new Error("injected update failure");
        return { rowCount: JSON.parse(parameters[0]).length, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() { calls.push({ sql: "release", parameters: [] }); },
  };
  return {
    calls,
    connect: async () => client,
    query: async (sql, parameters = []) => {
      calls.push({ sql, parameters });
      return { rowCount: 0, rows: [] };
    },
  };
}

test("repository consumes every bucket atomically and commits before returning", async () => {
  const pool = fakePool();
  const repository = createEmailDeliveryLimitRepository(pool);
  assert.equal(await repository.consume([bucket(2), bucket(1)]), true);
  const statements = pool.calls.map(({ sql }) => sql.trim().split(/\s+/, 1)[0].toLowerCase());
  assert.deepEqual(statements, ["begin", "set", "set", "with", "with", "with", "commit", "release"]);
  const serialized = pool.calls.find(({ parameters }) => parameters.length)?.parameters[0];
  assert.doesNotMatch(serialized, /@/);
});

test("repository rolls back every bucket when one policy is exhausted", async () => {
  const pool = fakePool({ allowed: false });
  const repository = createEmailDeliveryLimitRepository(pool);
  assert.equal(await repository.consume([bucket()]), false);
  assert.ok(pool.calls.some(({ sql }) => sql === "rollback"));
  assert.equal(pool.calls.some(({ sql }) => /update auth\.email_delivery_rate_limits/i.test(sql)), false);
  assert.equal(pool.calls.some(({ sql }) => sql === "commit"), false);
});

test("repository rolls back and releases its connection after a database error", async () => {
  const pool = fakePool({ failUpdate: true });
  const repository = createEmailDeliveryLimitRepository(pool);
  await assert.rejects(() => repository.consume([bucket()]), /injected update failure/);
  assert.equal(pool.calls.at(-1).sql, "release");
  assert.ok(pool.calls.some(({ sql }) => sql === "rollback"));
});

test("repository readiness and bounded cleanup use the shared table", async () => {
  const pool = fakePool();
  const repository = createEmailDeliveryLimitRepository(pool);
  await repository.assertReady();
  await repository.pruneExpired(25);
  assert.match(pool.calls[0].sql, /select 1 from auth\.email_delivery_rate_limits/);
  assert.match(pool.calls[1].sql, /for update skip locked/);
  assert.match(pool.calls[1].sql, /order by bucket_scope, subject_hash, window_seconds/);
  assert.deepEqual(pool.calls[1].parameters, [25]);
});
