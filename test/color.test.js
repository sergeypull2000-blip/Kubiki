import assert from "node:assert/strict";
import test from "node:test";
import { clamp, hexToRgb, hsvToHex, hsvToRgb, normalizeHex, rgbToHex, rgbToHsv } from "../src/color.js";

test("hexToRgb ↔ rgbToHex round-trips arbitrary colors", () => {
  for (const hex of ["#1a2230", "#aabbcc", "#0a2b4c", "#ffffff", "#000000", "#ff0000", "#00ff00", "#0000ff", "#123456", "#fedcba", "#7f3fbf", "#99dd11"]) {
    assert.equal(rgbToHex(hexToRgb(hex)), hex);
  }
});

test("hsvToRgb ↔ rgbToHsv round-trips colors", () => {
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#1a2230", "#aabbcc", "#5b8def", "#f97316", "#0a2b4c"]) {
    assert.equal(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex)))), hex);
  }
});

test("hsvToHex emits lowercase #rrggbb", () => {
  assert.equal(hsvToHex({ h: 0, s: 1, v: 1 }), "#ff0000");
  assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), "#00ff00");
  assert.equal(hsvToHex({ h: 240, s: 1, v: 1 }), "#0000ff");
  assert.match(hsvToHex({ h: 211, s: 0.49, v: 0.64 }), /^#[0-9a-f]{6}$/);
});

test("normalizeHex accepts any 6-digit hex and rejects invalid input", () => {
  assert.equal(normalizeHex("#1A2230"), "#1a2230");
  assert.equal(normalizeHex("1A2230"), "#1a2230");
  assert.equal(normalizeHex("#0a2b4c"), "#0a2b4c");
  assert.equal(normalizeHex("#7F3FBF"), "#7f3fbf");
  assert.equal(normalizeHex("red"), null);
  assert.equal(normalizeHex("#12345"), null);
  assert.equal(normalizeHex("#1234567"), null);
  assert.equal(normalizeHex(""), null);
});

test("clamp bounds values", () => {
  assert.equal(clamp(-0.2, 0, 1), 0);
  assert.equal(clamp(1.4, 0, 1), 1);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});
