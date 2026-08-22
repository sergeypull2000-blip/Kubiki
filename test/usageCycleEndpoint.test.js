import test from "node:test";
import assert from "node:assert/strict";
import usageHandler from "../api/usage.js";

function response() {
  return {
    statusCode: null, body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test("usage endpoint represents a user without a cycle without inventing reset date", async () => {
  const serverData = {
    loadEffectiveLimit: async () => ({ limitUsd: 5, unlimited: false }),
    loadUsageCycle: async () => ({ cycle: null, spentUsd: 0 }),
  };
  const res = response();
  await usageHandler({ method: "GET", authContext: { user: { id: "user-a" } }, serverData }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.cycleActive, false);
  assert.equal(res.body.resetsAt, null);
  assert.equal(res.body.spentUsd, 0);
  assert.equal(res.body.remainingPct, 100);
});

test("usage endpoint returns the active cycle reset timestamp", async () => {
  const resetsAt = "2026-09-22T14:37:00.000Z";
  const serverData = {
    loadEffectiveLimit: async () => ({ limitUsd: 5, unlimited: false }),
    loadUsageCycle: async () => ({ cycle: { startsAt: "2026-08-22T14:37:00.000Z", resetsAt }, spentUsd: 1.25 }),
  };
  const res = response();
  await usageHandler({ method: "GET", authContext: { user: { id: "user-a" } }, serverData }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.cycleActive, true);
  assert.equal(res.body.resetsAt, resetsAt);
  assert.equal(res.body.remainingPct, 75);
});
