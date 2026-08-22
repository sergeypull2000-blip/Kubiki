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
  const legalAcceptances = [];
  const publicUsers = [];
  const rollbacks = [];
  const callOrder = [];
  let betterAuthSignUps = 0;
  let legalFailure = null;
  let verificationFailures = 0;
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
      sendOnSignUp: false,
      async sendVerificationEmail(message) {
        if (verificationFailures > 0) {
          verificationFailures -= 1;
          throw new Error("injected verification delivery failure");
        }
        callOrder.push("verification_email");
        emails.verification.push(message);
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      async sendResetPassword(message) { emails.reset.push(message); },
    },
    rateLimit: { enabled: false },
  });
  const trackedAuthHandler = (request) => {
    if (new URL(request.url).pathname === "/api/auth/sign-up/email") betterAuthSignUps += 1;
    return auth.handler(request);
  };
  mountedHandler = createBetterAuthHttpHandler(trackedAuthHandler, {
    async recordSignUpAcceptances(userId) {
      if (!db.user.some((user) => user.id === userId)) return false;
      publicUsers.push(userId);
      callOrder.push("bridge");
      if (legalFailure === "first") throw new Error("first legal insert failed");
      legalAcceptances.push({ userId, documentKey: "beta_terms" });
      callOrder.push("beta_terms");
      if (legalFailure === "second") throw new Error("second legal insert failed");
      legalAcceptances.push({ userId, documentKey: "personal_data_consent" });
      callOrder.push("personal_data_consent");
      callOrder.push("legal_commit");
      return true;
    },
    async rollbackSignUp(userId) {
      rollbacks.push(userId);
      for (const model of ["session", "account"]) {
        db[model] = db[model].filter((row) => row.userId !== userId);
      }
      db.user = db.user.filter((user) => user.id !== userId);
      publicUsers.splice(0, publicUsers.length, ...publicUsers.filter((id) => id !== userId));
      legalAcceptances.splice(0, legalAcceptances.length, ...legalAcceptances.filter((row) => row.userId !== userId));
    },
    sendSignUpVerificationEmail: ({ email, callbackURL, headers }) => auth.api.sendVerificationEmail({
      body: { email, callbackURL }, headers,
    }),
  });
  return {
    auth, baseURL, db, emails, legalAcceptances, publicUsers, rollbacks, callOrder,
    get betterAuthSignUps() { return betterAuthSignUps; },
    setLegalFailure(value) { legalFailure = value; },
    failNextVerification() { verificationFailures += 1; },
  };
}

function jsonRequest(body, origin) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  };
}

const legalSignUp = (body) => ({ ...body, acceptedBetaTerms: true, acceptedPersonalDataConsent: true });

function cookieHeader(response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

test("Better Auth HTTP bridge preserves sign-up and email verification responses", async (t) => {
  const { baseURL, db, emails, legalAcceptances, callOrder } = await createFixture(t);
  const email = "bridge-signup@example.test";
  const signUp = await fetch(`${baseURL}/api/auth/sign-up/email?source=regression`, jsonRequest(legalSignUp({
    name: "Bridge User",
    email,
    password: "correct-horse-battery-staple",
    callbackURL: `${baseURL}/verified`,
  }), baseURL));

  const signUpBody = await signUp.text();
  assert.equal(signUp.status, 200, signUpBody);
  assert.match(signUp.headers.get("content-type"), /^application\/json/);
  assert.ok(signUpBody.length > 0, "response body must not become a synthetic empty 200");
  assert.equal(db.user.find((user) => user.email === email)?.emailVerified, false);
  assert.equal(emails.verification.length, 1);
  const userId = db.user.find((user) => user.email === email).id;
  assert.deepEqual(legalAcceptances, [
    { userId, documentKey: "beta_terms" },
    { userId, documentKey: "personal_data_consent" },
  ]);
  assert.deepEqual(callOrder, ["bridge", "beta_terms", "personal_data_consent", "legal_commit", "verification_email"]);

  const verificationUrl = new URL(emails.verification[0].url);
  const verify = await fetch(`${baseURL}${verificationUrl.pathname}${verificationUrl.search}`, { redirect: "manual" });
  assert.equal(verify.status, 302);
  assert.equal(verify.headers.get("location"), `${baseURL}/verified`);
  assert.equal(db.user.find((user) => user.email === email)?.emailVerified, true);
});

test("Better Auth HTTP bridge rejects signup before Better Auth unless both legal acceptances are explicit", async (t) => {
  const fixture = await createFixture(t);
  const { baseURL, db, legalAcceptances } = fixture;
  const base = { name: "No Consent", email: "no-consent@example.test", password: "correct-horse-battery-staple" };
  for (const body of [base, { ...base, acceptedBetaTerms: true }, { ...base, acceptedPersonalDataConsent: true }]) {
    const response = await fetch(`${baseURL}/api/auth/sign-up/email`, jsonRequest(body, baseURL));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "LEGAL_ACCEPTANCE_REQUIRED" });
  }
  assert.equal(db.user.length, 0);
  assert.deepEqual(legalAcceptances, []);
  assert.equal(fixture.betterAuthSignUps, 0);
  assert.equal(fixture.emails.verification.length, 0);
});

for (const failedInsert of ["first", "second"]) {
  test(`Better Auth HTTP bridge rolls back the whole signup when the ${failedInsert} legal insert fails`, async (t) => {
    const fixture = await createFixture(t);
    fixture.setLegalFailure(failedInsert);
    const email = `${failedInsert}-legal-failure@example.test`;
    const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
      name: "Rollback User", email, password: "correct-horse-battery-staple",
    }), fixture.baseURL));

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal_error" });
    assert.equal(fixture.db.user.some((user) => user.email === email), false);
    assert.equal(fixture.db.account.length, 0, "credential account must cascade with auth user");
    assert.deepEqual(fixture.publicUsers, [], "public.users bridge must not remain");
    assert.deepEqual(fixture.legalAcceptances, [], "partial legal rows must not remain");
    assert.equal(fixture.rollbacks.length, 1);
    assert.equal(fixture.emails.verification.length, 0, "failed legal persistence must not send verification");
    assert.equal(fixture.callOrder.includes("verification_email"), false);
  });
}

test("verification delivery failure after legal commit keeps signup recoverable and resend works", async (t) => {
  const fixture = await createFixture(t);
  fixture.failNextVerification();
  const email = "recoverable-verification@example.test";
  const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Recoverable User", email, password: "correct-horse-battery-staple",
  }), fixture.baseURL));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.verificationEmailSent, false);
  assert.equal(body.verificationEmailResendAvailable, true);
  assert.equal(fixture.db.user.length, 1);
  assert.equal(fixture.db.account.length, 1);
  assert.equal(fixture.publicUsers.length, 1);
  assert.equal(fixture.legalAcceptances.length, 2);
  assert.deepEqual(fixture.rollbacks, []);
  assert.equal(fixture.emails.verification.length, 0);
  assert.deepEqual(fixture.callOrder, ["bridge", "beta_terms", "personal_data_consent", "legal_commit"]);

  const resend = await fetch(`${fixture.baseURL}/api/auth/send-verification-email`, jsonRequest({
    email, callbackURL: `${fixture.baseURL}/verified`,
  }, fixture.baseURL));
  assert.equal(resend.status, 200);
  assert.equal(fixture.emails.verification.length, 1);
});

test("duplicate signup never rolls back or deletes the existing account", async (t) => {
  const fixture = await createFixture(t);
  const email = "existing-signup@example.test";
  const body = legalSignUp({ name: "Existing User", email, password: "correct-horse-battery-staple" });
  const first = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(body, fixture.baseURL));
  assert.equal(first.status, 200);
  const existingUserId = fixture.db.user[0].id;

  fixture.setLegalFailure("first");
  const duplicate = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(body, fixture.baseURL));
  assert.equal(duplicate.status, 200, "Better Auth keeps its generic duplicate response");
  assert.equal(fixture.db.user.length, 1);
  assert.equal(fixture.db.user[0].id, existingUserId);
  assert.deepEqual(fixture.rollbacks, []);
  assert.equal(fixture.emails.verification.length, 1, "duplicate must not send another signup verification");
  assert.equal(fixture.publicUsers.length, 1);
  assert.equal(fixture.legalAcceptances.length, 2);

  const resend = await fetch(`${fixture.baseURL}/api/auth/send-verification-email`, jsonRequest({ email }, fixture.baseURL));
  assert.equal(resend.status, 200);
  assert.equal(fixture.emails.verification.length, 2, "unverified existing user can continue through resend");
});

test("verified existing account keeps the generic duplicate behavior without new records", async (t) => {
  const fixture = await createFixture(t);
  const email = "verified-existing@example.test";
  const body = legalSignUp({
    name: "Verified Existing", email, password: "correct-horse-battery-staple",
    callbackURL: `${fixture.baseURL}/verified`,
  });
  const first = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(body, fixture.baseURL));
  assert.equal(first.status, 200);
  const verificationUrl = new URL(fixture.emails.verification[0].url);
  const verify = await fetch(`${fixture.baseURL}${verificationUrl.pathname}${verificationUrl.search}`, { redirect: "manual" });
  assert.equal(verify.status, 302);
  assert.equal(fixture.db.user[0].emailVerified, true);

  const duplicate = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(body, fixture.baseURL));
  assert.equal(duplicate.status, 200);
  assert.equal(fixture.db.user.length, 1);
  assert.equal(fixture.publicUsers.length, 1);
  assert.equal(fixture.legalAcceptances.length, 2);
  assert.deepEqual(fixture.rollbacks, []);
  assert.equal(fixture.emails.verification.length, 1);
});

test("signup ignores a client-supplied user_id for legal ownership", async (t) => {
  const fixture = await createFixture(t);
  const claimedUserId = "00000000-0000-0000-0000-000000000001";
  const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Ownership User", email: "ownership@example.test", password: "correct-horse-battery-staple",
    user_id: claimedUserId,
  }), fixture.baseURL));
  assert.equal(response.status, 200);
  const createdUserId = fixture.db.user[0].id;
  assert.notEqual(createdUserId, claimedUserId);
  assert.ok(fixture.legalAcceptances.every((row) => row.userId === createdUserId));
});

test("Better Auth HTTP bridge preserves cookies across sign-in, session, and sign-out", async (t) => {
  const { baseURL, db } = await createFixture(t);
  const email = "bridge-session@example.test";
  await fetch(`${baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Session User", email, password: "correct-horse-battery-staple",
  }), baseURL));
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
  await fetch(`${baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Reset User", email, password: "correct-horse-battery-staple",
  }), baseURL));

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
