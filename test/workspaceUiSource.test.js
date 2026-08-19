import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("workspace uses edge-to-edge flex center and bounded panel resizers", async () => {
  const [workspace, styles] = await Promise.all([source("src/components/Workspace.jsx"), source("src/styles.js")]);
  assert.match(styles, /\.kb-layout\{[^}]*width:100%; min-width:0/);
  assert.doesNotMatch(styles, /\.kb-layout\{[^}]*max-width/);
  assert.match(styles, /\.kb-canvas-inner\{width:100%; min-width:0/);
  assert.match(workspace, /const LEFT_PANEL_RANGE = \[210, 320\]/);
  assert.match(workspace, /const RIGHT_PANEL_RANGE = \[250, 360\]/);
  assert.match(workspace, /side === "left" \? LEFT_PANEL_RANGE : RIGHT_PANEL_RANGE/);
  assert.match(workspace, /kb-panel-resizer-left/);
  assert.match(workspace, /kb-panel-resizer-right/);
});

test("stage and task titles rest as text and enter explicit pencil edit mode", async () => {
  const [stage, task] = await Promise.all([source("src/components/Stage.jsx"), source("src/components/Task.jsx")]);
  for (const component of [stage, task]) {
    assert.match(component, /kb-title-text/);
    assert.match(component, /kb-title-edit-btn/);
    assert.match(component, /Pencil/);
    assert.match(component, /onCancel/);
  }
  assert.match(stage, /if \(e\.key === "Escape"\)/);
  assert.match(task, /onCommit=\{\(value\)/);
  assert.match(stage, /kb-stage-title-edit" onMouseDown=\{onStageMouseDown\}/);
  assert.match(task, /kb-task-title-edit" onMouseDown=\{onTaskMouseDown\}/);
});

test("workspace top-right total shows the final client total (base + markup + tax + VAT)", async () => {
  const workspace = await source("src/components/Workspace.jsx");
  assert.match(workspace, /import \{[^}]*\bprojectTotalWithTax\b[^}]*\} from "\.\.\/calculations\.js"/);
  assert.doesNotMatch(workspace, /import \{[^}]*\bprojectSum\b/);
  assert.match(workspace, /const total = projectTotalWithTax\(project\)/);
  assert.match(workspace, /kb-total-badge/);
});

test("estimate depth backgrounds derive only from existing task and executor collections", async () => {
  const [stage, task, styles] = await Promise.all([
    source("src/components/Stage.jsx"), source("src/components/Task.jsx"), source("src/styles.js"),
  ]);
  assert.match(stage, /stage\.tasks\.length > 0/);
  assert.match(stage, /stage\.tasks\.some\(\(task\) => task\.executors\.length > 0\)/);
  assert.match(task, /task\.executors\.length > 0/);
  assert.match(styles, /\.kb-stage-depth-empty\{background:#FFFFFF\}/);
  assert.match(styles, /\.kb-stage-depth-tasks\{background:#FFFFFF\}/);
  assert.match(styles, /\.kb-stage-depth-executors\{background:#FFFFFF\}/);
  assert.match(styles, /\.kb-task-depth-empty[^}]*background:#F1F4F8/);
  assert.match(styles, /\.kb-task-depth-executors[^}]*background:#F1F4F8/);
  assert.match(styles, /\.kb-erow-group\{[^}]*background:#FFFFFF/);
  assert.match(styles, /\.kb-erow-flash\{background:#FFFFFF\}/);
  assert.doesNotMatch(styles, /@keyframes kbFlash/);
  assert.match(styles, /\.kb-erow-group \+ \.kb-erow-group\{margin-top:3px\}/);
});

test("estimate hierarchy uses compact vertical rhythm and visible indentation lines", async () => {
  const styles = await source("src/styles.js");
  assert.match(styles, /\.kb-stage\{[^}]*border:1px solid var\(--line-strong\)[^}]*margin-bottom:14px/);
  assert.match(styles, /\.kb-stage-head\{[^}]*min-height:38px; padding:6px 11px/);
  assert.doesNotMatch(styles, /\n\.kb-stage-body\{[^}]*border-left/);
  assert.match(styles, /\.kb-task\{[^}]*padding:0 0 8px; border:1px solid var\(--line-strong\); border-radius:9px[^}]*margin-bottom:8px/);
  assert.match(styles, /\.kb-task-body\{[^}]*padding:7px 9px 0; margin:0/);
  assert.doesNotMatch(styles, /\n\.kb-task-body\{[^}]*border-left/);
  assert.match(styles, /\.kb-task-active\{[^}]*border-color:var\(--accent\)[^}]*box-shadow:0 0 0 1px color-mix/);
});

test("stage and task numbering derives from render order without numbering executors", async () => {
  const [workspace, stage, task] = await Promise.all([
    source("src/components/Workspace.jsx"), source("src/components/Stage.jsx"), source("src/components/Task.jsx"),
  ]);
  assert.match(workspace, /project\.stages\.map\(\(s, stageIndex\)/);
  assert.match(workspace, /stageNumber=\{stageIndex \+ 1\}/);
  assert.match(stage, /taskNumber=\{`\$\{stageNumber\}\.\$\{taskIndex \+ 1\}`\}/);
  assert.match(stage, /kb-stage-index/);
  assert.match(task, /kb-task-index/);
  assert.doesNotMatch(await source("src/components/Executor.jsx"), /kb-entity-index/);
});

test("tasks and executors render as compact bordered rows inside a stage", async () => {
  const styles = await source("src/styles.js");
  assert.match(styles, /\.kb-task-head\{[^}]*border-bottom:1px solid var\(--line\)/);
  assert.match(styles, /\.kb-erow-group\{[^}]*border-radius:5px[^}]*border:1px solid var\(--line\)/);
  assert.match(styles, /\.kb-erow-group-active\{box-shadow:inset 0 0 0 1px var\(--accent\)/);
});

test("task row exposes a comment toggle and inline editor bound to exportComment", async () => {
  const [task, styles] = await Promise.all([source("src/components/Task.jsx"), source("src/styles.js")]);
  assert.match(task, /MessageSquare/);
  assert.match(task, /kb-task-comment-btn/);
  assert.match(task, /onPatch\(\{ exportComment: event\.target\.value \}\)/);
  assert.match(task, /kb-task-comment-input/);
  assert.match(styles, /\.kb-task-comment-btn\.is-active\{color:var\(--accent\)\}/);
});

test("workspace money/number displays stay text-selectable despite reorder drag", async () => {
  const [task, stage, executor, styles] = await Promise.all([
    source("src/components/Task.jsx"), source("src/components/Stage.jsx"),
    source("src/components/Executor.jsx"), source("src/styles.js"),
  ]);
  // Суммы задачи/этапа лежат внутри draggable head'ов: mousedown по ним должен
  // выключать draggable (иначе нативный DnD перехватывает выделение текста).
  assert.match(task, /closest\("input, textarea, button, select, \.kb-sum"\)/);
  assert.match(stage, /closest\("input, textarea, button, select, \.kb-sum"\)/);
  // Сумма исполнителя — та же защита в INTERACTIVE_SEL строки.
  assert.match(executor, /\.kb-erow-sum/);
  assert.match(executor, /INTERACTIVE_SEL = "input, textarea, select, button, \.kb-tag, \.kb-addcube, \.kb-payinline, \.kb-erow-taxed, \.kb-erow-sum"/);
  // Суммы остаются выделяемыми по CSS независимо от draggable-контейнеров.
  assert.match(styles, /\.kb-sum\{[^}]*user-select:text/);
  // Readonly selectable суммы при наведении — текстовый курсор, а не pointer/hand.
  assert.match(styles, /\.kb-sum\{[^}]*cursor:text/);
  assert.match(styles, /\.kb-erow-sum\{[^}]*cursor:text/);
  assert.match(styles, /\.kb-erow-taxed\{[^}]*cursor:text/);
  assert.match(styles, /\.kb-erow-sum\{[^}]*user-select:text/);
  // Верхнее «Итого» — без user-select:none, выделяется как обычный текст.
  assert.doesNotMatch(styles, /\.kb-total-badge\{[^}]*user-select:none/);
});
