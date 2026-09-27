import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackendServer, INLINE_BOOTSTRAP_SCRIPT_CSP_HASH } from "../server/app.js";

const CSP_ASSET_ORIGIN = "https://assets.example.test";
const EXPECTED_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "media-src 'none'",
  "form-action 'self'",
  `script-src 'self' '${INLINE_BOOTSTRAP_SCRIPT_CSP_HASH}'`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' ${CSP_ASSET_ORIGIN}`,
  `connect-src 'self' ${CSP_ASSET_ORIGIN}`,
  "worker-src 'self'",
  "manifest-src 'self'",
].join("; ") + ";";

function assertSecurityHeaders(response, { production = false } = {}) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("content-security-policy"), EXPECTED_CSP);
  assert.equal(response.headers.get("content-security-policy-report-only"), null);
  assert.equal(response.headers.get("cross-origin-embedder-policy"), null);
  assert.equal(response.headers.get("strict-transport-security"), production ? "max-age=31536000" : null);
}

async function listen(pool, overrides = {}) {
  const server = createBackendServer({
    pool,
    bodyLimitBytes: 16,
    readinessTimeoutMillis: 20,
    cspAssetOrigin: CSP_ASSET_ORIGIN,
    ...overrides,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("health endpoint has no database dependency", async (t) => {
  const { server, baseUrl } = await listen({ query: () => assert.fail("DB queried") });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assertSecurityHeaders(response);
});

test("HSTS is emitted only by a production server", async (t) => {
  const production = await listen({ query: async () => ({ rows: [] }) }, { production: true });
  t.after(() => production.server.close());
  const response = await fetch(`${production.baseUrl}/healthz`);
  assertSecurityHeaders(response, { production: true });
});

test("CSP script hash matches the real inline bootstrap", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  assert.equal(inlineScripts.length, 1);
  const actual = `sha256-${createHash("sha256").update(inlineScripts[0], "utf8").digest("base64")}`;
  assert.equal(actual, INLINE_BOOTSTRAP_SCRIPT_CSP_HASH);
});

test("request security rejects limited auth and API requests before expensive work", async (t) => {
  const requestSecurity = {
    consumeAuth: () => ({ allowed: false, retryAfterSeconds: 37 }),
    allowApi: () => false,
    acquire: () => assert.fail("concurrency must not be acquired after a rate rejection"),
  };
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, {
    requestSecurity,
    authHandler: () => assert.fail("auth handler must not run"),
    authenticate: async () => ({ user: { id: "current-user" } }),
    serverData: {},
  });
  t.after(() => server.close());
  const authResponse = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.equal(authResponse.status, 429);
  assert.equal(authResponse.headers.get("retry-after"), "37");
  assert.deepEqual(await authResponse.json(), { error: "too_many_requests" });
  const apiResponse = await fetch(`${baseUrl}/api/extract-doc`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(apiResponse.status, 429);
});

test("document parsing rejects a concurrent request before reading its body", async (t) => {
  const requestSecurity = { allowAuth: () => true, allowApi: () => true, acquire: () => null };
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, {
    requestSecurity,
    authenticate: async () => ({ user: { id: "current-user" } }),
    serverData: {},
  });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/extract-doc`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "request_in_progress" });
});

test("readiness reports PostgreSQL success and bounded failure without details", async (t) => {
  const ready = await listen({ query: async (sql) => assert.equal(sql, "select 1 as ready") });
  t.after(() => ready.server.close());
  assert.equal((await fetch(`${ready.baseUrl}/readyz`)).status, 200);

  const unavailable = await listen({ query: async () => new Promise(() => {}) });
  t.after(() => unavailable.server.close());
  const response = await fetch(`${unavailable.baseUrl}/readyz`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

test("server makes body limit explicit and closes gracefully", async () => {
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) });
  const response = await fetch(`${baseUrl}/unknown`, { method: "POST", body: "this body is definitely too large" });
  assert.equal(response.status, 413);
  assertSecurityHeaders(response);
  server.close();
  await once(server, "close");
  assert.equal(server.listening, false);
});

test("standalone API rejects an unauthenticated request with 401", async (t) => {
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, {
    authenticate: async () => null,
    serverData: {},
  });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/usage`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
});

test("AI mutations reject an untrusted sibling origin before authentication", async (t) => {
  let authenticated = false;
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, {
    trustedOrigins: ["https://app.example.test"],
    authenticate: async () => { authenticated = true; return { user: { id: "current-user" } }; },
    serverData: {},
  });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/generate-estimate`, {
    method: "POST",
    headers: { origin: "https://evil.example.test", "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
  assert.equal(authenticated, false);
  const wrongType = await fetch(`${baseUrl}/api/generate-estimate`, {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(wrongType.status, 415);
  assert.deepEqual(await wrongType.json(), { error: "unsupported_media_type" });
  assert.equal(authenticated, false);
});

test("auth prechecks reject unsafe POST requests and do not charge exempt methods", async (t) => {
  const delegated = [];
  let consumed = 0;
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, {
    trustedOrigins: ["https://app.example.test"],
    requestSecurity: {
      consumeAuth: () => { consumed += 1; return { allowed: true, retryAfterSeconds: null }; },
    },
    authHandler: async (request, response) => {
      delegated.push(request.method);
      response.writeHead(204);
      response.end();
    },
  });
  t.after(() => server.close());

  const options = await fetch(`${baseUrl}/api/auth/sign-in/email`, { method: "OPTIONS" });
  assert.equal(options.status, 204);
  const wrongMethod = await fetch(`${baseUrl}/api/auth/sign-in/email`);
  assert.equal(wrongMethod.status, 204);
  assert.equal(consumed, 0);

  const wrongOrigin = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { origin: "https://sibling.example.test", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(wrongOrigin.status, 403);
  assert.deepEqual(await wrongOrigin.json(), { error: "origin_not_allowed" });
  const wrongType = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(wrongType.status, 415);
  assert.deepEqual(await wrongType.json(), { error: "unsupported_media_type" });
  const crossSite = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(crossSite.status, 403);
  assert.equal(consumed, 0);
  assert.deepEqual(delegated, ["OPTIONS", "GET"]);

  const valid = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { origin: "https://app.example.test", "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(valid.status, 204);
  assertSecurityHeaders(valid);
  assert.equal(consumed, 1);
  assert.deepEqual(delegated, ["OPTIONS", "GET", "POST"]);
});

test("all AI APIs require the current disclosure before invoking an AI handler", async (t) => {
  const checks = [];
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, {
    authenticate: async () => ({ user: { id: "current-user" } }),
    serverData: {
      hasLegalAcceptance: async (...args) => { checks.push(args); return false; },
    },
  });
  t.after(() => server.close());
  for (const path of ["/api/generate-estimate", "/api/edit-estimate", "/api/parse-excel"]) {
    const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 428);
    assert.deepEqual(await response.json(), { error: "ai_disclosure_required", documentKey: "ai_disclosure", version: "1.0" });
  }
  assert.deepEqual(checks, Array.from({ length: 3 }, () => ["current-user", "ai_disclosure", "1.0"]));
});

async function frontendFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "kubiki-frontend-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<!doctype html><main>Kubiki UI</main>");
  await writeFile(join(root, "assets", "index-AbCd1234.js"), "globalThis.kubiki = true;");
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("production server serves the frontend root and SPA routes", async (t) => {
  const frontendDistPath = await frontendFixture(t);
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, { frontendDistPath });
  t.after(() => server.close());
  for (const path of ["/", "/projects/example", "/privacy", "/personal-data-consent", "/terms"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assertSecurityHeaders(response);
    assert.match(await response.text(), /Kubiki UI/);
  }
});

test("production server serves typed, immutable Vite assets", async (t) => {
  const frontendDistPath = await frontendFixture(t);
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, { frontendDistPath });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/assets/index-AbCd1234.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/javascript/);
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assertSecurityHeaders(response);
  assert.equal(await response.text(), "globalThis.kubiki = true;");
});

test("unknown API routes remain JSON 404 responses", async (t) => {
  const frontendDistPath = await frontendFixture(t);
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, { frontendDistPath });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assertSecurityHeaders(response);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("static path traversal is blocked", async (t) => {
  const frontendDistPath = await frontendFixture(t);
  const { server } = await listen({ query: async () => ({ rows: [] }) }, { frontendDistPath });
  t.after(() => server.close());
  const { port } = server.address();
  const response = await new Promise((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path: "/assets/%2e%2e/index.html" }, resolve);
    request.on("error", reject);
    request.end();
  });
  response.resume();
  assert.equal(response.statusCode, 400);
  assert.match(response.headers["content-type"], /^application\/json/);
});
