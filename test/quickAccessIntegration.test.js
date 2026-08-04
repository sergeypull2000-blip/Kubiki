import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/Workspace.jsx", import.meta.url), "utf8");

test("Quick Access hydration waits for Performer server hydration", () => { assert.match(app, /performerHydratedUserRef\.current !== userId/); assert.match(app, /quickAccessRepository\.listQuickAccessItems/); assert.match(app, /setPerformerHydrationVersion/); });
test("writes are disabled and temporary empty runtime is not persisted", () => { assert.match(app, /quickAccessSyncEnabledRef\.current = false/); assert.match(app, /replaceQuickAccess\(\{ items: \[\] \}, false\)/); assert.match(app, /if \(!quickAccessSyncEnabledRef\.current/); });
test("logout clears Quick Access and userId causes separate hydration", () => { assert.match(app, /replaceQuickAccess\(\{ items: \[\] \}, false\)/); assert.match(app, /\[userId, performerHydrationVersion, quickAccessRetry, replaceQuickAccess\]/); });
test("add, remove and pin use single-item repository operations", () => { assert.match(app, /upsertQuickAccessItem\(userId, item\)/); assert.match(app, /deleteQuickAccessItem\(userId, item\.id\)/); assert.match(app, /updateQuickAccessItem\(userId, changed\)/); });
test("Performer upsert completes before checkbox creates Quick Access", () => { const performerSave = app.indexOf("await performerRepository.upsertPerformer"); const quickAdd = app.indexOf("await addQuickAccessForPerformer", performerSave); assert.ok(performerSave >= 0 && quickAdd > performerSave); });
test("Workspace delegates pin and delete and retains click/DnD lookup", () => { assert.match(workspace, /onToggleQuickAccessPin=\{onToggleQuickAccessPin\}/); assert.match(workspace, /onRemoveQuickAccess=\{onRemoveQuickAccess\}/); assert.match(workspace, /addPerformerToTask/); });
