import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createBackendServer } from "../server/app.js";
import { createBetterAuthHttpHandler } from "../server/betterAuthHttp.js";
import { createAuthEmailSender } from "../server/email.js";
import {
  EMAIL_DELIVERY_CLASSES,
  createAuthEmailDeliveryLimiter,
  runWithEmailDeliveryClass,
} from "../server/emailDeliveryLimiter.js";
import { createBetterAuthRateLimitCustomRules } from "../server/requestSecurity.js";

async function createFixture(t, { requestSecurity, authEmailSender } = {}) {
  const db = { user: [], session: [], account: [], verification: [] };
  const emails = { verification: [], reset: [] };
  const legalAcceptances = [];
  const publicUsers = [];
  const rollbacks = [];
  const callOrder = [];
  let betterAuthSignUps = 0;
  let legalFailure = null;
  let verificationFailures = 0;
  let resetFailures = 0;
  let mountedHandler = async () => { throw new Error("auth handler is not ready"); };
  const trustedOrigins = [];
  const server = createBackendServer({
    pool: { query: async () => ({ rows: [] }) },
    bodyLimitBytes: 1_048_576,
    readinessTimeoutMillis: 20,
    authHandler: (...args) => mountedHandler(...args),
    requestSecurity,
    trustedOrigins,
    logger: { error() {} },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  trustedOrigins.push(baseURL);
  const emailSender = authEmailSender || {
    async sendVerificationEmail(message) {
      if (verificationFailures > 0) {
        verificationFailures -= 1;
        throw new Error("injected verification delivery failure");
      }
      callOrder.push("verification_email");
      emails.verification.push(message);
    },
    async sendPasswordResetEmail(message) {
      if (resetFailures > 0) {
        resetFailures -= 1;
        throw new Error("injected reset delivery failure");
      }
      emails.reset.push(message);
    },
  };
  const auth = betterAuth({
    database: memoryAdapter(db),
    secret: "kubiki-http-bridge-regression-secret",
    baseURL,
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: emailSender.sendVerificationEmail,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: emailSender.sendPasswordResetEmail,
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
    sendSignUpVerificationEmail: ({ email, callbackURL, headers }) => runWithEmailDeliveryClass(
      EMAIL_DELIVERY_CLASSES.SIGNUP,
      () => auth.api.sendVerificationEmail({ body: { email, callbackURL }, headers }),
    ),
  });
  return {
    auth, baseURL, db, emails, legalAcceptances, publicUsers, rollbacks, callOrder,
    get betterAuthSignUps() { return betterAuthSignUps; },
    setLegalFailure(value) { legalFailure = value; },
    failNextVerification() { verificationFailures += 1; },
    failNextReset() { resetFailures += 1; },
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
const genericSignUpResponse = { status: true, verificationEmailResendAvailable: true };
const genericEmailResponse = { status: true };
const genericPasswordResetResponse = {
  status: true,
  message: "If this email exists in our system, check your email for the reset link",
};

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

  const signUpBody = await signUp.json();
  assert.equal(signUp.status, 200);
  assert.match(signUp.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(signUpBody, genericSignUpResponse);
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

test("successful email verification creates a session and redirects to the app root", async (t) => {
  const fixture = await createFixture(t);
  const email = "auto-sign-in-verification@example.test";
  await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Auto Sign In",
    email,
    password: "correct-horse-battery-staple",
    callbackURL: `${fixture.baseURL}/`,
  }), fixture.baseURL));

  const verificationUrl = new URL(fixture.emails.verification[0].url);
  const verify = await fetch(`${fixture.baseURL}${verificationUrl.pathname}${verificationUrl.search}`, { redirect: "manual" });
  assert.equal(verify.status, 302);
  assert.equal(verify.headers.get("location"), `${fixture.baseURL}/`);
  assert.equal(fixture.db.user[0].emailVerified, true);
  const cookie = cookieHeader(verify);
  assert.ok(cookie, "verification response must set the automatic sign-in cookie");

  const session = await fetch(`${fixture.baseURL}/api/auth/get-session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, email);
});

test("invalid email verification redirects with a callback error and does not create a session", async (t) => {
  const fixture = await createFixture(t);
  await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Expired Verification",
    email: "expired-verification@example.test",
    password: "correct-horse-battery-staple",
    callbackURL: `${fixture.baseURL}/`,
  }), fixture.baseURL));
  const verificationUrl = new URL(fixture.emails.verification[0].url);
  verificationUrl.searchParams.set("token", `${verificationUrl.searchParams.get("token")}tampered`);
  const verify = await fetch(`${fixture.baseURL}${verificationUrl.pathname}${verificationUrl.search}`, { redirect: "manual" });
  assert.equal(verify.status, 302);
  const redirect = new URL(verify.headers.get("location"));
  assert.equal(redirect.pathname, "/");
  assert.match(redirect.searchParams.get("error") || "", /invalid_token|token_expired/i);
  assert.equal(fixture.db.user[0].emailVerified, false);
  assert.equal(verify.headers.getSetCookie().length, 0);
});

test("unverified user still cannot sign in with valid credentials", async (t) => {
  const fixture = await createFixture(t);
  const email = "still-unverified@example.test";
  await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Still Unverified", email, password: "correct-horse-battery-staple",
  }), fixture.baseURL));

  const emailCount = fixture.emails.verification.length;
  const signIn = await fetch(`${fixture.baseURL}/api/auth/sign-in/email`, jsonRequest({
    email, password: "correct-horse-battery-staple",
  }, fixture.baseURL));
  assert.equal(signIn.status, 403);
  assert.equal((await signIn.json()).code, "EMAIL_NOT_VERIFIED");
  assert.equal(signIn.headers.getSetCookie().length, 0);
  assert.equal(fixture.emails.verification.length, emailCount, "sendOnSignIn remains disabled");
});

test("email sign-in with an invalid password does not distinguish account state", async (t) => {
  const fixture = await createFixture(t);
  const password = "correct-horse-battery-staple";
  const unverifiedEmail = "signin-unverified@example.test";
  const verifiedEmail = "signin-verified@example.test";
  for (const email of [unverifiedEmail, verifiedEmail]) {
    await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
      name: "Sign In Matrix", email, password,
    }), fixture.baseURL));
  }
  fixture.db.user.find((user) => user.email === verifiedEmail).emailVerified = true;

  const results = [];
  for (const email of ["signin-missing@example.test", unverifiedEmail, verifiedEmail]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/sign-in/email`, jsonRequest({
      email, password: "definitely-wrong-password",
    }, fixture.baseURL));
    results.push({ status: response.status, body: await response.json() });
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  assert.equal(results[0].status, 401);
  assert.equal(results[0].body.code, "INVALID_EMAIL_OR_PASSWORD");
});

test("Better Auth custom rules exempt rejected requests but preserve its valid-request boundary", async () => {
  const baseURL = "http://better-auth-rate-limit.example.test";
  const auth = betterAuth({
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    secret: "kubiki-better-auth-rate-limit-test-secret",
    baseURL,
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: true },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "memory",
      customRules: createBetterAuthRateLimitCustomRules([baseURL]),
    },
  });
  const ip = "198.51.100.73";
  const call = (method, headers = {}, body) => auth.handler(new Request(`${baseURL}/api/auth/sign-in/email`, {
    method,
    headers: { "x-forwarded-for": ip, ...headers },
    body,
  }));

  const exempt = [
    ...await Promise.all(Array.from({ length: 4 }, () => call("OPTIONS"))),
    ...await Promise.all(Array.from({ length: 4 }, () => call("GET"))),
    ...await Promise.all(Array.from({ length: 4 }, () => call("POST", {
      origin: "https://sibling.example.test", "content-type": "application/json",
    }, JSON.stringify({ email: "missing@example.test", password: "wrong-password" })))),
    ...await Promise.all(Array.from({ length: 4 }, () => call("POST", {
      origin: baseURL, "content-type": "text/plain",
    }, "{}"))),
  ];
  assert.ok(exempt.every((response) => response.status !== 429));

  const validStatuses = [];
  for (let index = 0; index < 4; index += 1) {
    const response = await call("POST", {
      origin: baseURL, "content-type": "application/json",
    }, JSON.stringify({ email: "missing@example.test", password: "wrong-password" }));
    validStatuses.push(response.status);
  }
  assert.deepEqual(validStatuses, [401, 401, 401, 429]);
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
    const errorBody = await response.json();
    assert.equal(errorBody.error, "internal_error");
    assert.match(errorBody.requestId, /^[0-9a-f-]{36}$/);
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
  assert.deepEqual(body, genericSignUpResponse);
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
  assert.deepEqual(await resend.json(), genericEmailResponse);
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
  assert.deepEqual(await duplicate.json(), genericSignUpResponse);
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
  assert.deepEqual(await duplicate.json(), genericSignUpResponse);
  assert.equal(fixture.db.user.length, 1);
  assert.equal(fixture.publicUsers.length, 1);
  assert.equal(fixture.legalAcceptances.length, 2);
  assert.deepEqual(fixture.rollbacks, []);
  assert.equal(fixture.emails.verification.length, 1);
});

test("public email flows have identical HTTP responses for new, unverified, and verified accounts", async (t) => {
  const fixture = await createFixture(t);
  const password = "correct-horse-battery-staple";
  const unverifiedEmail = "matrix-unverified@example.test";
  const verifiedEmail = "matrix-verified@example.test";
  const newEmail = "matrix-new@example.test";

  for (const email of [unverifiedEmail, verifiedEmail]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
      name: "Matrix User", email, password,
    }), fixture.baseURL));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), genericSignUpResponse);
  }
  fixture.db.user.find((user) => user.email === verifiedEmail).emailVerified = true;

  const verificationCountBeforeSignups = fixture.emails.verification.length;
  const signUpResponses = [];
  for (const email of [newEmail, unverifiedEmail, verifiedEmail]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
      name: "Matrix Attempt", email, password,
    }), fixture.baseURL));
    signUpResponses.push({
      status: response.status,
      contentType: response.headers.get("content-type"),
      setCookie: response.headers.getSetCookie(),
      body: await response.json(),
    });
  }
  assert.deepEqual(signUpResponses, Array(3).fill(null).map(() => ({
    status: 200,
    contentType: "application/json",
    setCookie: [],
    body: genericSignUpResponse,
  })));
  assert.equal(fixture.emails.verification.length, verificationCountBeforeSignups + 1, "only the new account receives signup mail");

  const missingResendEmail = "matrix-missing-resend@example.test";
  const verificationCountBeforeResends = fixture.emails.verification.length;
  const resendResponses = [];
  for (const email of [missingResendEmail, unverifiedEmail, verifiedEmail]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/send-verification-email`, jsonRequest({ email }, fixture.baseURL));
    resendResponses.push({ status: response.status, body: await response.json() });
  }
  assert.deepEqual(resendResponses, Array(3).fill(null).map(() => ({ status: 200, body: genericEmailResponse })));
  assert.equal(fixture.emails.verification.length, verificationCountBeforeResends + 1, "only the unverified account receives resend mail");

  const resetCountBefore = fixture.emails.reset.length;
  const resetResponses = [];
  for (const email of ["matrix-missing-reset@example.test", unverifiedEmail, verifiedEmail]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/request-password-reset`, jsonRequest({
      email, redirectTo: `${fixture.baseURL}/reset-password`,
    }, fixture.baseURL));
    resetResponses.push({ status: response.status, body: await response.json() });
  }
  assert.deepEqual(resetResponses, Array(3).fill(null).map(() => ({ status: 200, body: genericPasswordResetResponse })));
  assert.equal(fixture.emails.reset.length, resetCountBefore + 2, "only existing accounts receive password-reset mail");
});

test("auth rate-limit responses remain identical for new, unverified, and verified emails", async (t) => {
  let blocked = false;
  const fixture = await createFixture(t, {
    requestSecurity: {
      consumeAuth: () => blocked
        ? { allowed: false, retryAfterSeconds: 41 }
        : { allowed: true, retryAfterSeconds: null },
    },
  });
  const password = "correct-horse-battery-staple";
  const unverifiedEmail = "limited-unverified@example.test";
  const verifiedEmail = "limited-verified@example.test";
  for (const email of [unverifiedEmail, verifiedEmail]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
      name: "Limited Existing", email, password,
    }), fixture.baseURL));
    assert.equal(response.status, 200);
  }
  fixture.db.user.find((user) => user.email === verifiedEmail).emailVerified = true;
  const usersBefore = fixture.db.user.length;
  const messagesBefore = fixture.emails.verification.length;
  blocked = true;

  const results = [];
  for (const email of ["limited-new@example.test", unverifiedEmail, verifiedEmail]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
      name: "Limited Attempt", email, password,
    }), fixture.baseURL));
    results.push({
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body: await response.json(),
    });
  }
  assert.deepEqual(results, Array.from({ length: 3 }, () => ({
    status: 429,
    retryAfter: "41",
    body: { error: "too_many_requests" },
  })));
  assert.equal(fixture.db.user.length, usersBefore);
  assert.equal(fixture.emails.verification.length, messagesBefore);
});

test("public resend and password-reset responses do not reveal mail delivery failures", async (t) => {
  const fixture = await createFixture(t);
  const email = "delivery-failure@example.test";
  await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Delivery Failure", email, password: "correct-horse-battery-staple",
  }), fixture.baseURL));

  fixture.failNextVerification();
  const resend = await fetch(`${fixture.baseURL}/api/auth/send-verification-email`, jsonRequest({ email }, fixture.baseURL));
  assert.equal(resend.status, 200);
  assert.deepEqual(await resend.json(), genericEmailResponse);

  fixture.failNextReset();
  const reset = await fetch(`${fixture.baseURL}/api/auth/request-password-reset`, jsonRequest({ email }, fixture.baseURL));
  assert.equal(reset.status, 200);
  assert.deepEqual(await reset.json(), genericPasswordResetResponse);
});

test("signup, resend, and unverified password reset share the PostgreSQL delivery gate", async (t) => {
  const consumedScopes = [];
  const smtpMessages = [];
  const deliveryLimiter = createAuthEmailDeliveryLimiter({
    hmacKey: Buffer.alloc(32, 5),
    logger: { error() {} },
    repository: {
      async assertReady() {},
      async pruneExpired() { return 0; },
      async consume(buckets) {
        consumedScopes.push(buckets.map(({ scope }) => scope));
        return true;
      },
    },
  });
  const authEmailSender = createAuthEmailSender({
    config: { from: "Kubiki <mailer@example.test>" },
    deliveryLimiter,
    transport: { async sendMail(message) { smtpMessages.push(message); } },
    logger: { error() {} },
  });
  const fixture = await createFixture(t, { authEmailSender });
  const email = "delivery-gate-unverified@example.test";

  const signup = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Delivery Gate", email, password: "correct-horse-battery-staple",
  }), fixture.baseURL));
  const resend = await fetch(`${fixture.baseURL}/api/auth/send-verification-email`, jsonRequest({ email }, fixture.baseURL));
  const reset = await fetch(`${fixture.baseURL}/api/auth/request-password-reset`, jsonRequest({
    email, redirectTo: `${fixture.baseURL}/reset-password`,
  }, fixture.baseURL));

  assert.deepEqual(await signup.json(), genericSignUpResponse);
  assert.deepEqual(await resend.json(), genericEmailResponse);
  assert.deepEqual(await reset.json(), genericPasswordResetResponse);
  assert.equal(fixture.db.user[0].emailVerified, false, "password reset remains available before verification");
  assert.equal(smtpMessages.length, 3);
  assert.ok(consumedScopes[0].includes("smtp:signup"));
  assert.ok(consumedScopes[1].includes("smtp:resend"));
  assert.ok(consumedScopes[2].includes("smtp:password_reset"));
});

test("delivery limiter denial stays generic for every account state", async (t) => {
  let smtpCalls = 0;
  let limiterCalls = 0;
  let denialReason = "rate_limited";
  const authEmailSender = createAuthEmailSender({
    config: { from: "Kubiki <mailer@example.test>" },
    deliveryLimiter: {
      async consume() {
        limiterCalls += 1;
        return { allowed: false, reason: denialReason };
      },
    },
    transport: { async sendMail() { smtpCalls += 1; } },
    logger: { error() {} },
  });
  const fixture = await createFixture(t, { authEmailSender });
  const password = "correct-horse-battery-staple";
  const unverified = "denied-unverified@example.test";
  const verified = "denied-verified@example.test";
  for (const email of [unverified, verified]) {
    const response = await fetch(`${fixture.baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
      name: "Denied Delivery", email, password,
    }), fixture.baseURL));
    assert.deepEqual(await response.json(), genericSignUpResponse);
  }
  fixture.db.user.find((user) => user.email === verified).emailVerified = true;
  const callsBeforeSignIn = limiterCalls;
  const signIn = await fetch(`${fixture.baseURL}/api/auth/sign-in/email`, jsonRequest({
    email: verified,
    password,
  }, fixture.baseURL));
  assert.equal(signIn.status, 200);
  assert.ok(signIn.headers.getSetCookie().length > 0);
  assert.equal(limiterCalls, callsBeforeSignIn, "verified sign-in must not use the email limiter");

  for (denialReason of ["rate_limited", "storage_error"]) {
    const resendResults = [];
    const resetResults = [];
    for (const email of ["denied-missing@example.test", unverified, verified]) {
      const resend = await fetch(`${fixture.baseURL}/api/auth/send-verification-email`, jsonRequest({ email }, fixture.baseURL));
      resendResults.push({ status: resend.status, retryAfter: resend.headers.get("retry-after"), body: await resend.json() });
      const reset = await fetch(`${fixture.baseURL}/api/auth/request-password-reset`, jsonRequest({ email }, fixture.baseURL));
      resetResults.push({ status: reset.status, retryAfter: reset.headers.get("retry-after"), body: await reset.json() });
    }
    assert.deepEqual(resendResults, Array.from({ length: 3 }, () => ({
      status: 200, retryAfter: null, body: genericEmailResponse,
    })));
    assert.deepEqual(resetResults, Array.from({ length: 3 }, () => ({
      status: 200, retryAfter: null, body: genericPasswordResetResponse,
    })));
  }
  assert.equal(smtpCalls, 0);
});

test("bridge normalizes an explicit Better Auth duplicate error without querying account state", async (t) => {
  const authHandler = createBetterAuthHttpHandler(async () => Response.json({
    code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  }, { status: 422 }));
  const trustedOrigins = [];
  const server = createBackendServer({
    pool: { query: async () => ({ rows: [] }) },
    bodyLimitBytes: 1_048_576,
    readinessTimeoutMillis: 20,
    authHandler,
    trustedOrigins,
    logger: { error() {} },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  trustedOrigins.push(baseURL);

  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, jsonRequest(legalSignUp({
    name: "Existing", email: "existing@example.test", password: "correct-horse-battery-staple",
  }), baseURL));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), genericSignUpResponse);
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
  assert.deepEqual(await reset.json(), genericPasswordResetResponse);
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
