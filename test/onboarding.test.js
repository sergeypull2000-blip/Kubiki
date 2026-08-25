import assert from "node:assert/strict";
import test from "node:test";
import { hasSeenOnboarding, isGenuinelyNewUser, markOnboardingSeen, onboardingSeenKey } from "../src/onboarding.js";
import { readFile } from "node:fs/promises";

const memoryStorage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

test("onboarding completion is scoped per user", () => {
  const storage = memoryStorage();
  assert.equal(hasSeenOnboarding("fresh", storage), false);
  markOnboardingSeen("fresh", storage);
  assert.equal(hasSeenOnboarding("fresh", storage), true);
  assert.equal(hasSeenOnboarding("other", storage), false);
  assert.notEqual(onboardingSeenKey("fresh"), onboardingSeenKey("other"));
});

test("only a recently created account repairs a missing Beta flag", () => {
  const now = Date.parse("2026-08-25T12:00:00Z");
  assert.equal(isGenuinelyNewUser({ created_at: "2026-08-25T11:55:00Z" }, now), true);
  assert.equal(isGenuinelyNewUser({ created_at: "2026-08-24T11:55:00Z" }, now), false);
  assert.equal(isGenuinelyNewUser({}, now), false);
});

test("fresh flow chains Beta to onboarding while manual help never opens Beta", async () => {
  const source = await readFile(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  assert.match(source, /handleWelcomeStart[\s\S]*setWelcomeOpen\(false\)[\s\S]*setOnboardingOpen\(true\)[\s\S]*markBetaWelcomeSeen/);
  assert.match(source, /onOpenHelp=\{\(\) => setOnboardingOpen\(true\)\}/);
  assert.doesNotMatch(source, /onOpenHelp=\{[^}]*setWelcomeOpen/);
});
