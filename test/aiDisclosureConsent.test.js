import assert from "node:assert/strict";
import test from "node:test";
import { saveAiDisclosureConsents } from "../src/components/aiDisclosureConsent.js";

const versions = { ai_disclosure: "1.0", ai_improvement_consent: "1.0" };
const repositoryFor = (behavior = {}) => ({
  calls: [],
  async accept(userId, documentKey, version) {
    this.calls.push([userId, documentKey, version]);
    if (behavior[documentKey]) throw new Error(behavior[documentKey]);
  },
});

test("unchecked saves disclosure and never touches improvement consent", async () => {
  const repository = repositoryFor();
  await saveAiDisclosureConsents({ repository, userId: "u", versions, improvementConsent: false });
  assert.deepEqual(repository.calls, [["u", "ai_disclosure", "1.0"]]);
});

test("checked saves both consents", async () => {
  const repository = repositoryFor();
  await saveAiDisclosureConsents({ repository, userId: "u", versions, improvementConsent: true });
  assert.deepEqual(repository.calls, [["u", "ai_disclosure", "1.0"], ["u", "ai_improvement_consent", "1.0"]]);
});

test("optional consent failure does not block AI and leaves improvement consent off", async () => {
  const repository = repositoryFor({ ai_improvement_consent: "optional failed" });
  const result = await saveAiDisclosureConsents({ repository, userId: "u", versions, improvementConsent: true });
  assert.equal(result.improvementConsentSaved, false);
  assert.deepEqual(repository.calls, [["u", "ai_disclosure", "1.0"], ["u", "ai_improvement_consent", "1.0"]]);
});

test("mandatory disclosure failure rejects and does not continue", async () => {
  const repository = repositoryFor({ ai_disclosure: "mandatory failed" });
  await assert.rejects(() => saveAiDisclosureConsents({ repository, userId: "u", versions, improvementConsent: true }));
  assert.deepEqual(repository.calls, [["u", "ai_disclosure", "1.0"]]);
});
