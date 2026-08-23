const AUTH_LIMITS = new Map([
  ["/api/auth/sign-in/email", { max: 10, windowMs: 15 * 60_000 }],
  ["/api/auth/sign-up/email", { max: 5, windowMs: 60 * 60_000 }],
  ["/api/auth/request-password-reset", { max: 5, windowMs: 60 * 60_000 }],
  ["/api/auth/send-verification-email", { max: 5, windowMs: 60 * 60_000 }],
  ["/api/auth/reset-password", { max: 10, windowMs: 60 * 60_000 }],
]);

const API_LIMITS = new Map([
  ["/api/generate-estimate", { max: 20, windowMs: 5 * 60_000 }],
  ["/api/edit-estimate", { max: 20, windowMs: 5 * 60_000 }],
  ["/api/parse-excel", { max: 10, windowMs: 10 * 60_000, concurrent: true }],
  ["/api/extract-doc", { max: 10, windowMs: 10 * 60_000, concurrent: true }],
]);

function first(value) {
  return Array.isArray(value) ? value[0] : String(value || "").split(",", 1)[0].trim();
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
      return true;
    }
    if (current.count >= policy.max) return false;
    current.count += 1;
    return true;
  }

  return {
    allowAuth(request, pathname) {
      const policy = AUTH_LIMITS.get(pathname);
      return !policy || allow(`auth:${pathname}:${requestIp(request, trustProxy)}`, policy);
    },
    allowApi(userId, pathname) {
      const policy = API_LIMITS.get(pathname);
      return !policy || allow(`api:${pathname}:${userId}`, policy);
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
