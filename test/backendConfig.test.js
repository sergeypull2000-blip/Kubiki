import test from "node:test";
import assert from "node:assert/strict";
import { parseBackendConfig, parseBetterAuthConfig, parseObjectStorageConfig } from "../server/config.js";

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

test("S3-compatible storage config keeps credentials backend-only and uses short-lived URLs", () => {
  const env = {
    S3_ENDPOINT: "https://s3.example.test",
    S3_REGION: "region-1",
    S3_BUCKET: "private-bucket",
    S3_ACCESS_KEY_ID: "access-secret",
    S3_SECRET_ACCESS_KEY: "secret-secret",
  };
  assert.deepEqual(parseObjectStorageConfig(env), {
    endpoint: "https://s3.example.test/",
    region: "region-1",
    bucket: "private-bucket",
    accessKeyId: "access-secret",
    secretAccessKey: "secret-secret",
    forcePathStyle: false,
    signedUrlTtlSeconds: 300,
  });
  assert.throws(() => parseObjectStorageConfig({}), /S3_ENDPOINT/);
  assert.throws(() => parseObjectStorageConfig({ ...env, S3_SIGNED_URL_TTL_SECONDS: "3600" }), /must not exceed 900/);
});
