import assert from "node:assert/strict";
import test from "node:test";
import { validateLocalDevelopmentEnv } from "../scripts/run-development.js";

test("local development accepts only an explicit development-to-staging configuration", () => {
  assert.doesNotThrow(() => validateLocalDevelopmentEnv({
    NODE_ENV: "development",
    KUBIKI_REMOTE_ENV: "staging",
  }));
});

test("local development rejects production and missing remote environment assertions", () => {
  assert.throws(
    () => validateLocalDevelopmentEnv({ NODE_ENV: "production", KUBIKI_REMOTE_ENV: "staging" }),
    /NODE_ENV=development/,
  );
  assert.throws(
    () => validateLocalDevelopmentEnv({ NODE_ENV: "development" }),
    /KUBIKI_REMOTE_ENV=staging/,
  );
  assert.throws(
    () => validateLocalDevelopmentEnv({ NODE_ENV: "development", KUBIKI_REMOTE_ENV: "production" }),
    /production services are not allowed/,
  );
});
