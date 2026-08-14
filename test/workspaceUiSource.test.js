import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("workspace uses edge-to-edge flex center and bounded panel resizers", async () => {
  const [workspace, styles] = await Promise.all([source("src/components/Workspace.jsx"), source("src/styles.js")]);
  assert.match(styles, /\.kb-layout\{[^}]*width:100%; min-width:0/);
  assert.doesNotMatch(styles, /\.kb-layout\{[^}]*max-width/);
  assert.match(styles, /\.kb-canvas-inner\{width:100%; min-width:0/);
  assert.match(workspace, /side === "left" \? \[210, 380\] : \[250, 440\]/);
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
  assert.match(styles, /\.kb-task-depth-empty[^}]*background:#F3F6FA/);
  assert.match(styles, /\.kb-task-depth-executors[^}]*background:#F3F6FA/);
  assert.match(styles, /\.kb-erow-group\{[^}]*background:#FFFFFF/);
  assert.match(styles, /\.kb-erow-flash\{background:#FFFFFF\}/);
  assert.doesNotMatch(styles, /@keyframes kbFlash/);
  assert.match(styles, /\.kb-erow-group \+ \.kb-erow-group\{margin-top:3px; border-top-color:var\(--line\)\}/);
});

test("estimate hierarchy uses compact vertical rhythm and visible indentation lines", async () => {
  const styles = await source("src/styles.js");
  assert.match(styles, /\.kb-stage\{[^}]*border:1px solid var\(--line-strong\)[^}]*margin-bottom:14px/);
  assert.match(styles, /\.kb-stage-head\{[^}]*min-height:38px; padding:6px 11px/);
  assert.match(styles, /\.kb-stage-body\{[^}]*border-left:1px solid var\(--line-strong\)/);
  assert.match(styles, /\.kb-task\{[^}]*padding:3px 7px[^}]*margin-bottom:6px/);
  assert.match(styles, /\.kb-task-body\{[^}]*border-left:1px solid var\(--line-strong\)/);
  assert.match(styles, /\.kb-task-active\{[^}]*border-color:var\(--accent\); box-shadow:0 0 0 1px var\(--accent\)/);
});
