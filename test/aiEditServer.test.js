import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../api/edit-estimate.js";
import { AI_EDIT_SYSTEM_PROMPT, buildAiEditMessages } from "../api/_lib/editPrompt.js";
import { hasExplicitPerformerLibraryIntent, needsClarificationForBareInput, resolveExplicitPerformers } from "../api/_lib/performerResolver.js";
import { loadOwnProjectForEdit } from "../api/_lib/editProject.js";
import { createAiEditIdPool, createAiEditRequest } from "../src/ai/editClient.js";
import { globalAiEditScope } from "../src/ai/editScope.js";
import { deserializeProjectFromServer } from "../src/projectServer.js";
import { resolveProjectTarget } from "../api/_lib/projectTargetResolver.js";
import { buildAiEditContinuation } from "../src/ai/editContinuation.js";
import { applyAiEditOperations } from "../src/ai/editOperations.js";
import { diagnoseAiEditResponse, parseAiEditResponse } from "../src/ai/editSchema.js";

function responseRecorder() { return { headers: {}, statusCode: 0, body: null, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } }; }

test("AI-edit endpoint without JWT returns 401 and performs no model request", async () => {
  const res = responseRecorder(); await handler({ method: "POST", headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 401); assert.match(res.body.error, /авторизац/i);
});

test("global request keeps runtime Project id equal to scope and owner-scoped client_id lookup", async () => {
  const row = { user_id: "owner", client_id: "saved-client-id", project_data: { id: "stale-payload-id", stages: [] } };
  const filters = [];
  const query = {
    select() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    async maybeSingle() { return { data: row, error: null }; },
  };
  const client = { from(table) { assert.equal(table, "projects"); return query; } };
  const currentProject = deserializeProjectFromServer(row);
  const scope = globalAiEditScope(currentProject);
  const request = createAiEditRequest({ projectId: scope.projectId, baseRevision: "sha256:test", scope, instruction: "Добавь новый этап", idPool: createAiEditIdPool(currentProject, { stages: 1, tasks: 1, executors: 1, tags: 1 }) });
  const loaded = await loadOwnProjectForEdit(client, "owner", request.projectId);

  assert.equal(currentProject.id, "saved-client-id");
  assert.equal(currentProject.id, request.projectId);
  assert.equal(request.projectId, scope.projectId);
  assert.deepEqual(filters, [["user_id", "owner"], ["client_id", "saved-client-id"]]);
  assert.equal(loaded.id, "saved-client-id");
});

test("ambiguous explicit Performer returns one clarification candidate set", () => {
  const performers = [{ id: "1", firstName: "Миша", lastName: "Иванов" }, { id: "2", firstName: "Миша", lastName: "Петров" }];
  const result = resolveExplicitPerformers("Назначь Мишу на моделинг", performers);
  assert.equal(result.performers.length, 0); assert.match(result.clarification.question, /какого исполнителя/i); assert.equal(result.clarification.choices.length, 2);
  assert.deepEqual(resolveExplicitPerformers("Увеличь детализацию", performers).performers, []);
});

test("replace resolves target only among Project Executors and replacement only among active Performer", () => {
  const project = { stages: [{ id: "s", name: "Preprod", tasks: [{ id: "t", name: "Art", executors: [{ id: "e-anya", tags: [{ key: "name", value: "Аня" }] }] }] }] };
  const performers = [{ id: "anya-db", firstName: "Аня", lastName: "Орлова" }, { id: "m1", firstName: "Миша", lastName: "Иванов" }, { id: "m2", firstName: "Миша", lastName: "Петров" }];
  const ambiguous = resolveExplicitPerformers("Замени Аня на Миша из базы", performers, [], project);
  assert.match(ambiguous.clarification.question, /какого исполнителя из базы/i);
  assert.deepEqual(ambiguous.clarification.choices.map((choice) => choice.source.id), ["m1", "m2"]);
  const resolved = resolveExplicitPerformers("Замени Аня на Миша Иванов из базы", performers, [], project);
  assert.equal(resolved.targetExecutorId, "e-anya"); assert.deepEqual(resolved.performers.map((item) => item.id), ["m1"]);
});

test("ambiguous replace target clarifies Executor before resolving replacement", () => {
  const project = { stages: [{ id: "s", name: "S", tasks: [{ id: "t1", name: "T1", executors: [{ id: "e1", tags: [{ key: "name", value: "Аня" }] }] }, { id: "t2", name: "T2", executors: [{ id: "e2", tags: [{ key: "name", value: "Аня" }] }] }] }] };
  const result = resolveExplicitPerformers("Замени Аня на Миша", [{ id: "m", firstName: "Миша" }], [], project);
  assert.match(result.clarification.question, /в текущей смете/i); assert.deepEqual(result.clarification.choices.map((choice) => choice.source.id), ["e1", "e2"]);
});

test("ambiguous named Executor update requires contextual clarification", () => {
  const project = { stages: [{ id: "s1", name: "Препродакшн", tasks: [{ id: "t1", name: "Концепт", executors: [{ id: "e1", tags: [{ id: "n1", key: "name", value: "Иван Петров" }] }] }] }, { id: "s2", name: "Продакшн", tasks: [{ id: "t2", name: "Моделинг", executors: [{ id: "e2", tags: [{ id: "n2", key: "name", value: "Гриша Петров" }] }] }] }] };
  const result = resolveProjectTarget("Увеличь оплату Петрова до 130к", project);
  assert.equal(result.target, null);
  assert.deepEqual(result.clarification.choices.map((item) => item.source.id), ["e1", "e2"]);
  assert.match(result.clarification.choices[0].label, /Препродакшн \/ Концепт/);
  assert.match(result.clarification.choices[1].label, /Продакшн \/ Моделинг/);
});

test("missing explicitly named Executor is clarified before the model", () => {
  const project = { stages: [{ id: "s", name: "Продакшн", tasks: [{ id: "t", name: "Моделинг", executors: [] }] }] };
  const result = resolveProjectTarget("Увеличь оплату Сидорова до 130к", project);
  assert.equal(result.target, null);
  assert.match(result.clarification.question, /не найдена/i);
});

test("one named Executor resolves to one stable id", () => {
  const project = { stages: [{ id: "s", name: "Продакшн", tasks: [{ id: "t", name: "Моделинг", executors: [{ id: "executor-stable", tags: [{ id: "name-tag", key: "name", value: "Гриша Петров" }] }] }] }] };
  const result = resolveProjectTarget("Увеличь оплату Гриши до 130к", project);
  assert.equal(result.clarification, null);
  assert.equal(result.target.id, "executor-stable");
});

test("replace clarification continuation pins Executor id and resolves Performer separately", () => {
  const project = { id: "p", stages: [{ id: "s1", name: "Препродакшн", tasks: [{ id: "t1", name: "Концепт", executors: [{ id: "e1", amount: "100", performerId: null, performerSnapshot: null, tags: [{ id: "n1", key: "name", value: "Иван Петров" }] }] }] }, { id: "s2", name: "Продакшн", tasks: [{ id: "t2", name: "Моделинг", executors: [{ id: "e2", amount: "200", performerId: null, performerSnapshot: null, tags: [{ id: "n2", key: "name", value: "Гриша Петров" }] }] }] }] };
  const performer = { id: "pf-misha", firstName: "Миша", lastName: "Иванов", primaryRole: "Арт-директор", active: true };
  const first = resolveProjectTarget("Замени Петрова на Мишу из базы", project);
  assert.equal(first.clarification.choices.length, 2);
  const continuation = buildAiEditContinuation({ instruction: "Замени Петрова на Мишу из базы", source: first.clarification.choices[1].source, label: first.clarification.choices[1].label });
  const confirmed = resolveProjectTarget(continuation.instruction, project, continuation.confirmed.projectEntityId);
  const performers = resolveExplicitPerformers(continuation.instruction, [performer], [], project, confirmed.target);
  const request = { requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" } };
  const raw = { schemaVersion: 1, kind: "diff", ...request, summary: "Замена", operations: [{ id: "op-1", type: "executor.replacePerformer", targetId: "e2", value: { performerId: "pf-misha" }, reason: "По запросу", source: { kind: "performer", id: "pf-misha" } }], warnings: [] };
  const response = parseAiEditResponse(raw, request);
  const next = applyAiEditOperations(project, response, { performers: performers.performers, idPool: { stages: [], tasks: [], executors: [], tags: ["x1", "x2", "x3", "x4", "x5", "x6"] }, instruction: continuation.instruction });
  assert.equal(confirmed.target.id, "e2");
  assert.equal(performers.targetExecutorId, "e2");
  assert.equal(next.stages[1].tasks[0].executors[0].performerId, "pf-misha");
  assert.equal(next.stages[0].tasks[0].executors[0].id, "e1");
});

test("invalid model diff exposes only a safe diagnostic class", () => {
  const expected = { requestId: "r", baseRevision: "rev", scope: { kind: "project", projectId: "p" } };
  assert.equal(diagnoseAiEditResponse("not json", expected), "ai_diff_invalid_json");
  assert.equal(diagnoseAiEditResponse({ schemaVersion: 1, kind: "diff", ...expected, summary: "X", operations: [{ unsafe: true }], warnings: [] }, expected), "ai_diff_invalid_operation");
});

test("bare name is clarification-worthy and database add never invents missing Performer", () => {
  assert.equal(needsClarificationForBareInput("Миша"), true);
  const missing = resolveExplicitPerformers("Добавь Николая из базы", [], [], { stages: [] });
  assert.match(missing.clarification.question, /не найден/i); assert.deepEqual(missing.performers, []);
});

test("anonymous name does not load Performer Library without explicit database intent", () => {
  assert.equal(hasExplicitPerformerLibraryIntent("Добавь арт-директора Иванова", [], {}), false);
  assert.equal(hasExplicitPerformerLibraryIntent("Добавь Мишу из базы", [], {}), true);
  assert.equal(hasExplicitPerformerLibraryIntent("Добавь Иванова", [{ kind: "performer", id: "pf" }], {}), true);
  assert.equal(hasExplicitPerformerLibraryIntent("Замени Гришу на Мишу", [], {}), true);
});

test("editor prompt fixes priorities, strict JSON, no arbitrary patch and no implicit Performer", () => {
  assert.match(AI_EDIT_SYSTEM_PROMPT, /Текущий запрос всегда может отменить персонализацию/);
  assert.match(AI_EDIT_SYSTEM_PROMPT, /set\/path\/patch\/replaceProject/);
  assert.match(AI_EDIT_SYSTEM_PROMPT, /Не назначай и не заменяй Performer без прямого запроса/);
  assert.match(AI_EDIT_SYSTEM_PROMPT, /только один завершённый JSON/);
  const messages = buildAiEditMessages({ request: { schemaVersion: 1, requestId: "r", baseRevision: "x", scope: { kind: "project", projectId: "p" }, instruction: "Переименуй", confirmed: {}, idPool: { stages: [], tasks: [], executors: [], tags: [] } }, project: { id: "p", stages: [], branding: { contacts: "secret" } }, personalization: "Всегда сториборд", performers: [], knowledge: [] });
  assert.doesNotMatch(messages[1].content, /secret/); assert.match(messages[1].content, /<studio_knowledge>\[\]/);
  assert.doesNotMatch(messages[0].content, /requestId|baseRevision/); assert.doesNotMatch(messages[1].content, /<request_meta>/);
});

test("endpoint is read-only, owner-scoped and does not log Project content", () => {
  const endpoint = readFileSync(new URL("../api/edit-estimate.js", import.meta.url), "utf8"), repository = readFileSync(new URL("../api/_lib/editProject.js", import.meta.url), "utf8");
  assert.match(repository, /\.eq\("user_id", userId\)\.eq\("client_id", projectId\)/);
  assert.doesNotMatch(endpoint, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(endpoint, /console\.(?:info|error|warn)\([^\n]*(?:project|instruction|raw)/i);
  assert.match(endpoint, /parseAiEditSemanticResponse/); assert.doesNotMatch(endpoint, /parseAiEditResponse/);
});

test("DeepSeek ai_edit stage has thinking disabled", () => {
  const source = readFileSync(new URL("../api/_lib/deepseek.js", import.meta.url), "utf8");
  assert.match(source, /stage === "ai_edit"/);
});

test("technical modal renders only normalized error code beside generic message", () => {
  const source = readFileSync(new URL("../src/components/AiEditTechnicalModal.jsx", import.meta.url), "utf8");
  assert.match(source, /errorCode[^\n]*<code>\{errorCode\}<\/code>/);
  assert.doesNotMatch(source, /raw model|stack trace|project_data/i);
});

test("product AI layer preserves autosave, cancel and stale guards", () => {
  const workspace = readFileSync(new URL("../src/kubiki.jsx", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../src/components/AiEditTechnicalModal.jsx", import.meta.url), "utf8");
  const revision = readFileSync(new URL("../src/ai/projectRevision.js", import.meta.url), "utf8");
  const flushAt = workspace.indexOf("await flushProject(projectId)");
  const requestAt = workspace.indexOf("requestAiEdit(payload");
  assert.ok(flushAt >= 0 && requestAt > flushAt, "autosave flush must finish before the AI request");
  assert.match(workspace, /if \(!await flushProject\(projectId\)\) throw new Error/);
  assert.match(modal, /requestVersion\.current \+= 1; onCancelRequest\(\)/);
  assert.match(modal, /version !== requestVersion\.current/);
  assert.match(revision, /PRESENTATION_ONLY_KEYS = new Set\(\["collapsed"\]\)/);
});

test("Workspace exposes profile dropdown, floating global launcher and direct local AI popover", () => {
  const workspace = readFileSync(new URL("../src/components/Workspace.jsx", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../src/components/AiEditTechnicalModal.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const localRows = ["Stage.jsx", "Task.jsx", "Executor.jsx"].map((name) => readFileSync(new URL(`../src/components/${name}`, import.meta.url), "utf8")).join("\n");
  assert.match(app, /user=\{session\.user\}/);
  assert.match(workspace, /kb-profile-trigger/); assert.match(workspace, /userAccount\?\.accountLabel/);
  assert.match(workspace, /kb-profile-menu/); assert.match(workspace, /Персонализация ИИ/); assert.match(workspace, /Выйти/);
  assert.match(workspace, /accountControl=\{accountControl\}/); assert.match(workspace, /kb-profile-sidebar/);
  assert.doesNotMatch(workspace, /className="kb-ai-settings-open"[^>]*>Изменить с AI/);
  assert.match(workspace, /project\.stages\.length > 0/); assert.match(workspace, /kb-ai-launcher/); assert.match(workspace, /variant="launcher"[^>]*scope=\{globalScope\}/);
  assert.match(modal, /kb-import-panel kb-import-panel-unified kb-ai-launcher-prompt/);
  assert.match(workspace, /kb-ai-launcher\$\{globalAiOpen && !globalAiClosing \? " is-open"/);
  assert.match(workspace, /submitRef=\{globalAiSubmitRef\}/); assert.match(workspace, /globalAiSubmitRef\.current\?\.\(\)/);
  assert.doesNotMatch(modal, /kb-attach-btn|Paperclip/);
  assert.match(modal, /variant === "inline" \|\| variant === "launcher"|variant === "launcher" \|\| variant === "inline"/);
  assert.match(workspace, /globalAiClosing/); assert.match(workspace, /setTimeout\(\(\) => \{ setGlobalAiOpen\(false\)/);
  assert.equal((localRows.match(/onContextMenu/g) || []).length, 3); assert.match(workspace, /setLocalAiPopover\(/);
  assert.doesNotMatch(workspace, /kb-ai-context-menu|>Изменить с AI…<\/button>/);
  assert.match(workspace, /variant="inline"/); assert.match(workspace, /scope=\{localScope\(localAiPopover\.context\)\}/);
  assert.match(modal, /event\.key === "Enter"/); assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /document\.addEventListener\("mousedown", close, true\)/);
  assert.match(workspace, /canUndoAiEdit &&/); assert.match(modal, /canUndo && onUndo/);
});
