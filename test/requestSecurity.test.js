import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_RATE_LIMIT_PATHS,
  createBetterAuthRateLimitCustomRules,
  createRequestSecurity,
  inspectAuthRateLimitRequest,
  requestIp,
} from "../server/requestSecurity.js";

const request = (forwarded = "203.0.113.5") => ({ headers: { "x-forwarded-for": forwarded }, socket: { remoteAddress: "127.0.0.1" } });
const authRequest = ({ method = "POST", origin, site, contentType = "application/json; charset=utf-8" } = {}) => ({
  method,
  headers: {
    ...(origin ? { origin } : {}),
    ...(site ? { "sec-fetch-site": site } : {}),
    ...(contentType ? { "content-type": contentType } : {}),
  },
  socket: { remoteAddress: "127.0.0.1" },
});

test("auth rate limits use the socket IP unless trusted proxy mode is explicit", () => {
  assert.equal(requestIp(request(), false), "127.0.0.1");
  assert.equal(requestIp(request("203.0.113.5, 10.0.0.2"), true), "203.0.113.5");
  const security = createRequestSecurity({ now: () => 1 });
  for (let index = 0; index < 10; index += 1) assert.equal(security.allowAuth(request(), "/api/auth/sign-in/email"), true);
  assert.equal(security.allowAuth(request(), "/api/auth/sign-in/email"), false);
});

test("authenticated API limits are per user and parsing is single-flight", () => {
  const security = createRequestSecurity({ now: () => 1 });
  for (let index = 0; index < 10; index += 1) assert.equal(security.allowApi("user-a", "/api/parse-excel"), true);
  assert.equal(security.allowApi("user-a", "/api/parse-excel"), false);
  assert.equal(security.allowApi("user-b", "/api/parse-excel"), true);
  const release = security.acquire("user-a", "/api/parse-excel");
  assert.equal(typeof release, "function");
  assert.equal(security.acquire("user-a", "/api/parse-excel"), null);
  release();
  assert.equal(typeof security.acquire("user-a", "/api/parse-excel"), "function");
});

test("auth rate-limit eligibility rejects unsafe POST requests without counting exempt methods", () => {
  const origins = ["https://app.example.test"];
  const path = "/api/auth/sign-in/email";
  assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ method: "OPTIONS" }), path, origins), {
    shouldCount: false, rejection: null,
  });
  assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ method: "GET" }), path, origins), {
    shouldCount: false, rejection: null,
  });
  assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ origin: "https://sibling.example.test" }), path, origins), {
    shouldCount: false, rejection: { status: 403, error: "origin_not_allowed" },
  });
  assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ site: "cross-site" }), path, origins), {
    shouldCount: false, rejection: { status: 403, error: "origin_not_allowed" },
  });
  assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ origin: origins[0], contentType: "text/plain" }), path, origins), {
    shouldCount: false, rejection: { status: 415, error: "unsupported_media_type" },
  });
  assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ origin: origins[0], contentType: null }), path, origins), {
    shouldCount: false, rejection: { status: 415, error: "unsupported_media_type" },
  });
  assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ origin: origins[0] }), path, origins), {
    shouldCount: true, rejection: null,
  });
});

test("every protected auth route counts only a valid JSON POST", () => {
  const origin = "https://app.example.test";
  for (const path of AUTH_RATE_LIMIT_PATHS) {
    assert.equal(inspectAuthRateLimitRequest(authRequest({ method: "OPTIONS" }), path, [origin]).shouldCount, false);
    assert.equal(inspectAuthRateLimitRequest(authRequest({ method: "PUT" }), path, [origin]).shouldCount, false);
    assert.deepEqual(inspectAuthRateLimitRequest(authRequest({ origin }), path, [origin]), {
      shouldCount: true,
      rejection: null,
    });
  }
});

test("auth rate-limit windows expose a stable Retry-After boundary", () => {
  let now = 0;
  const security = createRequestSecurity({ now: () => now });
  const path = "/api/auth/sign-in/email";
  for (let index = 0; index < 10; index += 1) {
    assert.deepEqual(security.consumeAuth(request(), path), { allowed: true, retryAfterSeconds: null });
  }
  assert.deepEqual(security.consumeAuth(request(), path), { allowed: false, retryAfterSeconds: 900 });
  now = 60_001;
  assert.deepEqual(security.consumeAuth(request(), path), { allowed: false, retryAfterSeconds: 840 });
  now = 900_000;
  assert.deepEqual(security.consumeAuth(request(), path), { allowed: true, retryAfterSeconds: null });
});

test("Better Auth custom rules exempt the same invalid requests without changing valid limits", () => {
  const origin = "https://app.example.test";
  const rule = createBetterAuthRateLimitCustomRules([origin])["/sign-in/email"];
  const current = { window: 10, max: 3 };
  assert.equal(rule(new Request(`${origin}/api/auth/sign-in/email`, { method: "OPTIONS" }), current), false);
  assert.equal(rule(new Request(`${origin}/api/auth/sign-in/email`, { method: "GET" }), current), false);
  assert.equal(rule(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { origin: "https://sibling.example.test", "content-type": "application/json" }, body: "{}",
  }), current), false);
  assert.equal(rule(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { origin, "content-type": "text/plain" }, body: "{}",
  }), current), false);
  assert.equal(rule(new Request(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}",
  }), current), current);
});
