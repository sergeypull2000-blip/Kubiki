import test from "node:test";
import assert from "node:assert/strict";
import { createAuthEmailSender } from "../server/email.js";
import {
  EMAIL_DELIVERY_CLASSES,
  createAuthEmailDeliveryLimiter,
  runWithEmailDeliveryClass,
} from "../server/emailDeliveryLimiter.js";

const config = {
  host: "smtp.example.test",
  port: 465,
  secure: true,
  user: "mailer@example.test",
  password: "super-secret-smtp-password",
  from: "Kubiki <mailer@example.test>",
};
const allowDelivery = { consume: async () => ({ allowed: true, reason: null }) };

test("verification email passes the delivery gate before the SMTP adapter", async () => {
  const messages = [];
  const order = [];
  const sender = createAuthEmailSender({
    config,
    deliveryLimiter: {
      async consume() { order.push("limit_committed"); return { allowed: true, reason: null }; },
    },
    transport: {
      async sendMail(message) { order.push("smtp"); messages.push(message); },
    },
  });
  await sender.sendVerificationEmail({
    user: { email: "user@example.test" },
    url: "https://auth.example.test/verify-email?token=verification-secret",
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "user@example.test");
  assert.equal(messages[0].from, config.from);
  assert.match(messages[0].subject, /Подтвердите email/);
  assert.match(messages[0].text, /Подтвердить email/);
  assert.match(messages[0].html, /Подтвердить email/);
  assert.deepEqual(order, ["limit_committed", "smtp"]);
});

test("password reset email is passed to the SMTP adapter in Russian text and HTML", async () => {
  const messages = [];
  const sender = createAuthEmailSender({
    config,
    deliveryLimiter: allowDelivery,
    transport: { sendMail: async (message) => messages.push(message) },
  });
  await sender.sendPasswordResetEmail({
    user: { email: "user@example.test" },
    url: "https://auth.example.test/reset-password?token=reset-secret",
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0].subject, /Сброс пароля/);
  assert.match(messages[0].text, /Задать новый пароль/);
  assert.match(messages[0].html, /Задать новый пароль/);
});

test("SMTP failures do not expose passwords, tokens or auth URLs in errors and logs", async () => {
  const logArguments = [];
  const authUrl = "https://auth.example.test/verify-email?token=verification-secret";
  const sender = createAuthEmailSender({
    config,
    deliveryLimiter: allowDelivery,
    transport: {
      async sendMail() {
        throw new Error(`login failed for ${config.password}; message contained ${authUrl}`);
      },
    },
    logger: { error: (...args) => logArguments.push(args) },
  });

  const result = await sender.sendVerificationEmail({ user: { email: "user@example.test" }, url: authUrl });
  const observable = JSON.stringify({ result, logArguments });
  assert.deepEqual(result, { delivered: false, reason: "smtp_error" });
  assert.doesNotMatch(observable, /super-secret-smtp-password|verification-secret|auth\.example\.test|user@example\.test/);
});

test("a denied or failed-closed gate suppresses SMTP", async () => {
  for (const decision of [
    { allowed: false, reason: "rate_limited" },
    { allowed: false, reason: "storage_error" },
  ]) {
    let smtpCalls = 0;
    const sender = createAuthEmailSender({
      config,
      deliveryLimiter: { consume: async () => decision },
      transport: { async sendMail() { smtpCalls += 1; } },
    });
    const result = await sender.sendPasswordResetEmail({
      user: { email: "private-user@example.test" },
      url: "https://auth.example.test/reset-password?token=private-token",
    });
    assert.deepEqual(result, { delivered: false, reason: decision.reason });
    assert.equal(smtpCalls, 0);
  }
});

test("an SMTP failure still leaves signup, immediate resend, and one retry available", async () => {
  const windows = new Map();
  const deliveryLimiter = createAuthEmailDeliveryLimiter({
    hmacKey: Buffer.alloc(32, 3),
    logger: { error() {} },
    repository: {
      async assertReady() {},
      async pruneExpired() { return 0; },
      async consume(buckets) {
        const decisions = buckets.map((bucket) => {
          const key = `${bucket.scope}:${bucket.subjectHash.toString("hex")}:${bucket.windowSeconds}`;
          const count = windows.get(key) || 0;
          return { bucket, key, count, allowed: count < bucket.max };
        });
        if (decisions.some(({ allowed }) => !allowed)) return false;
        for (const { key, count } of decisions) windows.set(key, count + 1);
        return true;
      },
    },
  });
  let smtpCalls = 0;
  const sender = createAuthEmailSender({
    config,
    deliveryLimiter,
    logger: { error() {} },
    transport: {
      async sendMail() {
        smtpCalls += 1;
        if (smtpCalls === 1) throw new Error("injected SMTP outage");
      },
    },
  });
  const message = {
    user: { email: "retry@example.test" },
    url: "https://auth.example.test/verify-email?token=test-token",
  };

  const signup = await runWithEmailDeliveryClass(
    EMAIL_DELIVERY_CLASSES.SIGNUP,
    () => sender.sendVerificationEmail(message),
  );
  const immediateResend = await sender.sendVerificationEmail(message);
  const retry = await sender.sendVerificationEmail(message);
  const blocked = await sender.sendVerificationEmail(message);

  assert.deepEqual(signup, { delivered: false, reason: "smtp_error" });
  assert.deepEqual(immediateResend, { delivered: true, reason: null });
  assert.deepEqual(retry, { delivered: true, reason: null });
  assert.deepEqual(blocked, { delivered: false, reason: "rate_limited" });
  assert.equal(smtpCalls, 3);
});

test("auth email sender cannot be constructed without the common delivery gate", () => {
  assert.throws(() => createAuthEmailSender({
    config,
    transport: { async sendMail() {} },
  }), /delivery limiter/i);
});
