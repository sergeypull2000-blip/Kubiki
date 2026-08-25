import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* ===== Welcome Beta modal ===== */

test("welcome modal uses canonical LogoMark 2x2 with app typography", async () => {
  const [modal, styles] = await Promise.all([source("src/components/WelcomeModal.jsx"), source("src/styles.js")]);
  assert.match(modal, /import \{ Logo \} from "\.\.\/Logo\.jsx"/);
  assert.match(modal, /<div className="kb-welcome-brand"><Logo size=\{44\} \/><\/div>/);
  assert.doesNotMatch(modal, /Kubiki <em>Beta<\/em>/);
  assert.match(styles, /\.kb-welcome-modal\{width:min\(640px,92vw\)/);
  assert.match(styles, /\.kb-welcome-title\{[^}]*font-size:24px[^}]*font-weight:700/);
  assert.match(styles, /\.kb-welcome-text\{[^}]*font-size:16px[^}]*line-height:1\.5[56]/);
  assert.match(styles, /\.kb-welcome-list ul\{[^}]*font-size:16px[^}]*line-height:1\.5/);
  assert.doesNotMatch(styles, /\.kb-welcome[^}]*font-family:serif/);
});

test("welcome and feedback modals escape the base .kb-modal width cap and scroll instead of clipping", async () => {
  const styles = await source("src/styles.js");
  assert.match(styles, /\.kb-welcome-modal\{width:min\(640px,92vw\);max-width:min\(640px,92vw\)[^}]*overflow-y:auto/);
  assert.match(styles, /\.kb-feedback-modal\{width:min\(520px,92vw\);max-width:min\(520px,92vw\)/);
});

test("logo and favicon share one canonical 20-unit geometry so nothing clips at any size", async () => {
  const [logo, favicon] = await Promise.all([source("src/Logo.jsx"), source("public/kubiki-favicon-v3.svg")]);
  assert.match(logo, /viewBox="0 0 20 20"/);
  assert.doesNotMatch(logo, /size \/ 2/);
  assert.match(logo, /<rect x="0" y="0" width="9" height="9" rx="2" fill="url\(#kb-logo-tl\)" \/>/);
  assert.match(logo, /<rect x="11" y="0" width="9" height="9" rx="2" fill="url\(#kb-logo-tr\)" \/>/);
  assert.match(logo, /<rect x="0" y="11" width="9" height="9" rx="2" fill="url\(#kb-logo-bl\)" \/>/);
  assert.match(logo, /<rect x="11" y="11" width="9" height="9" rx="2" fill="url\(#kb-logo-br\)" \/>/);
  assert.match(favicon, /viewBox="0 0 20 20"/);
  assert.match(favicon, /<rect x="0" y="0" width="9" height="9" rx="2" fill="#162138" \/>/);
  assert.match(favicon, /<rect x="11" y="0" width="9" height="9" rx="2" fill="#c9d2e3" \/>/);
  assert.match(favicon, /<rect x="0" y="11" width="9" height="9" rx="2" fill="#b4d6fd" \/>/);
  assert.match(favicon, /<rect x="11" y="11" width="9" height="9" rx="2" fill="#4780f3" \/>/);
  assert.doesNotMatch(favicon, /currentColor|url\(#|<style|class=/);
});

test("welcome modal keeps approved copy and makes the feedback paragraph bold before CTA", async () => {
  const [modal, styles] = await Promise.all([source("src/components/WelcomeModal.jsx"), source("src/styles.js")]);
  assert.match(modal, /<p className="kb-welcome-text kb-welcome-feedback">Если у вас появятся замечания/);
  assert.match(styles, /\.kb-welcome-feedback\{font-weight:700\}/);
  assert.match(modal, /Команда Kubiki рада приветствовать вас на закрытом бета-тестировании первой версии продукта\./);
  assert.match(modal, /Что уже можно:/);
  assert.match(modal, /Это beta-версия - некоторые вещи ещё могут меняться\. Будем очень рады вашему фидбэку\./);
  assert.match(modal, /Начать работу/);
  const feedbackIdx = modal.indexOf("Если у вас появятся замечания, идеи или что-то окажется неудобным");
  const ctaIdx = modal.indexOf("onClick={onStart}>Начать работу");
  assert.ok(feedbackIdx !== -1 && ctaIdx > feedbackIdx, "feedback paragraph must come before the CTA button");
});

/* ===== Global «Оставить отзыв» entry points ===== */

test("header no longer shows feedback button; account menu keeps Оставить отзыв", async () => {
  const [nav, account] = await Promise.all([source("src/components/AppTopNavigation.jsx"), source("src/components/AccountControl.jsx")]);
  assert.doesNotMatch(nav, /Оставить отзыв/);
  assert.doesNotMatch(nav, /kb-feedback-open/);
  assert.doesNotMatch(nav, /onOpenFeedback/);
  assert.match(account, /onOpenFeedback/);
  assert.match(account, /MessageSquare size=\{15\} \/>Оставить отзыв/);
  assert.match(account, /onOpenFeedback && <button type="button" role="menuitem"/);
});

test("Dashboard and Workspace forward onOpenFeedback to sidebar and account control", async () => {
  const [dashboard, workspace, knowledge] = await Promise.all([
    source("src/components/Dashboard.jsx"), source("src/components/Workspace.jsx"), source("src/components/KnowledgeBasePage.jsx"),
  ]);
  assert.match(dashboard, /<AccountControl[^>]*onOpenFeedback=\{onOpenFeedback\}/);
  assert.match(dashboard, /<LeftPanel[\s\S]*onOpenFeedback=\{onOpenFeedback\}/);
  assert.match(workspace, /<AccountControl[^>]*onOpenFeedback=\{onOpenFeedback\}/);
  assert.match(workspace, /<PalettePanel[\s\S]*onOpenFeedback=\{onOpenFeedback\}/);
  assert.doesNotMatch(knowledge, /onOpenFeedback/);
});

test("sidebar feedback pill hugs text and aligns with account avatar", async () => {
  const [left, styles] = await Promise.all([source("src/components/LeftPanel.jsx"), source("src/styles.js")]);
  const pills = (left.match(/className="kb-feedback-float" onClick=\{onOpenFeedback\}>Оставить отзыв/g) || []).length;
  assert.equal(pills, 1, "the shared sidebar action component hosts the feedback pill");
  assert.match(styles, /\.kb-sidebar-actions\{[^}]*position:absolute/);
  assert.match(styles, /\.kb-sidebar-actions\{[^}]*left:25px[^}]*bottom:calc\(100% \+ 12px\)/);
  assert.match(styles, /\.kb-feedback-float\{[^}]*width:auto[^}]*height:45px/);
  assert.match(styles, /\.kb-feedback-float\{[^}]*padding:0 16px/);
  assert.match(styles, /\.kb-feedback-float\{[^}]*border-radius:12px/);
  assert.match(styles, /\.kb-feedback-float\{[^}]*background:linear-gradient\(145deg,#2ea3ff,#2698ff\)/);
  assert.match(styles, /\.kb-feedback-float\{[^}]*color:#fff/);
  assert.match(styles, /\.kb-feedback-float\{[^}]*box-shadow:0 10px 24px rgba\(38,152,255,\.3\)/);
  assert.match(styles, /\.kb-feedback-float\{[^}]*font-size:13px[^}]*font-weight:600/);
  assert.match(styles, /\.kb-feedback-float:hover\{[^}]*box-shadow:0 13px 30px rgba\(38,152,255,\.38\)/);
  assert.match(styles, /\.kb-palette-foot\{[^}]*position:relative/);
  assert.match(styles, /\.kb-dash-sidebar-foot\{[^}]*position:relative/);
  assert.doesNotMatch(styles, /\.kb-palette\{[^}]*position:relative/);
  assert.doesNotMatch(styles, /\.kb-dash-sidebar\{[^}]*position:relative/);
});

/* ===== Feedback modal component ===== */

test("feedback modal has required texts, textarea and controls", async () => {
  const modal = await source("src/components/BetaFeedbackModal.jsx");
  assert.match(modal, /Обратная связь/);
  assert.match(modal, /kb-feedback-textarea/);
  assert.match(modal, /Отмена/);
  assert.match(modal, /Отправить/);
  assert.match(modal, /Спасибо! Отзыв отправлен\./);
  assert.match(modal, /betaFeedbackRepository\.insert/);
  assert.match(modal, /kb-feedback-success/);
});

/* ===== Repository ===== */

test("feedback repository inserts into beta_feedback with context", async () => {
  const repo = await source("src/repositories/betaFeedbackRepository.js");
  assert.match(repo, /client\.from\("beta_feedback"\)/);
  assert.match(repo, /user_id: userId/);
  assert.match(repo, /message/);
  assert.match(repo, /context: context \|\| null/);
  assert.match(repo, /project_id: projectId \|\| null/);
  assert.match(repo, /sheet_id: sheetId \|\| null/);
  assert.doesNotMatch(repo, /\.select\(/);
  assert.doesNotMatch(repo, /\.single\(/);
  assert.match(repo, /data\(result, "Не удалось отправить отзыв"\) \?\? \{ ok: true \}/);
});

test("feedback repository insert never selects after insert, so the insert-only RLS policy applies", async () => {
  const { createBetaFeedbackRepository } = await import("../src/repositories/betaFeedbackRepository.js");
  const calls = [];
  const chain = { insert: (payload) => { calls.push(payload); return chain; }, then: (resolve) => resolve({ data: null, error: null, status: 201 }) };
  const client = { from: (table) => { assert.equal(table, "beta_feedback"); return chain; } };
  const result = await createBetaFeedbackRepository(client).insert({ userId: "u1", message: "Привет", context: "template_editor", projectId: "p1", sheetId: "s1" });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{ user_id: "u1", message: "Привет", context: "template_editor", project_id: "p1", sheet_id: "s1" }]);
});

/* ===== Migration ===== */

test("migration creates insert-only own-feedback RLS for beta_feedback", async () => {
  const migration = await source("supabase/migrations/20260819000000_create_beta_feedback.sql");
  assert.match(migration, /create table public\.beta_feedback/);
  assert.match(migration, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /message text not null/);
  assert.match(migration, /context text/);
  assert.match(migration, /project_id text/);
  assert.match(migration, /sheet_id text/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /alter table public\.beta_feedback enable row level security/);
  assert.match(migration, /create policy "beta_feedback_insert_own" on public\.beta_feedback for insert to authenticated[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(migration, /create policy[^;]*for select/);
  assert.match(migration, /grant insert on table public\.beta_feedback to authenticated/);
});

/* ===== Kubiki wiring ===== */

test("kubiki wires feedback modal with page/project/sheet context", async () => {
  const app = await source("src/kubiki.jsx");
  assert.match(app, /const \[feedbackOpen, setFeedbackOpen\] = useState\(false\)/);
  assert.match(app, /const feedbackContext = useMemo\(/);
  assert.match(app, /"template_editor"/);
  assert.match(app, /activeSheetId\(currentProject\)/);
  assert.match(app, /"knowledge_base"/);
  const openOccurrences = (app.match(/onOpenFeedback=\{\(\) => setFeedbackOpen\(true\)\}/g) || []).length;
  assert.ok(openOccurrences >= 3, `expected >=3 onOpenFeedback wiring, got ${openOccurrences}`);
  assert.match(app, /<BetaFeedbackModal userId=\{userId\} context=\{feedbackContext\} onClose=\{\(\) => setFeedbackOpen\(false\)\} \/>/);
});
