const AUTH_LIMITS = new Map([
  ["/api/auth/sign-in/email", { max: 10, windowMs: 15 * 60_000 }],
  ["/api/auth/sign-up/email", { max: 5, windowMs: 60 * 60_000 }],
  ["/api/auth/request-password-reset", { max: 5, windowMs: 60 * 60_000 }],
  ["/api/auth/send-verification-email", { max: 5, windowMs: 60 * 60_000 }],
  ["/api/auth/reset-password", { max: 10, windowMs: 60 * 60_000 }],
]);

export const AUTH_RATE_LIMIT_PATHS = Object.freeze([...AUTH_LIMITS.keys()]);
const AUTH_BASE_PATH = "/api/auth";

const API_LIMITS = new Map([
  ["/api/generate-estimate", { max: 20, windowMs: 5 * 60_000 }],
  ["/api/edit-estimate", { max: 20, windowMs: 5 * 60_000 }],
  ["/api/parse-excel", { max: 10, windowMs: 10 * 60_000, concurrent: true }],
  ["/api/extract-doc", { max: 10, windowMs: 10 * 60_000, concurrent: true }],
]);

function first(value) {
  return Array.isArray(value) ? value[0] : String(value || "").split(",", 1)[0].trim();
}

function header(request, name) {
  if (typeof request.headers?.get === "function") return request.headers.get(name);
  const value = request.headers?.[name];
  return Array.isArray(value) ? value.join(",") : value;
}

function mediaType(request) {
  return String(header(request, "content-type") || "").split(";", 1)[0].trim().toLowerCase();
}

export function inspectAuthRateLimitRequest(request, pathname, trustedOrigins = []) {
  if (!AUTH_LIMITS.has(pathname)) return { shouldCount: false, rejection: null };
  if (request.method !== "POST") return { shouldCount: false, rejection: null };

  const origin = header(request, "origin");
  if (origin) {
    let canonicalOrigin;
    try { canonicalOrigin = new URL(origin).origin; }
    catch { return { shouldCount: false, rejection: { status: 403, error: "origin_not_allowed" } }; }
    if (canonicalOrigin !== origin || !trustedOrigins.includes(canonicalOrigin)) {
      return { shouldCount: false, rejection: { status: 403, error: "origin_not_allowed" } };
    }
  } else if (header(request, "sec-fetch-site") === "cross-site") {
    return { shouldCount: false, rejection: { status: 403, error: "origin_not_allowed" } };
  }

  if (mediaType(request) !== "application/json") {
    return { shouldCount: false, rejection: { status: 415, error: "unsupported_media_type" } };
  }
  return { shouldCount: true, rejection: null };
}

export function createBetterAuthRateLimitCustomRules(trustedOrigins = []) {
  return Object.fromEntries(AUTH_RATE_LIMIT_PATHS.map((pathname) => [
    pathname.slice(AUTH_BASE_PATH.length),
    (request, currentRule) => inspectAuthRateLimitRequest(request, pathname, trustedOrigins).shouldCount
      ? currentRule
      : false,
  ]));
}

export function requestIp(request, trustProxy = false) {
  if (trustProxy) return first(request.headers["x-forwarded-for"]) || request.socket.remoteAddress || "unknown";
  return request.socket.remoteAddress || "unknown";
}

export function createRequestSecurity({ trustProxy = false, now = Date.now } = {}) {
  const windows = new Map();
  const active = new Set();

  function allow(key, policy) {
    const time = now();
    if (windows.size > 10_000) {
      for (const [storedKey, value] of windows) if (value.resetAt <= time) windows.delete(storedKey);
    }
    const current = windows.get(key);
    if (!current || current.resetAt <= time) {
      windows.set(key, { count: 1, resetAt: time + policy.windowMs });
      return { allowed: true, retryAfterSeconds: null };
    }
    if (current.count >= policy.max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - time) / 1_000)),
      };
    }
    current.count += 1;
    return { allowed: true, retryAfterSeconds: null };
  }

  return {
    consumeAuth(request, pathname) {
      const policy = AUTH_LIMITS.get(pathname);
      return policy
        ? allow(`auth:${pathname}:${requestIp(request, trustProxy)}`, policy)
        : { allowed: true, retryAfterSeconds: null };
    },
    allowAuth(request, pathname) {
      const policy = AUTH_LIMITS.get(pathname);
      return !policy || allow(`auth:${pathname}:${requestIp(request, trustProxy)}`, policy).allowed;
    },
    allowApi(userId, pathname) {
      const policy = API_LIMITS.get(pathname);
      return !policy || allow(`api:${pathname}:${userId}`, policy).allowed;
    },
    acquire(userId, pathname) {
      if (!API_LIMITS.get(pathname)?.concurrent) return () => {};
      const key = `${pathname}:${userId}`;
      if (active.has(key)) return null;
      active.add(key);
      return () => active.delete(key);
    },
  };
}
