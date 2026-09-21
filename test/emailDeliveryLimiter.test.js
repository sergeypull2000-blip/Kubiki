import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_DELIVERY_CLASSES,
  EMAIL_DELIVERY_LIMITS,
  createAuthEmailDeliveryLimiter,
  normalizeAuthEmail,
  runWithEmailDeliveryClass,
} from "../server/emailDeliveryLimiter.js";

function createMemoryRepository(now = () => 0) {
  const windows = new Map();
  const consumed = [];
  return {
    consumed,
    async assertReady() {},
    async pruneExpired() { return 0; },
    async consume(buckets) {
      consumed.push(buckets);
      const decisions = buckets.map((bucket) => {
        const key = `${bucket.scope}:${bucket.subjectHash.toString("hex")}:${bucket.windowSeconds}`;
        const current = windows.get(key);
        const active = current && current.resetAt > now() ? current : null;
        return { bucket, key, current: active, allowed: !active || active.count < bucket.max };
      });
      if (decisions.some((decision) => !decision.allowed)) return false;
      for (const decision of decisions) {
        windows.set(decision.key, decision.current
          ? { ...decision.current, count: decision.current.count + 1 }
          : { count: 1, resetAt: now() + decision.bucket.windowSeconds * 1_000 });
      }
      return true;
    },
  };
}

const hmacKey = Buffer.alloc(32, 9);

test("auth email normalization matches Better Auth without provider-specific aliases", () => {
  assert.equal(normalizeAuthEmail("  User+tag@Example.TEST "), "user+tag@example.test");
  assert.notEqual(normalizeAuthEmail("first.last@example.test"), normalizeAuthEmail("firstlast@example.test"));
});

test("signup, immediate resend, and one retry fit the recipient burst", async () => {
  const repository = createMemoryRepository();
  const limiter = createAuthEmailDeliveryLimiter({ repository, hmacKey, logger: { error() {} } });

  const signup = await runWithEmailDeliveryClass(EMAIL_DELIVERY_CLASSES.SIGNUP, () => limiter.consume({
    email: "Recipient@Example.test",
    kind: "verify_email",
  }));
  const resend = await limiter.consume({ email: "recipient@example.test", kind: "verify_email" });
  const retryAfterSmtpFailure = await limiter.consume({ email: "recipient@example.test", kind: "verify_email" });
  const massAttempt = await limiter.consume({ email: "recipient@example.test", kind: "verify_email" });

  assert.equal(signup.allowed, true);
  assert.equal(signup.deliveryClass, "signup");
  assert.equal(resend.allowed, true);
  assert.equal(retryAfterSmtpFailure.allowed, true);
  assert.deepEqual(massAttempt, { allowed: false, reason: "rate_limited", deliveryClass: "resend" });
  assert.equal(EMAIL_DELIVERY_LIMITS.recipient.verify_email[0].max, 3);
});

test("registration budget exhaustion does not consume resend or password-reset budgets", async () => {
  const repository = createMemoryRepository();
  const limiter = createAuthEmailDeliveryLimiter({ repository, hmacKey, logger: { error() {} } });
  const signupResults = [];
  for (let index = 0; index < 4; index += 1) {
    signupResults.push(await runWithEmailDeliveryClass(EMAIL_DELIVERY_CLASSES.SIGNUP, () => limiter.consume({
      email: `signup-${index}@example.test`, kind: "verify_email",
    })));
  }
  assert.deepEqual(signupResults.map(({ allowed }) => allowed), [true, true, true, false]);
  assert.equal((await limiter.consume({ email: "resend@example.test", kind: "verify_email" })).allowed, true);
  assert.equal((await limiter.consume({ email: "reset@example.test", kind: "reset_password" })).allowed, true);
});

test("recipient limits cannot be bypassed by changing IP metadata", async () => {
  const repository = createMemoryRepository();
  const limiter = createAuthEmailDeliveryLimiter({ repository, hmacKey, logger: { error() {} } });
  const attempts = [];
  for (const ip of ["192.0.2.1", "198.51.100.2", "203.0.113.3", "192.0.2.4"]) {
    attempts.push(await limiter.consume({
      email: "same-recipient@example.test",
      kind: "reset_password",
      ip,
    }));
  }
  assert.deepEqual(attempts.map(({ allowed }) => allowed), [true, true, true, false]);
});

test("fixed recipient windows reopen at their exact expiry", async () => {
  let now = 10_000;
  const repository = createMemoryRepository(() => now);
  const limiter = createAuthEmailDeliveryLimiter({
    repository,
    hmacKey,
    logger: { error() {} },
    now: () => now,
  });
  const request = { email: "window@example.test", kind: "verify_email" };
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await limiter.consume(request)).allowed, true);
  }
  assert.equal((await limiter.consume(request)).allowed, false);
  now += 600_000 - 1;
  assert.equal((await limiter.consume(request)).allowed, false);
  now += 1;
  assert.equal((await limiter.consume(request)).allowed, true);
});

test("limiter sends only HMAC subjects to storage and fails closed without logging PII", async () => {
  const repository = createMemoryRepository();
  const limiter = createAuthEmailDeliveryLimiter({ repository, hmacKey, logger: { error() {} } });
  await limiter.consume({ email: "private@example.test", kind: "reset_password" });
  const serialized = JSON.stringify(repository.consumed, (_key, value) => (
    Buffer.isBuffer(value) ? value.toString("hex") : value
  ));
  assert.doesNotMatch(serialized, /private@example\.test/i);
  assert.ok(repository.consumed[0].every(({ subjectHash }) => Buffer.isBuffer(subjectHash) && subjectHash.length === 32));

  const logs = [];
  const failed = createAuthEmailDeliveryLimiter({
    repository: {
      async assertReady() {},
      async consume() { throw new Error("database failure for private@example.test"); },
    },
    hmacKey,
    logger: { error: (...args) => logs.push(args) },
  });
  assert.deepEqual(await failed.consume({ email: "private@example.test", kind: "reset_password" }), {
    allowed: false,
    reason: "storage_error",
    deliveryClass: "password_reset",
  });
  assert.doesNotMatch(JSON.stringify(logs), /private@example\.test/i);
});
