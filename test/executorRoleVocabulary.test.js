import test from "node:test";
import assert from "node:assert/strict";
import { TAG_DEF } from "../src/constants.js";
import { STUDIO_ROLES } from "../src/cgTaskRoleTaxonomy.js";
import { buildAiEditMessages } from "../api/_lib/editPrompt.js";

test("Executor role options and AI edit policy use the canonical studio vocabulary", () => {
  assert.equal(TAG_DEF.role.options, STUDIO_ROLES);
  for (const role of ["AI-артист", "Композер", "Колорист", "3D-моделлер", "Клинапер"]) assert.ok(TAG_DEF.role.options.includes(role));

  const messages = buildAiEditMessages({
    request: { scope: { kind: "project", projectId: "p" }, instruction: "Измени роль", confirmed: {} },
    project: { id: "p", name: "P", stages: [] }, personalization: null, performers: [], knowledge: [],
  });
  const policy = JSON.parse(messages[1].content.match(/<domain_policy>(.*?)<\/domain_policy>/u)[1]);
  assert.deepEqual(policy.roles, STUDIO_ROLES);
});
