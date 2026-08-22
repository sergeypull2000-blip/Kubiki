import test from "node:test";
import assert from "node:assert/strict";
import { createKubikiApiTransport, KubikiApiError, resolveKubikiApiBaseUrl } from "../src/backend/apiTransport.js";
import { createHttpRepositories } from "../src/backend/httpRepositories.js";
import { createHttpLogoRepository } from "../src/backend/logoRepository.js";
import { createSessionGateway } from "../src/backend/betterAuthClient.js";
import { cleanupLegacySupabaseOwnerMarkers, CLEANUP_KEY, LEGACY_OWNER_KEYS } from "../src/backend/legacyCleanup.js";
import { describeAuthError } from "../src/authErrors.js";

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("API transport resolves a configurable base URL and always includes credentials", async () => {
  const calls = [];
  const request = createKubikiApiTransport({ baseUrl: "https://backend.example/", fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, { ok: true });
  } });
  assert.equal(resolveKubikiApiBaseUrl("https://backend.example///"), "https://backend.example");
  assert.deepEqual(await request("/api/projects", { method: "POST", credentials: "omit", json: { id: "p1" } }), { ok: true });
  assert.equal(calls[0].url, "https://backend.example/api/projects");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers.get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), { id: "p1" });
});

test("API transport maps 401, 404, and 409 and preserves AbortError", async () => {
  for (const [status, code] of [[401, "authentication_required"], [404, "not_found"], [409, "unique_conflict"]]) {
    const request = createKubikiApiTransport({ fetchImpl: async () => jsonResponse(status, { error: code }) });
    await assert.rejects(request("/api/test"), (error) => error instanceof KubikiApiError && error.status === status && error.code === code);
  }
  const abort = new DOMException("cancelled", "AbortError");
  const request = createKubikiApiTransport({ fetchImpl: async () => { throw abort; } });
  await assert.rejects(request("/api/test", { signal: AbortSignal.abort() }), (error) => error === abort);
});

test("HTTP repository adapters omit ownership and preserve batch DTOs", async () => {
  const calls = [];
  const repositories = createHttpRepositories(async (path, options = {}) => {
    calls.push({ path, options });
    if (path === "/api/projects/batch") return options.json.items;
    if (path === "/api/quick-access-items/batch") return { items: options.json.items };
    return { ok: true };
  });
  const project = { id: "p1", name: "Project" };
  assert.deepEqual(await repositories.projects.upsertProject("auth-owner-must-not-leak", project), project);
  assert.deepEqual(await repositories.projects.upsertProjects("auth-owner-must-not-leak", [project]), [project]);
  assert.deepEqual(await repositories.quickAccess.upsertQuickAccessItems("auth-owner-must-not-leak", [{ id: "q1", performerId: "e1" }]), { items: [{ id: "q1", performerId: "e1" }] });
  for (const call of calls) {
    const serialized = JSON.stringify(call.options.json);
    assert.equal(serialized.includes("auth-owner-must-not-leak"), false);
    assert.equal(serialized.includes("userId"), false);
    assert.equal(serialized.includes("user_id"), false);
  }
  assert.deepEqual(calls[1], { path: "/api/projects/batch", options: { method: "POST", json: { items: [project] } } });
});

test("all prepared repository families target the owner-scoped API", async () => {
  const calls = [];
  const repositories = createHttpRepositories(async (path, options = {}) => { calls.push([path, options.method || "GET"]); return path === "/api/user-flags" ? { betaWelcomeSeen: false } : { ok: true }; });
  await repositories.projects.listProjects("ignored");
  await repositories.performers.listPerformers("ignored");
  await repositories.quickAccess.listQuickAccessItems("ignored", []);
  await repositories.templateLibrary.loadTemplateLibrary("ignored");
  await repositories.aiSettings.loadAiSettings("ignored");
  await repositories.exportProfile.loadProfile("ignored");
  await repositories.exportPresets.list("ignored");
  await repositories.productEvents.track("ignored", "ai_edit", { requestId: "r1" }, {});
  await repositories.userFlags.getFlags("ignored");
  await repositories.betaFeedback.insert({ userId: "auth-owner-must-not-leak", message: "ok" });
  await repositories.usage.load();
  assert.deepEqual(calls.map(([path]) => path), [
    "/api/projects", "/api/performers", "/api/quick-access-items", "/api/template-library", "/api/ai-settings",
    "/api/export-profile", "/api/export-presets", "/api/product-events", "/api/user-flags", "/api/beta-feedback", "/api/usage",
  ]);
  assert.equal(JSON.stringify(calls).includes("auth-owner-must-not-leak"), false);
});

test("logo adapter uses authoritative multipart upload, signed URL, and pathless delete", async () => {
  const calls = [];
  const repository = createHttpLogoRepository(async (path, options = {}) => {
    calls.push({ path, options });
    if (options.method === "POST") return { path: "users/u/export-logos/new.png" };
    if (path.startsWith("/api/export-profile/logo-url")) return { signedUrl: "https://s3.example/signed" };
    return { ok: true };
  });
  const file = new Blob(["png"], { type: "image/png" });
  assert.equal(await repository.uploadLogo("owner-not-sent", file), "users/u/export-logos/new.png");
  assert.equal(await repository.createLogoUrl("users/u/export-logos/new logo.png", 3600), "https://s3.example/signed");
  assert.equal(await repository.removeLogo("ignored-old-path"), true);
  assert.equal(calls[0].options.body instanceof FormData, true);
  assert.equal(calls[0].options.body.get("file").size, file.size);
  assert.equal(calls[0].options.body.get("file").type, file.type);
  assert.equal(calls[1].path, "/api/export-profile/logo-url?path=users%2Fu%2Fexport-logos%2Fnew%20logo.png");
  assert.deepEqual(calls[2], { path: "/api/export-profile/logo", options: { method: "DELETE" } });
  assert.equal(JSON.stringify(calls).includes("owner-not-sent"), false);
  assert.equal(JSON.stringify(calls).includes("ignored-old-path"), false);
});

test("session gateway delegates to the prepared Better Auth client without activating it", async () => {
  const calls = [];
  const client = {
    getSession: async () => ({ data: { user: { id: "u1" } } }), useSession: () => ({ data: null, isPending: true }),
    signIn: { email: async (value) => (calls.push(["signIn", value]), { data: {} }) },
    signUp: { email: async (value) => (calls.push(["signUp", value]), { data: {} }) },
    signOut: async () => (calls.push(["signOut"]), { data: {} }),
    requestPasswordReset: async (value) => (calls.push(["requestPasswordReset", value]), { data: {} }),
    resetPassword: async (value) => (calls.push(["resetPassword", value]), { data: {} }),
    sendVerificationEmail: async (value) => (calls.push(["sendVerificationEmail", value]), { data: {} }),
  };
  const session = createSessionGateway(client);
  assert.equal((await session.getSession()).data.user.id, "u1");
  assert.equal(session.useSession().isPending, true);
  await session.signIn("a@example.com", "secret");
  await session.signUp("b@example.com", "secret", "B");
  await session.signOut();
  await session.requestPasswordReset("a@example.com", "https://app.example/reset");
  await session.resetPassword("new-secret", "token");
  await session.sendVerificationEmail("a@example.com");
  assert.deepEqual(calls.map(([name]) => name), ["signIn", "signUp", "signOut", "requestPasswordReset", "resetPassword", "sendVerificationEmail"]);
});

test("auth errors are always localized and never expose Better Auth details", () => {
  assert.equal(describeAuthError({ message: "Invalid email or password" }), "Неверный email или пароль");
  assert.equal(describeAuthError({ code: "EMAIL_NOT_VERIFIED" }), "EMAIL_NOT_VERIFIED");
  assert.equal(describeAuthError({ message: "User already exists" }), "Пользователь с таким email уже зарегистрирован");
  assert.equal(describeAuthError({ message: "password too short" }), "Пароль не соответствует требованиям");
  assert.equal(describeAuthError({ message: "too many requests" }), "Слишком много попыток. Попробуйте немного позже.");
  assert.equal(describeAuthError({ message: "SQLSTATE 42P01 secret internal code" }), "Что-то пошло не так. Попробуйте ещё раз.");
});

test("legacy Supabase owner markers are neutralized exactly once without touching local data", () => {
  const values = new Map([["kubiki_state_v1", "project-data"], ...LEGACY_OWNER_KEYS.map((key) => [key, "old-supabase-uuid"])]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  assert.equal(cleanupLegacySupabaseOwnerMarkers(storage), true);
  assert.equal(values.get("kubiki_state_v1"), "project-data");
  assert.equal(values.get(CLEANUP_KEY), "1");
  assert.equal(LEGACY_OWNER_KEYS.every((key) => !values.has(key)), true);
  assert.equal(cleanupLegacySupabaseOwnerMarkers(storage), false);
});
