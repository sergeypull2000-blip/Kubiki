import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POOL_OPTIONS, closeDatabasePool, createDatabasePool } from "../server/db.js";

test("database layer creates one bounded pg-compatible Pool", async () => {
  const created = [];
  class FakePool {
    constructor(options) { this.options = options; created.push(this); }
    async end() { this.ended = true; }
  }
  const url = "postgresql://app:very-secret@db.internal/kubiki";
  const pool = createDatabasePool(url, FakePool);
  assert.equal(created.length, 1);
  assert.equal(pool.options.connectionString, url);
  assert.deepEqual(DEFAULT_POOL_OPTIONS, {
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  await closeDatabasePool(pool);
  assert.equal(pool.ended, true);
});
