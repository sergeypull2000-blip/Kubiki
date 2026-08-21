import test from "node:test";
import assert from "node:assert/strict";
import { parseBackendConfig, parseBetterAuthConfig } from "../server/config.js";

test("backend config uses safe beta pool-facing defaults", () => {
  const config = parseBackendConfig({ DATABASE_URL: "postgresql://app:secret@db.internal:5432/kubiki" });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
  assert.equal(config.bodyLimitBytes, 1_048_576);
  assert.equal(config.readinessTimeoutMillis, 2_000);
});

test("backend config is required only when standalone backend is parsed", () => {
  assert.throws(() => parseBackendConfig({}), /DATABASE_URL is required/);
  assert.throws(
    () => parseBackendConfig({ DATABASE_URL: "https://user:password@example.com" }),
    /postgres or postgresql/,
  );
});

test("Better Auth future config validates secret and absolute URL", () => {
  assert.deepEqual(
    parseBetterAuthConfig({ BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "https://auth.example.test" }),
    { secret: "x".repeat(32), baseUrl: "https://auth.example.test/" },
  );
  assert.throws(() => parseBetterAuthConfig({}), /BETTER_AUTH_SECRET/);
});
