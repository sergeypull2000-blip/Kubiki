import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createBackendServer } from "../server/app.js";
import { createOwnerApiRepository } from "../server/repositories/ownerApiRepository.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PNG = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);

async function serverFor({ userId = USER_A, repository = {}, storage = {}, authenticated = true } = {}) {
  const logger = { errors: [], error(...args) { this.errors.push(args); } };
  const server = createBackendServer({
    pool: { query: async () => ({ rows: [] }) },
    bodyLimitBytes: 600_000,
    readinessTimeoutMillis: 20,
    authenticate: async () => authenticated ? { user: { id: userId } } : null,
    ownerApi: repository,
    objectStorage: storage,
    logger,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, logger, url: `http://127.0.0.1:${server.address().port}` };
}

const logoForm = (bytes = PNG, type = "image/png") => {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type }), "logo.png");
  return form;
};

test("all logo routes require an authenticated internal user", async (t) => {
  const x = await serverFor({ authenticated: false });
  t.after(() => x.server.close());
  for (const [method, path, body] of [
    ["POST", "/api/export-profile/logo", logoForm()],
    ["GET", "/api/export-profile/logo-url?path=x"],
    ["DELETE", "/api/export-profile/logo"],
  ]) {
    const response = await fetch(x.url + path, { method, body });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "authentication_required" });
  }
});

test("valid upload uses an authoritative private key and updates the owner reference", async (t) => {
  const calls = [];
  const repository = { replaceLogoPath: async (userId, path) => (calls.push(["db", userId, path]), null) };
  const storage = { put: async (...args) => calls.push(["put", ...args]), delete: async () => {} };
  const x = await serverFor({ repository, storage });
  t.after(() => x.server.close());
  const response = await fetch(x.url + "/api/export-profile/logo", { method: "POST", body: logoForm() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.path, new RegExp(`^users/${USER_A}/export-logos/[0-9a-f-]+\\.png$`));
  assert.equal(calls[0][0], "put");
  assert.equal(calls[0][1], body.path);
  assert.equal(calls[0][3], "image/png");
  assert.deepEqual(calls[1], ["db", USER_A, body.path]);
  assert.deepEqual(Object.keys(body), ["path"]);
});

test("invalid declared or actual MIME and files over 2 MiB are rejected before S3", async (t) => {
  let puts = 0;
  const x = await serverFor({
    repository: {},
    storage: { put: async () => { puts += 1; } },
  });
  t.after(() => x.server.close());
  for (const form of [logoForm(PNG, "image/gif"), logoForm(Buffer.from("not a png"), "image/png")]) {
    const response = await fetch(x.url + "/api/export-profile/logo", { method: "POST", body: form });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_logo_type" });
  }
  const tooLarge = Buffer.alloc(2 * 1024 * 1024 + 1);
  PNG.copy(tooLarge);
  const response = await fetch(x.url + "/api/export-profile/logo", { method: "POST", body: logoForm(tooLarge) });
  assert.equal(response.status, 413);
  assert.equal(puts, 0);
});

test("signed URLs require the exact owner-scoped DB reference and reject spoofed prefixes", async (t) => {
  const owned = `users/${USER_A}/export-logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
  let signs = 0;
  const x = await serverFor({
    repository: { getLogoPath: async () => owned },
    storage: { signedGetUrl: async () => (signs += 1, "https://signed.invalid/object?token=secret") },
  });
  t.after(() => x.server.close());
  const valid = await fetch(`${x.url}/api/export-profile/logo-url?path=${encodeURIComponent(owned)}`);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { signedUrl: "https://signed.invalid/object?token=secret" });
  for (const path of [
    `users/${USER_B}/export-logos/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`,
    `${USER_A}/logo.png`,
    `users/${USER_A}/export-logos/../foreign.png`,
    `users/${USER_A}/export-logos/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png`,
  ]) {
    const response = await fetch(`${x.url}/api/export-profile/logo-url?path=${encodeURIComponent(path)}`);
    assert.equal(response.status, 404, path);
  }
  assert.equal(signs, 1);
});

test("failed S3 uploads and replacement failures preserve the existing DB logo", async (t) => {
  let replacements = 0;
  const repository = { replaceLogoPath: async () => { replacements += 1; return "old"; } };
  const x = await serverFor({ repository, storage: { put: async () => { throw new Error("S3 unavailable"); } } });
  t.after(() => x.server.close());
  const response = await fetch(x.url + "/api/export-profile/logo", { method: "POST", body: logoForm() });
  assert.equal(response.status, 500);
  assert.equal(replacements, 0);
});

test("a failed DB replacement cleans the new object and never deletes the old one", async (t) => {
  const deleted = [];
  const x = await serverFor({
    repository: { replaceLogoPath: async () => { throw new Error("DB unavailable"); } },
    storage: { put: async () => {}, delete: async (path) => deleted.push(path) },
  });
  t.after(() => x.server.close());
  const response = await fetch(x.url + "/api/export-profile/logo", { method: "POST", body: logoForm() });
  assert.equal(response.status, 500);
  assert.equal(deleted.length, 1);
  assert.match(deleted[0], new RegExp(`^users/${USER_A}/`));
});

test("replacement removes the obsolete object only after the DB switch", async (t) => {
  const oldPath = `users/${USER_A}/export-logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
  const order = [];
  const x = await serverFor({
    repository: { replaceLogoPath: async () => (order.push("db"), oldPath) },
    storage: { put: async () => order.push("put"), delete: async (path) => order.push(`delete:${path}`) },
  });
  t.after(() => x.server.close());
  const response = await fetch(x.url + "/api/export-profile/logo", { method: "POST", body: logoForm() });
  assert.equal(response.status, 200);
  assert.deepEqual(order, ["put", "db", `delete:${oldPath}`]);
});

test("delete clears only the authenticated owner's reference before object cleanup", async (t) => {
  const owned = `users/${USER_A}/export-logos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
  const order = [];
  const x = await serverFor({
    repository: { clearLogoPath: async (userId) => (order.push(`clear:${userId}`), owned) },
    storage: { delete: async (path) => order.push(`delete:${path}`) },
  });
  t.after(() => x.server.close());
  const response = await fetch(`${x.url}/api/export-profile/logo?path=${encodeURIComponent(`users/${USER_B}/export-logos/foreign.png`)}`, { method: "DELETE" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(order, [`clear:${USER_A}`, `delete:${owned}`]);
});

test("logo repository SQL locks and mutates only the correct owner reference", async () => {
  const log = [];
  const client = {
    query: async (sql, values) => {
      log.push({ sql, values });
      if (sql.startsWith("select logo_asset_path")) return { rows: [{ logo_asset_path: "owned-key" }] };
      return { rows: [] };
    },
    release() {},
  };
  const repo = createOwnerApiRepository({ connect: async () => client, query: client.query });
  assert.equal(await repo.clearLogoPath(USER_A), "owned-key");
  assert.ok(log.every(({ values }) => !values || values[0] === USER_A));
  assert.match(log.find(({ sql }) => sql.startsWith("select")).sql, /for update/);
  assert.match(log.find(({ sql }) => sql.startsWith("update")).sql, /user_id=\$1 and logo_asset_path=\$2/);
});

test("general export-profile writes cannot replace the server-managed logo path", async (t) => {
  let received;
  const x = await serverFor({ repository: { upsertExportProfile: async (_userId, profile) => (received = profile, profile) } });
  t.after(() => x.server.close());
  const response = await fetch(x.url + "/api/export-profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyName: "Studio", logoAssetPath: `users/${USER_B}/export-logos/foreign.png` }),
  });
  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(received, "logo_asset_path"), false);
});
