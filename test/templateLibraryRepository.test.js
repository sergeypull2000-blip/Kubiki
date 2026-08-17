import test from "node:test";
import assert from "node:assert/strict";
import { createTemplateLibraryRepository } from "../src/repositories/templateLibraryRepository.js";

const serverRow = (userId = "u1") => ({ user_id: userId, data_version: 1, library_data: { dataVersion: 1, projectTemplates: [], stageTemplates: [], taskTemplates: [], categories: [], metadata: {} } });

function makeClient(respond) {
  const calls = { select: 0, refresh: 0 };
  const client = {
    auth: { refreshSession: async () => { calls.refresh += 1; return { data: { session: {} }, error: null }; } },
    from(table) {
      assert.equal(table, "template_libraries");
      const builder = {
        select() { return builder; },
        eq(column, _value) { assert.equal(column, "user_id"); return builder; },
        async maybeSingle() { calls.select += 1; return respond(calls.select); },
      };
      return builder;
    },
  };
  return { client, calls };
}

test("loadTemplateLibrary refreshes the session once and retries once on a transient JWT issued-at-future error", async () => {
  const { client, calls } = makeClient((attempt) => attempt === 1
    ? { data: null, error: { message: "JWT issued at future", code: "PGRST303" } }
    : { data: serverRow(), error: null });
  const repository = createTemplateLibraryRepository(client, { retryDelayMs: 0 });
  const result = await repository.loadTemplateLibrary("u1");
  assert.equal(result.exists, true);
  assert.deepEqual(result.library.projectTemplates, []);
  assert.equal(calls.select, 2);
  assert.equal(calls.refresh, 1);
});

test("loadTemplateLibrary also recovers when the transient error is matched by message without a PGRST303 code", async () => {
  const { client, calls } = makeClient((attempt) => attempt === 1
    ? { data: null, error: { message: "JWT issued at future" } }
    : { data: serverRow(), error: null });
  const repository = createTemplateLibraryRepository(client, { retryDelayMs: 0 });
  const result = await repository.loadTemplateLibrary("u1");
  assert.equal(result.exists, true);
  assert.equal(calls.select, 2);
  assert.equal(calls.refresh, 1);
});

test("loadTemplateLibrary surfaces the current error when the retry also fails with JWT issued-at-future", async () => {
  const { client, calls } = makeClient(() => ({ data: null, error: { message: "JWT issued at future", code: "PGRST303" } }));
  const repository = createTemplateLibraryRepository(client, { retryDelayMs: 0 });
  await assert.rejects(
    () => repository.loadTemplateLibrary("u1"),
    (error) => error.message.includes("JWT issued at future") && error.cause?.code === "PGRST303",
  );
  assert.equal(calls.select, 2);
  assert.equal(calls.refresh, 1);
});

test("loadTemplateLibrary keeps the current single-attempt behavior for other errors", async () => {
  const { client, calls } = makeClient(() => ({ data: null, error: { message: "permission denied for table template_libraries", code: "42501" } }));
  const repository = createTemplateLibraryRepository(client, { retryDelayMs: 0 });
  await assert.rejects(
    () => repository.loadTemplateLibrary("u1"),
    (error) => error.message.includes("permission denied") && error.cause?.code === "42501",
  );
  assert.equal(calls.select, 1);
  assert.equal(calls.refresh, 0);
});

test("loadTemplateLibrary still retries and recovers when refreshSession itself throws", async () => {
  const { client, calls } = makeClient((attempt) => attempt === 1
    ? { data: null, error: { message: "JWT issued at future", code: "PGRST303" } }
    : { data: serverRow(), error: null });
  client.auth.refreshSession = async () => { calls.refresh += 1; throw new Error("Failed to fetch"); };
  const repository = createTemplateLibraryRepository(client, { retryDelayMs: 0 });
  const result = await repository.loadTemplateLibrary("u1");
  assert.equal(result.exists, true);
  assert.equal(calls.select, 2);
  assert.equal(calls.refresh, 1);
});

test("loadTemplateLibrary surfaces the standard load error, not the refresh error, when refreshSession throws and the retry also fails", async () => {
  const { client, calls } = makeClient(() => ({ data: null, error: { message: "JWT issued at future", code: "PGRST303" } }));
  client.auth.refreshSession = async () => { calls.refresh += 1; throw new Error("Failed to fetch"); };
  const repository = createTemplateLibraryRepository(client, { retryDelayMs: 0 });
  await assert.rejects(
    () => repository.loadTemplateLibrary("u1"),
    (error) => error.message.includes("JWT issued at future") && error.cause?.code === "PGRST303" && !error.message.includes("Failed to fetch"),
  );
  assert.equal(calls.select, 2);
  assert.equal(calls.refresh, 1);
});
