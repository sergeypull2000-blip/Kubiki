import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("signup legal checkboxes are separate, controlled and false by default", async () => {
  const auth = await source("src/AuthScreen.jsx");
  assert.match(auth, /termsAccepted, setTermsAccepted\] = useState\(false\)/);
  assert.match(auth, /personalDataAccepted, setPersonalDataAccepted\] = useState\(false\)/);
  assert.match(auth, /disabled=\{submitting \|\| \(view === 'signup' && \(!termsAccepted \|\| !personalDataAccepted\)\)\}/);
  for (const href of ["/terms", "/personal-data-consent", "/privacy"]) assert.match(auth, new RegExp(`href="${href}"`));
});

test("legal records are owner-scoped and version-unique", async () => {
  const [migration, repository, routes] = await Promise.all([source("db/migrations/005_user_legal_acceptances.sql"), source("server/repositories/ownerApiRepository.js"), source("server/ownerApiRoutes.js")]);
  assert.match(migration, /primary key \(user_id, document_key, version\)/i);
  assert.match(migration, /references public\.users \(id\) on delete cascade/i);
  assert.match(repository, /where user_id=\$1/);
  assert.match(repository, /values\(\$1,\$2,\$3\)/);
  assert.match(routes, /acceptLegalDocument\(userId,documentKey,version\)/);
});

test("signup requires both legal flags server-side and records both version 1.0 documents", async () => {
  const [bridge, signupRepository, client, authConfig] = await Promise.all([source("server/betterAuthHttp.js"), source("server/repositories/legalAcceptanceRepository.js"), source("src/backend/betterAuthClient.js"), source("server/auth.js")]);
  assert.match(bridge, /acceptedBetaTerms !== true \|\| signUpBody\?\.acceptedPersonalDataConsent !== true/);
  assert.match(client, /acceptedBetaTerms: true, acceptedPersonalDataConsent: true/);
  assert.match(signupRepository, /'beta_terms',\$2/);
  assert.match(signupRepository, /'personal_data_consent',\$2/);
  assert.match(signupRepository, /LEGAL_DOCUMENT_VERSIONS\.beta_terms/);
  assert.match(signupRepository, /LEGAL_DOCUMENT_VERSIONS\.personal_data_consent/);
  assert.match(signupRepository, /delete from auth\."user"\s+where id=\$1/);
  assert.match(bridge, /rollbackSignUp\(result\.user\.id\)/);
  assert.match(bridge, /await sendSignUpVerificationEmail/);
  assert.match(authConfig, /sendOnSignUp: false/);
  assert.match(authConfig, /requireEmailVerification: true/);
  assert.doesNotMatch(client, /user_id|userId/);
});

test("approved legal copy uses only centralized operator and email values", async () => {
  const [config, documents] = await Promise.all([source("src/legalConfig.js"), source("src/legalDocuments.jsx")]);
  assert.match(config, /operator: "Соломин Сергей Евгеньевич"/);
  assert.equal((config.match(/sersolwork@yandex\.ru/g) || []).length, 2);
  assert.doesNotMatch(config, /address|адрес/i);
  for (const exactText of [
    "Kubiki отдельно не сохраняет полные исходные prompts и полные ответы DeepSeek как журнал AI-переписки.",
    "Основная инфраструктура Kubiki — сервер приложения, PostgreSQL и файловое хранилище — размещается в Российской Федерации.",
    "Платный доступ не подключается автоматически.",
    "Согласие распространяется на автоматизированные действия с персональными данными",
  ]) assert.ok(documents.includes(exactText));
});

test("all AI endpoints are blocked server-side for the current disclosure version", async () => {
  const [app, versions] = await Promise.all([source("server/app.js"), source("src/legalConfig.js")]);
  for (const path of ["/api/generate-estimate", "/api/edit-estimate", "/api/parse-excel"]) assert.ok(app.includes(path));
  assert.match(app, /hasLegalAcceptance\(authContext\.user\.id, "ai_disclosure", LEGAL_DOCUMENT_VERSIONS\.ai_disclosure\)/);
  assert.match(app, /return sendJson\(response, 428/);
  assert.match(versions, /ai_disclosure: "1\.0"/);
});

test("AI cancel rejects pending action and continue persists before resolving", async () => {
  const [provider, modal, importUi, editClient] = await Promise.all([source("src/components/AiDisclosureProvider.jsx"), source("src/components/AiDisclosureModal.jsx"), source("src/importExcel.jsx"), source("src/ai/editClient.js")]);
  assert.match(provider, /await legalAcceptancesRepository\.accept/);
  assert.ok(provider.indexOf("await legalAcceptancesRepository.accept") < provider.indexOf("pending.current.splice(0).forEach"));
  assert.match(provider, /requests\.forEach\(\(\{ reject \}\) => reject/);
  assert.match(modal, /Отмена/); assert.match(modal, /Продолжить/);
  assert.ok((importUi.match(/await requireAiDisclosure\(\)/g) || []).length >= 2);
  assert.match(editClient, /await requireAiDisclosure\(\)/);
});

test("legal routes are public entry routes and AI results carry a review label", async () => {
  const [app, documents, importUi, editUi] = await Promise.all([source("src/App.jsx"), source("src/legalDocuments.jsx"), source("src/importExcel.jsx"), source("src/components/AiEditTechnicalModal.jsx")]);
  for (const route of ["/privacy", "/personal-data-consent", "/terms"]) assert.ok(documents.includes(`"${route}"`));
  assert.match(app, /if \(isLegalRoute\(pathname\)\) return/);
  assert.match(importUi, /Сгенерировано с помощью ИИ · Проверьте результат/);
  assert.match(editUi, /Сгенерировано с помощью ИИ · Проверьте результат/);
});
