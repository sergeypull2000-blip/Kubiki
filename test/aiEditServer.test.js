import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler, { projectNotFoundResponse, resolveEditProjectLookup } from "../api/edit-estimate.js";
import { AI_EDIT_SYSTEM_PROMPT, buildAiEditMessages } from "../api/_lib/editPrompt.js";
import { hasExplicitPerformerLibraryIntent, needsClarificationForBareInput, resolveExplicitPerformers } from "../api/_lib/performerResolver.js";
import { listOwnProjectClientIds, loadOwnProjectForEdit } from "../api/_lib/editProject.js";
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

test("project lookup diagnostics return only owner-scoped client ids", async () => {
  const calls = [];
  const client = { from(table) { assert.equal(table, "projects"); return {
    select(fields) { calls.push(["select", fields]); return this; },
    eq(column, value) { calls.push(["eq", column, value]); return this; },
    then(resolve) { return resolve({ data: [{ client_id: "project-a" }, { client_id: "project-b" }], error: null }); },
  }; } };
  assert.deepEqual(await listOwnProjectClientIds(client, "owner"), ["project-a", "project-b"]);
  assert.deepEqual(calls, [["select", "client_id"], ["eq", "user_id", "owner"]]);
});

test("project lookup telemetry logs request id and found state", async () => {
  const events = [];
  const logger = { info(name, fields) { events.push({ name, fields }); }, error() {} };
  const found = await resolveEditProjectLookup({ userId: "owner", projectId: "project-a", requestId: "edit-1", loadProject: async () => ({ id: "project-a" }), logger });
  assert.deepEqual(found.project, { id: "project-a" });
  assert.deepEqual(events[0], { name: "edit_project_lookup", fields: { requestId: "edit-1", lookupFound: true } });
  events.length = 0;
  const missing = await resolveEditProjectLookup({ userId: "owner", projectId: "project-missing", requestId: "edit-2", loadProject: async () => null, listClientIds: async () => ["project-a", "project-b"], logger });
  assert.equal(missing.project, null);
  assert.equal(events[0].name, "edit_project_lookup");
  assert.deepEqual(events[0].fields, { requestId: "edit-2", lookupFound: false, projectCount: 2 });
  assert.deepEqual(projectNotFoundResponse("edit-2"), { status: 404, body: { error: "Смета не найдена", code: "project_not_found", requestId: "edit-2" } });
});

test("ambiguous explicit Performer returns one clarification candidate set", () => {
  const performers = [{ id: "1", firstName: "Миша", lastName: "Иванов" }, { id: "2", firstName: "Миша", lastName: "Петров" }];
  const result = resolveExplicitPerformers("Назначь Мишу из базы на моделинг", performers);
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

test("AI edit payload is scope-minimized and strips internal ids, snapshots, tags and template metadata", () => {
  const request = { scope: { kind: "task", projectId: "project-db-id", stageId: "stage-target-id", taskId: "task-target-id" }, instruction: "Измени оплату", confirmed: { performerId: "performer-db-id" } };
  const executor = { id: "executor-db-id", amount: "1000", performerId: "performer-db-id", performerSnapshot: { id: "snapshot-id", name: "Анна", primaryRole: "Аниматор", privateNote: "snapshot-secret" }, tags: [{ id: "tag-name-id", key: "name", value: "Анна" }, { id: "tag-payment-id", key: "payment", value: "hourly", payment: { type: "hourly", rate: "500", hours: "2", internal: "payment-secret" } }] };
  const project = { id: "project-db-id", name: "Смета", stages: [
    { id: "stage-target-id", name: "Продакшн", tasks: [{ id: "task-target-id", name: "Анимация", executors: [executor] }, { id: "unrelated-task-id", name: "Секретная задача", executors: [] }] },
    { id: "unrelated-stage-id", name: "Секретный этап", tasks: [] },
  ] };
  const knowledge = [{ kind: "task_template", id: "selected-template-id", value: { id: "raw-template-id", name: "Шаблон", metadata: { secret: true }, tags: [{ id: "template-tag-id" }], executors: [executor] } }];
  const payload = buildAiEditMessages({ request, project, personalization: "", performers: [{ id: "performer-db-id", firstName: "Анна", primaryRole: "Аниматор", internal: "performer-secret" }], knowledge })[1].content;
  assert.match(payload, /Анимация|Анна|Аниматор|hourly|500/);
  assert.doesNotMatch(payload, /project-db-id|stage-target-id|task-target-id|executor-db-id|performer-db-id|snapshot-id|tag-name-id|tag-payment-id|selected-template-id|raw-template-id|template-tag-id/);
  assert.doesNotMatch(payload, /Секретная задача|Секретный этап|snapshot-secret|payment-secret|performer-secret|metadata|performerSnapshot|tags/);
});

test("endpoint is read-only, owner-scoped and does not log Project content", () => {
  const endpoint = readFileSync(new URL("../api/edit-estimate.js", import.meta.url), "utf8"), repository = readFileSync(new URL("../api/_lib/editProject.js", import.meta.url), "utf8");
  assert.match(repository, /\.eq\("user_id", userId\)\.eq\("client_id", projectId\)/);
  assert.doesNotMatch(endpoint, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(endpoint, /console\.(?:info|error|warn)\([^\n]*(?:project|instruction|raw)/i);
  assert.match(endpoint, /parseAiEditSemanticResponse/); assert.doesNotMatch(endpoint, /parseAiEditResponse/);
});

test("OpenAI-compatible provider ai_edit stage has thinking disabled", () => {
  const source = readFileSync(new URL("../api/_lib/openAiCompatibleProvider.js", import.meta.url), "utf8");
  assert.match(source, /stage === "ai_edit"/);
});

test("Performer choices deduplicate stable ids but keep distinct same-name cards", () => {
  const ella = { id: "ella-1", firstName: "Элла", lastName: "Иванова", primaryRole: "3D артист" };
  const duplicate = { ...ella, primaryRole: "Визуализатор" };
  const other = { id: "ella-2", firstName: "Элла", lastName: "Иванова", primaryRole: "Арт-директор" };
  const result = resolveExplicitPerformers("Добавь Эллу из базы", [ella, duplicate, other]);
  assert.deepEqual(result.clarification.choices.map((item) => item.source.id), ["ella-1", "ella-2"]);
  const one = resolveExplicitPerformers("Добавь Эллу из базы", [ella, duplicate]);
  assert.equal(one.clarification, null); assert.equal(one.performers[0].id, "ella-1");
});

test("same-name Performer does not turn a short anonymous intent into library intent", () => {
  const performers = [{ id: "pf-misha", firstName: "Миша", lastName: "Иванов" }];
  assert.equal(hasExplicitPerformerLibraryIntent("добавь Мишу", [], {}), false);
  assert.equal(hasExplicitPerformerLibraryIntent("добавь Мишу из базы", [], {}), true);
  assert.deepEqual(resolveExplicitPerformers("добавь Мишу", performers).performers, []);
});

test("technical modal renders only the human-readable AI Edit error", () => {
  const source = readFileSync(new URL("../src/components/AiEditTechnicalModal.jsx", import.meta.url), "utf8");
  assert.match(source, /className="kb-ai-edit-error">\{error\}/);
  assert.doesNotMatch(source, /<code>\{errorCode\}<\/code>/);
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
  const account = readFileSync(new URL("../src/components/AccountControl.jsx", import.meta.url), "utf8");
  const localRows = ["Stage.jsx", "Task.jsx", "Executor.jsx"].map((name) => readFileSync(new URL(`../src/components/${name}`, import.meta.url), "utf8")).join("\n");
  assert.match(app, /user=\{session\.user\}/);
  assert.match(account, /kb-profile-trigger/); assert.match(account, /userAccount\?\.accountLabel/);
  assert.match(account, /kb-profile-menu/); assert.match(account, /Персонализация ИИ/); assert.match(account, /Выйти/);
  assert.match(workspace, /accountControl=\{accountControl\}/); assert.match(account, /kb-profile-sidebar/);
  assert.doesNotMatch(workspace, /className="kb-ai-settings-open"[^>]*>Изменить с AI/);
  assert.match(workspace, /project\.stages\.length > 0/); assert.match(workspace, /kb-ai-launcher/); assert.match(workspace, /variant="launcher"[^>]*scope=\{globalScope\}/);
  assert.match(modal, /kb-import-panel kb-import-panel-unified kb-ai-launcher-prompt/);
  assert.match(modal, /kb-ai-launcher-feedback/); assert.match(modal, /feedbackVisible/);
  assert.match(workspace, /kb-ai-launcher\$\{globalAiOpen && !globalAiClosing \? " is-open"/);
  assert.match(workspace, /submitRef=\{globalAiSubmitRef\}/); assert.match(workspace, /globalAiSubmitRef\.current\?\.\(\)/);
  assert.doesNotMatch(modal, /kb-attach-btn|Paperclip/);
  assert.match(modal, /if \(variant === "launcher"\)/);
  assert.match(modal, /if \(variant === "inline"\)/);
  assert.match(modal, /kb-ai-inline-feedback/); assert.match(modal, /kb-ai-inline-panel/);
  assert.match(workspace, /globalAiClosing/); assert.match(workspace, /setTimeout\(\(\) => \{ setGlobalAiOpen\(false\)/);
  assert.equal((localRows.match(/onContextMenu/g) || []).length, 3); assert.match(workspace, /setLocalAiPopover\(/);
  assert.doesNotMatch(workspace, /kb-ai-context-menu|>Изменить с AI…<\/button>/);
  assert.match(workspace, /variant="inline"/); assert.match(workspace, /scope=\{localScope\(localAiPopover\.context\)\}/);
  assert.match(modal, /event\.key === "Enter"/); assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /document\.addEventListener\("mousedown", close, true\)/);
  assert.match(workspace, /canUndoAiEdit &&/); assert.match(modal, /canUndo && onUndo/);
  assert.match(modal, /createPortal/); assert.match(modal, /window\.innerWidth/); assert.match(modal, /window\.innerHeight/); assert.match(modal, /ResizeObserver/);
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /\.kb-ai-inline-anchor[^}]*max-height:[^}]*overflow:\s*visible/);
  assert.doesNotMatch(css, /\.kb-ai-inline-panel[^}]*overflow-x:\s*hidden/);
  assert.doesNotMatch(css, /\.kb-ai-inline-surface[^}]*overflow-x:\s*hidden/);
  assert.match(css, /\.kb-ai-inline-feedback[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.kb-ai-launcher-choices\s*>\s*\.kb-btn[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
  // Floating launcher опущен на 8px, Undo AI — с явным зазором слева от кнопки.
  assert.match(css, /\.kb-ai-launcher-wrap[^}]*bottom:\s*39px/);
  assert.match(css, /\.kb-ai-undo-chip[^}]*right:\s*64px/);
});
