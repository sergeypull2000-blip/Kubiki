import test from "node:test";
import assert from "node:assert/strict";
import { createRequestSecurity, requestIp } from "../server/requestSecurity.js";

const request = (forwarded = "203.0.113.5") => ({ headers: { "x-forwarded-for": forwarded }, socket: { remoteAddress: "127.0.0.1" } });

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

