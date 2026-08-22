import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createBackendServer } from "../server/app.js";
import { createBetterAuthHttpHandler } from "../server/betterAuthHttp.js";

async function createFixture(t) {
  const db = { user: [], session: [], account: [], verification: [] };
  const emails = { verification: [], reset: [] };
  let mountedHandler = async () => { throw new Error("auth handler is not ready"); };
  const server = createBackendServer({
    pool: { query: async () => ({ rows: [] }) },
    bodyLimitBytes: 1_048_576,
    readinessTimeoutMillis: 20,
    authHandler: (...args) => mountedHandler(...args),
    logger: { error() {} },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: "kubiki-http-bridge-regression-secret",
    baseURL,
    emailVerification: {
      sendOnSignUp: true,
      async sendVerificationEmail(message) { emails.verification.push(message); },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      async sendResetPassword(message) { emails.reset.push(message); },
    },
    rateLimit: { enabled: false },
  });
  mountedHandler = createBetterAuthHttpHandler(auth.handler);
  return { auth, baseURL, db, emails };
}

function jsonRequest(body, origin) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  };
}

function cookieHeader(response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

test("Better Auth HTTP bridge preserves sign-up and email verification responses", async (t) => {
  const { baseURL, db, emails } = await createFixture(t);
  const email = "bridge-signup@example.test";
  const signUp = await fetch(`${baseURL}/api/auth/sign-up/email?source=regression`, jsonRequest({
    name: "Bridge User",
    email,
    password: "correct-horse-battery-staple",
    callbackURL: `${baseURL}/verified`,
  }, baseURL));

  const signUpBody = await signUp.text();
  assert.equal(signUp.status, 200, signUpBody);
  assert.match(signUp.headers.get("content-type"), /^application\/json/);
  assert.ok(signUpBody.length > 0, "response body must not become a synthetic empty 200");
  assert.equal(db.user.find((user) => user.email === email)?.emailVerified, false);
  assert.equal(emails.verification.length, 1);

  const verificationUrl = new URL(emails.verification[0].url);
  const verify = await fetch(`${baseURL}${verificationUrl.pathname}${verificationUrl.search}`, { redirect: "manual" });
  assert.equal(verify.status, 302);
  assert.equal(verify.headers.get("location"), `${baseURL}/verified`);
  assert.equal(db.user.find((user) => user.email === email)?.emailVerified, true);
});

test("Better Auth HTTP bridge preserves cookies across sign-in, session, and sign-out", async (t) => {
  const { baseURL, db } = await createFixture(t);
  const email = "bridge-session@example.test";
  await fetch(`${baseURL}/api/auth/sign-up/email`, jsonRequest({
    name: "Session User", email, password: "correct-horse-battery-staple",
  }, baseURL));
  db.user.find((user) => user.email === email).emailVerified = true;

  const signIn = await fetch(`${baseURL}/api/auth/sign-in/email`, jsonRequest({
    email, password: "correct-horse-battery-staple",
  }, baseURL));
  assert.equal(signIn.status, 200);
  assert.ok(signIn.headers.getSetCookie().length > 0, "Set-Cookie must survive the bridge");
  const cookie = cookieHeader(signIn);

  const session = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, email);

  const signOut = await fetch(`${baseURL}/api/auth/sign-out`, {
    ...jsonRequest({}, baseURL), headers: { "content-type": "application/json", origin: baseURL, cookie },
  });
  assert.equal(signOut.status, 200);
  assert.ok(signOut.headers.getSetCookie().some((value) => /Max-Age=0/i.test(value)));
});

test("Better Auth HTTP bridge preserves password-reset and invalid-request status/body", async (t) => {
  const { baseURL, db, emails } = await createFixture(t);
  const email = "bridge-reset@example.test";
  await fetch(`${baseURL}/api/auth/sign-up/email`, jsonRequest({
    name: "Reset User", email, password: "correct-horse-battery-staple",
  }, baseURL));

  const reset = await fetch(`${baseURL}/api/auth/request-password-reset`, jsonRequest({
    email, redirectTo: `${baseURL}/reset-password`,
  }, baseURL));
  assert.equal(reset.status, 200);
  assert.ok((await reset.text()).length > 0);
  assert.equal(emails.reset.length, 1);

  const resetUrl = new URL(emails.reset[0].url);
  const resetRedirect = await fetch(`${baseURL}${resetUrl.pathname}${resetUrl.search}`, { redirect: "manual" });
  assert.equal(resetRedirect.status, 302);
  const resetLocation = new URL(resetRedirect.headers.get("location"));
  assert.equal(resetLocation.pathname, "/reset-password");
  const token = resetLocation.searchParams.get("token");
  assert.ok(token);
  const changePassword = await fetch(`${baseURL}/api/auth/reset-password`, jsonRequest({
    token, newPassword: "new-correct-horse-battery-staple",
  }, baseURL));
  assert.equal(changePassword.status, 200);
  assert.ok((await changePassword.text()).length > 0);
  db.user.find((user) => user.email === email).emailVerified = true;
  const newSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, jsonRequest({
    email, password: "new-correct-horse-battery-staple",
  }, baseURL));
  assert.equal(newSignIn.status, 200);

  const invalid = await fetch(`${baseURL}/api/auth/sign-in/email`, jsonRequest({ email }, baseURL));
  assert.equal(invalid.status, 400);
  assert.match(invalid.headers.get("content-type"), /^application\/json/);
  assert.match(await invalid.text(), /password/i);
});
