import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
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
