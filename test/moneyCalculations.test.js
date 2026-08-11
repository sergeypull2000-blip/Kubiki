import test from "node:test";
import assert from "node:assert/strict";
import {
  executorSum,
  projectPrice,
  projectTaxAmount,
  projectVatAmount,
  projectTotalWithTax,
} from "../src/calculations.js";
import { fmt, numVal } from "../src/utils.js";

const fixedExecutor = (amount, tax = "") => ({
  amount,
  tags: [
    { key: "payment", payment: { type: "fix_total" } },
    ...(tax === "" ? [] : [{ key: "tax", value: tax }]),
  ],
});

test("денежный ввод и вывод сохраняют копейки", () => {
  assert.equal(numVal("1 234,56"), 1234.56);
  assert.equal(fmt(1234.56), "1 234,56");
});

test("налог исполнителя считается делением и округляется до копеек", () => {
  assert.equal(executorSum(fixedExecutor("1000,25", "6")), 1064.1);
});

test("ставка за единицу умножается на количество единиц", () => {
  const executor = {
    amount: "999999",
    tags: [{ key: "payment", payment: { type: "fix_task", rate: "1250,50", units: "4" } }],
  };
  assert.equal(executorSum(executor), 5002);
});

test("маркап, налог проекта и НДС сохраняют копейки", () => {
  const project = {
    globalMarkup: "12,5",
    markupMode: "embedded",
    tax: { percent: "6" },
    vat: { percent: "20" },
    stages: [{ tasks: [{ markupOverride: null, executors: [fixedExecutor("1000,25")] }] }],
  };
  assert.equal(projectPrice(project), 1125.28);
  assert.equal(projectTaxAmount(project), 67.52);
  assert.equal(projectVatAmount(project), 238.56);
  assert.equal(projectTotalWithTax(project), 1431.36);
});
