import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("parse-excel endpoint authenticates before touching request body", () => {
  const source = readFileSync(new URL("../api/parse-excel.js", import.meta.url), "utf8");
  assert.ok(source.indexOf("authenticateRequest(req)") < source.indexOf("req.body"));
});

test("import client sends bearer token to parse-excel", () => {
  const source = readFileSync(new URL("../src/importExcel.jsx", import.meta.url), "utf8");
  assert.match(source, /Authorization: `Bearer \$\{token\}`/);
});
