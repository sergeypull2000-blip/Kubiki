import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");

test("Performer server writes are guarded until hydration", () => { assert.match(source, /performerSyncEnabledRef\.current = false/); assert.match(source, /if \(!performerSyncEnabledRef\.current\)/); assert.match(source, /performerRepository\.listPerformers\(userId\)/); });
test("temporary empty runtime is not persisted", () => assert.match(source, /replacePerformers\(\[\], false\)/));
test("hydrated performers flow to Knowledge Base and Workspace", () => { assert.match(source, /<KnowledgeBasePage performers=\{performers\}/); assert.match(source, /<Workspace[\s\S]*performers=\{performers\}/); });
test("load error restores local performers and supports retry", () => { assert.match(source, /replacePerformers\(local\)/); assert.match(source, /setPerformerRetry/); });
test("logout clears previous runtime and new user retriggers hydration", () => { assert.match(source, /replacePerformers\(\[\], false\)/); assert.match(source, /\[userId, performerRetry, replacePerformers\]/); });
test("CRUD uses repositories and Quick Access changes after successful save-delete", () => { assert.match(source, /await performerRepository\.upsertPerformer/); assert.match(source, /await performerRepository\.deletePerformer/); assert.match(source, /await addQuickAccessForPerformer\(saved\.id\)/); });
