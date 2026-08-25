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
  assert.match(source, /flags\.beta_welcome_seen === false && isGenuinelyNewUser\(user\)/);
  assert.match(source, /handleWelcomeStart[\s\S]*setWelcomeOpen\(false\)[\s\S]*setOnboardingOpen\(true\)[\s\S]*markBetaWelcomeSeen/);
  assert.match(source, /onOpenHelp=\{\(\) => setOnboardingOpen\(true\)\}/);
  assert.doesNotMatch(source, /onOpenHelp=\{[^}]*setWelcomeOpen/);
});

test("returning users do not trigger either onboarding modal automatically", async () => {
  const source = await readFile(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  assert.match(source, /const \[welcomeOpen, setWelcomeOpen\] = useState\(false\)/);
  assert.match(source, /const \[onboardingOpen, setOnboardingOpen\] = useState\(false\)/);
  assert.doesNotMatch(source, /setOnboardingOpen\(true\)[\s\S]{0,300}isGenuinelyNewUser/);
});

test("onboarding uses a plain vertical guide without cards or shortcuts", async () => {
  const source = await readFile(new URL("../src/components/OnboardingModal.jsx", import.meta.url), "utf8");
  assert.match(source, /Память вашей студии/);
  assert.match(source, /Настройки → Персонализация ИИ/);
  assert.match(source, />Начать работу<\/button>/);
  assert.doesNotMatch(source, /kb-onboarding-grid|kb-onboarding-shortcuts|<kbd>/);
});
