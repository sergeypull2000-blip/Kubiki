import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createEmailDeliveryLimitRepository } from "../server/repositories/emailDeliveryLimitRepository.js";

const { Pool } = pg;
const databaseUrl = process.env.KUBIKI_TEST_DATABASE_URL;
const enabled = process.env.KUBIKI_RUN_POSTGRES_TESTS === "1";

function assertIsolatedTestDatabase() {
  assert.notEqual(process.env.NODE_ENV, "production", "PostgreSQL limiter tests refuse production mode");
  assert.ok(databaseUrl, "KUBIKI_TEST_DATABASE_URL is required");
  assert.notEqual(databaseUrl, process.env.DATABASE_URL, "test and application databases must differ");
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  assert.match(databaseName, /test/i, "isolated database name must contain 'test'");
}

test("PostgreSQL limiter atomically caps concurrent delivery attempts across pools", {
  skip: !enabled || !databaseUrl,
}, async (t) => {
  assertIsolatedTestDatabase();
  let firstPool = new Pool({ connectionString: databaseUrl, max: 5 });
  const secondPool = new Pool({ connectionString: databaseUrl, max: 5 });
  let restartedPool;

  t.after(async () => {
    try {
      await (restartedPool || secondPool).query(
        "drop table if exists auth.email_delivery_rate_limits",
      );
    } finally {
      await Promise.all([
        restartedPool?.end(),
        secondPool.end(),
        firstPool?.end(),
      ]);
    }
  });

  await firstPool.query("create schema if not exists auth");
  await firstPool.query("drop table if exists auth.email_delivery_rate_limits");
  const migration = await readFile(
    new URL("../db/migrations/007_auth_email_delivery_rate_limits.sql", import.meta.url),
    "utf8",
  );
  await firstPool.query(migration);

  const firstRepository = createEmailDeliveryLimitRepository(firstPool);
  const secondRepository = createEmailDeliveryLimitRepository(secondPool);
  const sharedBucket = [{
    scope: "recipient:verify_email",
    subjectHash: Buffer.alloc(32, 7),
    windowSeconds: 600,
    max: 3,
  }];
  const attempts = Array.from({ length: 20 }, (_, index) => (
    (index % 2 === 0 ? firstRepository : secondRepository).consume(sharedBucket)
  ));
  const results = await Promise.all(attempts);
  assert.equal(results.filter(Boolean).length, 3);

  await firstPool.end();
  firstPool = null;
  restartedPool = new Pool({ connectionString: databaseUrl, max: 1 });
  const restartedRepository = createEmailDeliveryLimitRepository(restartedPool);
  assert.equal(await restartedRepository.consume(sharedBucket), false);
});
