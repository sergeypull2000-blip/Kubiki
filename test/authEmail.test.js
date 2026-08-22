import test from "node:test";
import assert from "node:assert/strict";
import { createAuthEmailSender } from "../server/email.js";

const config = {
  host: "smtp.example.test",
  port: 465,
  secure: true,
  user: "mailer@example.test",
  password: "super-secret-smtp-password",
  from: "Kubiki <mailer@example.test>",
};

test("verification email is passed to the SMTP adapter in Russian text and HTML", async () => {
  const messages = [];
  const sender = createAuthEmailSender({ config, transport: { sendMail: async (message) => messages.push(message) } });
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
});

test("password reset email is passed to the SMTP adapter in Russian text and HTML", async () => {
  const messages = [];
  const sender = createAuthEmailSender({ config, transport: { sendMail: async (message) => messages.push(message) } });
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
    transport: {
      async sendMail() {
        throw new Error(`login failed for ${config.password}; message contained ${authUrl}`);
      },
    },
    logger: { error: (...args) => logArguments.push(args) },
  });

  const error = await sender.sendVerificationEmail({ user: { email: "user@example.test" }, url: authUrl })
    .then(() => null, (caught) => caught);
  const observable = JSON.stringify({ error: { message: error.message, cause: error.cause }, logArguments });
  assert.match(error.message, /delivery failed/);
  assert.doesNotMatch(observable, /super-secret-smtp-password|verification-secret|auth\.example\.test|user@example\.test/);
});
