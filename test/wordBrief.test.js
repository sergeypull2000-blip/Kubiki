import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeLegacyDocPayload, extractLegacyDoc, MAX_LEGACY_DOC_BYTES } from "../api/_lib/legacyDoc.js";
import { extractDocxText, extractLegacyDocText, normalizeExtractedWordText, wordExtension } from "../src/ai/wordBrief.js";

const file = (name, bytes = new Uint8Array([1, 2, 3])) => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer });

test("Word extension and extracted text normalization are deterministic", () => {
  assert.equal(wordExtension("BRIEF.DOCX"), "docx");
  assert.equal(wordExtension("brief.doc"), "doc");
  assert.equal(wordExtension("brief.doc.exe"), "");
  assert.equal(normalizeExtractedWordText(" A\r\n\r\n\r\n B\u0000 "), "A\n\nB");
  assert.throws(() => normalizeExtractedWordText(""), /не найден текст/);
});

test("DOCX is extracted in browser and only plain text is returned", async () => {
  const input = file("brief.docx");
  const text = await extractDocxText(input, { extractRawText: async ({ arrayBuffer }) => {
    assert.equal(arrayBuffer.byteLength, 3);
    return { value: "Первый абзац\n\nВторой" };
  } });
  assert.equal(text, "Первый абзац\n\nВторой");
});

test("legacy DOC client sends authenticated base64 only to extraction endpoint", async () => {
  const text = await extractLegacyDocText(file("legacy.doc"), {
    getAccessToken: async () => "jwt",
    fetchImpl: async (url, init) => {
      assert.equal(url, "/api/extract-doc");
      assert.equal(init.headers.Authorization, "Bearer jwt");
      const body = JSON.parse(init.body);
      assert.equal(body.filename, "legacy.doc");
      assert.equal(body.contentBase64, "AQID");
      return { ok: true, json: async () => ({ text: "Текст" }) };
    },
  });
  assert.equal(text, "Текст");
});

test("legacy DOC payload enforces extension, size and OLE signature", () => {
  assert.equal(decodeLegacyDocPayload({ filename: "x.docx", contentBase64: "AQID" }).status, 400);
  assert.equal(decodeLegacyDocPayload({ filename: "x.doc", contentBase64: "AQID" }).status, 422);
  const tooLarge = Buffer.alloc(MAX_LEGACY_DOC_BYTES + 1).toString("base64");
  assert.equal(decodeLegacyDocPayload({ filename: "x.doc", contentBase64: tooLarge }).status, 413);
});

test("legacy DOC extractor returns cleaned text and safe fallback", async () => {
  const success = await extractLegacyDoc(Buffer.alloc(16), { createExtractor: () => ({ extract: async () => ({ getBody: () => " A\u0000\r\n B " }) }) });
  assert.deepEqual(success, { ok: true, text: "A\n B" });
  const failure = await extractLegacyDoc(Buffer.alloc(16), { createExtractor: () => ({ extract: async () => { throw new Error("parser internals"); } }) });
  assert.equal(failure.status, 422);
  assert.doesNotMatch(failure.error, /parser internals/);
});

test("legacy DOC endpoint authenticates before decoding and never invokes AI", () => {
  const source = readFileSync(new URL("../api/extract-doc.js", import.meta.url), "utf8");
  assert.ok(source.indexOf("authenticateRequest(req)") < source.indexOf("decodeLegacyDocPayload(req.body)"));
  assert.doesNotMatch(source, /deepseek|generate-estimate/i);
});

test("Word UI sends extracted text through the existing generation flow", () => {
  const source = readFileSync(new URL("../src/importExcel.jsx", import.meta.url), "utf8");
  assert.match(source, /extractWordBrief\(file\)/);
  assert.match(source, /llmGenerateEstimate\(text, instruction\)/);
  assert.match(source, /accept="\.xlsx,\.xls,\.pdf,\.docx,\.doc"/);
});
