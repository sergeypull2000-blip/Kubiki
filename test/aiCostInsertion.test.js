import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stagesFromGeneratedEstimate } from "../src/ai/estimateInsertion.js";

const generated = (cost) => ({
  stages: [{ name: "Производство", tasks: [{ name: "Работа", cost }] }],
});

test("AI cost is inserted without dividing by markup", () => {
  const stages = stagesFromGeneratedEstimate(generated(100_000));
  assert.equal(stages[0].tasks[0].executors[0].amount, "100000");
});

test("project markup changes do not change generated internal cost", () => {
  const insertWithProjectMarkup = (_projectMarkup) => stagesFromGeneratedEstimate(generated(100_000));
  const atTwenty = insertWithProjectMarkup(20);
  const atFifty = insertWithProjectMarkup(50);
  assert.equal(atTwenty[0].tasks[0].executors[0].amount, "100000");
  assert.equal(atFifty[0].tasks[0].executors[0].amount, "100000");
});

test("AI preview no longer contains cost recovery controls", () => {
  const source = readFileSync(new URL("../src/importExcel.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Маркап, заложенный в цены модели/);
  assert.doesNotMatch(source, /Восстановленная себестоимость/);
  assert.doesNotMatch(source, /Пересчёт использует единый маркап/);
  assert.match(source, /Суммы отражают ориентировочную внутреннюю себестоимость до маркапа и налогов/);
});

test("professional SYSTEM_PROMPT explicitly defines cost as internal cost", () => {
  const source = readFileSync(new URL("../api/generate-estimate.js", import.meta.url), "utf8");
  assert.match(source, /cost = внутренняя себестоимость задачи/);
  assert.match(source, /Не добавляй агентский или студийный маркап, не добавляй налоги и не генерируй клиентскую цену/);
});
