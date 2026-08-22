import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackendServer } from "../server/app.js";

async function listen(pool, overrides = {}) {
  const server = createBackendServer({
    pool,
    bodyLimitBytes: 16,
    readinessTimeoutMillis: 20,
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
  for (const path of ["/", "/projects/example"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
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
  assert.equal(await response.text(), "globalThis.kubiki = true;");
});

test("unknown API routes remain JSON 404 responses", async (t) => {
  const frontendDistPath = await frontendFixture(t);
  const { server, baseUrl } = await listen({ query: async () => ({ rows: [] }) }, { frontendDistPath });
  t.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /^application\/json/);
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
