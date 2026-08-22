import nodemailer from "nodemailer";
import { parseSmtpConfig } from "./config.js";

const SUBJECTS = {
  verify_email: "Подтвердите email в Kubiki",
  reset_password: "Сброс пароля в Kubiki",
};

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderEmail(kind, url) {
  const verification = kind === "verify_email";
  const heading = verification ? "Подтверждение email" : "Сброс пароля";
  const action = verification ? "Подтвердить email" : "Задать новый пароль";
  const explanation = verification
    ? "Чтобы завершить регистрацию в Kubiki, подтвердите ваш email."
    : "Мы получили запрос на сброс пароля в Kubiki.";
  const ignored = verification
    ? "Если вы не регистрировались в Kubiki, просто проигнорируйте это письмо."
    : "Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.";
  const safeUrl = escapeHtml(url);
  return {
    text: `${heading}\n\n${explanation}\n\n${action}: ${url}\n\n${ignored}`,
    html: `<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;line-height:1.5;color:#202124"><h1 style="font-size:22px">${heading}</h1><p>${explanation}</p><p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#202124;color:#fff;text-decoration:none;border-radius:6px">${action}</a></p><p style="color:#5f6368">${ignored}</p></body></html>`,
  };
}

export function createSmtpTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
}

export function createAuthEmailSender({
  config = parseSmtpConfig(process.env),
  transport = createSmtpTransport(config),
  logger = console,
} = {}) {
  const send = async ({ kind, to, url }) => {
    const content = renderEmail(kind, url);
    try {
      await transport.sendMail({ from: config.from, to, subject: SUBJECTS[kind], ...content });
    } catch {
      // Deliberately omit transport errors, recipients and auth URLs: they can contain secrets.
      logger.error?.("SMTP authentication email delivery failed", { kind });
      throw new Error("Authentication email delivery failed");
    }
  };
  return {
    sendVerificationEmail: ({ user, url }) => send({ kind: "verify_email", to: user.email, url }),
    sendPasswordResetEmail: ({ user, url }) => send({ kind: "reset_password", to: user.email, url }),
  };
}
