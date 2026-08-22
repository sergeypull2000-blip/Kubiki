import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchFreshLogoDataUrl } from "../src/exportLogo.js";

test("fresh logo URL is used even when preview still has a stale signed URL", async () => {
  const urls = [];
  let signedCalls = 0;
  const blob = new Blob(["logo"], { type: "image/jpeg" });
  globalThis.FileReader = class { readAsDataURL() { this.result = "data:image/jpeg;base64,cmVn"; queueMicrotask(() => this.onload()); } };
  const dataUrl = await fetchFreshLogoDataUrl("users/u/export-logos/logo.jpg", {
    logoRepository: { createLogoUrl: async () => `https://fresh-${++signedCalls}.example/logo` },
    fetchImpl: async (url) => { urls.push(url); return { ok: true, blob: async () => blob }; },
  });
  assert.equal(dataUrl, "data:image/jpeg;base64,cmVn");
  assert.deepEqual(urls, ["https://fresh-1.example/logo"]);
  assert.equal(signedCalls, 1);
});

test("final PDF export resolves the logo from the asset path, not preview URL state", () => {
  const source = readFileSync(new URL("../src/exportFiles.jsx", import.meta.url), "utf8");
  assert.match(source, /fetchFreshLogoDataUrl\(model\.brand\.logoAssetPath/);
  assert.match(source, /logoRepository = exportProfileRepository/);
  assert.match(source, /fetchImpl = fetch/);
});
