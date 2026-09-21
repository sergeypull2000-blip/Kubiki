import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";

export const EMAIL_DELIVERY_CLASSES = Object.freeze({
  SIGNUP: "signup",
  RESEND: "resend",
  PASSWORD_RESET: "password_reset",
});

export const EMAIL_DELIVERY_LIMITS = Object.freeze({
  recipient: Object.freeze({
    verify_email: Object.freeze([
      Object.freeze({ windowSeconds: 600, max: 3 }),
      Object.freeze({ windowSeconds: 3_600, max: 4 }),
      Object.freeze({ windowSeconds: 86_400, max: 6 }),
    ]),
    reset_password: Object.freeze([
      Object.freeze({ windowSeconds: 600, max: 3 }),
      Object.freeze({ windowSeconds: 3_600, max: 4 }),
      Object.freeze({ windowSeconds: 86_400, max: 6 }),
    ]),
    all: Object.freeze([Object.freeze({ windowSeconds: 86_400, max: 8 })]),
  }),
  smtp: Object.freeze({
    signup: Object.freeze([
      Object.freeze({ windowSeconds: 60, max: 3 }),
      Object.freeze({ windowSeconds: 86_400, max: 50 }),
    ]),
    resend: Object.freeze([
      Object.freeze({ windowSeconds: 60, max: 5 }),
      Object.freeze({ windowSeconds: 86_400, max: 50 }),
    ]),
    password_reset: Object.freeze([
      Object.freeze({ windowSeconds: 60, max: 5 }),
      Object.freeze({ windowSeconds: 86_400, max: 100 }),
    ]),
    total: Object.freeze([
      Object.freeze({ windowSeconds: 60, max: 13 }),
      Object.freeze({ windowSeconds: 86_400, max: 200 }),
    ]),
  }),
});

const deliveryContext = new AsyncLocalStorage();
const DELIVERY_CLASS_VALUES = new Set(Object.values(EMAIL_DELIVERY_CLASSES));

export function runWithEmailDeliveryClass(deliveryClass, callback) {
  if (!DELIVERY_CLASS_VALUES.has(deliveryClass)) throw new TypeError("Invalid email delivery class");
  if (typeof callback !== "function") throw new TypeError("Email delivery callback is required");
  return deliveryContext.run({ deliveryClass }, callback);
}

export function normalizeAuthEmail(email) {
  if (typeof email !== "string") throw new TypeError("Auth email must be a string");
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new TypeError("Auth email must not be empty");
  return normalized;
}

function hmacSubject(hmacKey, scope, subject) {
  return createHmac("sha256", hmacKey)
    .update(`kubiki-email-limit:v1\0${scope}\0${subject}`, "utf8")
    .digest();
}

function deliveryClassFor(kind) {
  const selected = deliveryContext.getStore()?.deliveryClass;
  if (selected) return selected;
  return kind === "reset_password"
    ? EMAIL_DELIVERY_CLASSES.PASSWORD_RESET
    : EMAIL_DELIVERY_CLASSES.RESEND;
}

function policyBuckets(hmacKey, email, kind, deliveryClass) {
  const recipientKind = kind === "reset_password" ? "reset_password" : "verify_email";
  const normalizedEmail = normalizeAuthEmail(email);
  const buckets = [];
  const append = (scope, subject, policies) => {
    const subjectHash = hmacSubject(hmacKey, scope, subject);
    for (const policy of policies) buckets.push({ scope, subjectHash, ...policy });
  };
  append(`recipient:${recipientKind}`, normalizedEmail, EMAIL_DELIVERY_LIMITS.recipient[recipientKind]);
  append("recipient:all", normalizedEmail, EMAIL_DELIVERY_LIMITS.recipient.all);
  append(`smtp:${deliveryClass}`, "global", EMAIL_DELIVERY_LIMITS.smtp[deliveryClass]);
  append("smtp:total", "global", EMAIL_DELIVERY_LIMITS.smtp.total);
  return buckets;
}

export function createAuthEmailDeliveryLimiter({
  repository,
  hmacKey,
  logger = console,
  now = Date.now,
} = {}) {
  if (!repository?.consume || !repository?.assertReady) {
    throw new TypeError("Email delivery limit repository is required");
  }
  if (!Buffer.isBuffer(hmacKey) || hmacKey.length !== 32) {
    throw new TypeError("Email delivery HMAC key must contain 32 bytes");
  }
  let nextCleanupAt = 0;

  function scheduleCleanup() {
    if (!repository.pruneExpired || now() < nextCleanupAt) return;
    nextCleanupAt = now() + 10 * 60_000;
    void repository.pruneExpired(500).catch(() => {
      logger.error?.("Auth email delivery limiter cleanup failed");
    });
  }

  return {
    assertReady: () => repository.assertReady(),

    async consume({ email, kind }) {
      const deliveryClass = deliveryClassFor(kind);
      try {
        const allowed = await repository.consume(policyBuckets(
          hmacKey,
          email,
          kind,
          deliveryClass,
        ));
        scheduleCleanup();
        return { allowed, reason: allowed ? null : "rate_limited", deliveryClass };
      } catch {
        logger.error?.("Auth email delivery limiter failed closed", { kind, deliveryClass });
        return { allowed: false, reason: "storage_error", deliveryClass };
      }
    },
  };
}
