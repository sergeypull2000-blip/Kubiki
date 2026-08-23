import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("parse-excel endpoint authenticates before touching request body", () => {
  const source = readFileSync(new URL("../api/parse-excel.js", import.meta.url), "utf8");
  assert.ok(source.indexOf("authenticateRequest(req)") < source.indexOf("req.body"));
});

test("parse-excel diagnostics never log provider bodies or model response fragments", () => {
  const source = readFileSync(new URL("../api/parse-excel.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /errText|clean\.slice|parseErr\.message|console\.error\([^\n]*,\s*e\)/);
  assert.match(source, /requestId.*stage.*status.*durationMs.*category/);
  assert.match(source, /responseLength/);
});

test("import client uses the cookie-session API transport", () => {
  const source = readFileSync(new URL("../src/importExcel.jsx", import.meta.url), "utf8");
  assert.match(source, /kubikiApiRequest\("\/api\/parse-excel"/);
  assert.doesNotMatch(source, /Authorization|supabaseClient|access_token/);
});

test("legacy import endpoint has no wildcard CORS and hides provider configuration", () => {
  const source = readFileSync(new URL("../api/parse-excel.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Access-Control-Allow-Origin/);
  assert.doesNotMatch(source, /json\(\{ error: [^\n]*(DEEPSEEK_API_KEY|AI_API_KEY|Vercel)/);
});

test("PDF import pins the patched library and disables scripting", () => {
  const source = readFileSync(new URL("../src/importExcel.jsx", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.dependencies["pdfjs-dist"], "6.2.108");
  assert.match(source, /enableScripting:\s*false/);
  assert.match(source, /isEvalSupported:\s*false/);
});
