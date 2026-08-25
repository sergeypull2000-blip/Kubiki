import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveAppSessionView } from "../src/appSessionView.js";

test("post-signup verification remains mounted through unauthenticated session revalidation", () => {
  const authSource = fs.readFileSync(new URL("../src/AuthScreen.jsx", import.meta.url), "utf8");
  assert.match(authSource, /setVerificationEmail\(email\)\s*\n\s*setView\('verify-email'\)/);

  let hasResolved = false;
  const render = (isPending) => {
    const result = resolveAppSessionView({
      isPending,
      hasResolved,
      recoveryMode: false,
      resetCompleted: false,
      hasUser: false,
    });
    hasResolved = result.sessionHasResolved;
    return result.view;
  };

  assert.equal(render(true), "loading", "the initial session load uses the full-screen loader");
  assert.equal(render(false), "auth", "the unauthenticated AuthScreen mounts after initial resolution");

  // AuthScreen now owns the verify-email view after the successful signup.
  assert.equal(render(true), "auth", "revalidation must not replace and unmount AuthScreen");
  assert.equal(render(false), "auth", "unauthenticated resolution keeps the same AuthScreen branch");
});
