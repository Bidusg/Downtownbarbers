import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toNum, round2, eksFromInkl, inklFromEks, marginLevel, calcPrice,
  prettyUp9, suggestPrice, LEVEL_LABEL, MVA, TARGET_MARGIN, LOW_MARGIN, HIGH_MARGIN,
} from "../../src/lib/pricing.ts";

test("konstanter", () => {
  assert.equal(MVA, 0.25);
  assert.equal(TARGET_MARGIN, 0.5);
  assert.equal(LOW_MARGIN, 0.4);
  assert.equal(HIGH_MARGIN, 0.8);
});

test("toNum", () => {
  assert.equal(toNum(null), null);
  assert.equal(toNum(undefined), null);
  assert.equal(toNum(""), null);
  assert.equal(toNum("89,50"), 89.5);
  assert.equal(toNum("1 234,5"), 1234.5);
  assert.equal(toNum(12), 12);
  assert.equal(toNum(NaN), null);
  assert.equal(toNum(Infinity), null);
  assert.equal(toNum("abc"), null);
  assert.equal(toNum(0), 0);
  // MISTENKELIG: bare mellomrom gir 0, ikke null (Number("") === 0).
  assert.equal(toNum("   "), 0);
  // MISTENKELIG: [] castes via String -> Number og blir 0.
  assert.equal(toNum([]), 0);
});

test("round2", () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.345), 2.35);
  assert.equal(round2(10), 10);
  assert.equal(round2(-1.234), -1.23);
});

test("eks/inkl", () => {
  assert.equal(eksFromInkl(125), 100);
  assert.equal(inklFromEks(100), 125);
  assert.equal(eksFromInkl(0), 0);
});

test("marginLevel grenser", () => {
  assert.equal(marginLevel(null), "mangler");
  assert.equal(marginLevel(-0.01), "tap");
  assert.equal(marginLevel(0), "lav");
  assert.equal(marginLevel(0.399), "lav");
  assert.equal(marginLevel(0.4), "ok");
  assert.equal(marginLevel(0.799), "ok");
  assert.equal(marginLevel(0.8), "høy");
  assert.equal(marginLevel(1), "høy");
});

test("calcPrice normal", () => {
  const c = calcPrice({ priceInkl: 250, cost: 100, stock: 3 });
  assert.equal(c.priceEks, 200);
  assert.equal(c.profit, 100);
  assert.equal(c.margin, 0.5);
  assert.equal(c.markup, 1);
  assert.equal(c.stock, 3);
  assert.equal(c.stockValueCost, 300);
  assert.equal(c.stockValueRetail, 750);
  assert.equal(c.stockValueRetailEks, 600);
  assert.equal(c.level, "ok");
});

test("calcPrice tåler søppel", () => {
  const c = calcPrice({ priceInkl: "x", cost: undefined });
  assert.equal(c.priceInkl, null);
  assert.equal(c.profit, null);
  assert.equal(c.margin, null);
  assert.equal(c.markup, null);
  assert.equal(c.stockValueCost, null);
  assert.equal(c.stockValueRetail, null);
  assert.equal(c.level, "mangler");
  assert.equal(c.stock, 0);
});

test("calcPrice komma-input og negativt lager", () => {
  const c = calcPrice({ priceInkl: "125,00", cost: "50", stock: -4 });
  assert.equal(c.priceEks, 100);
  assert.equal(c.margin, 0.5);
  assert.equal(c.stock, 0);
  assert.equal(c.stockValueCost, 0);
});

test("calcPrice lager rundes ned", () => {
  assert.equal(calcPrice({ priceInkl: 100, cost: 10, stock: 2.9 }).stock, 2);
});

test("calcPrice negativ innkjøp ignoreres, tap-nivå", () => {
  assert.equal(calcPrice({ priceInkl: 100, cost: -5 }).cost, null);
  const loss = calcPrice({ priceInkl: 125, cost: 150 });
  assert.equal(loss.profit, -50);
  assert.equal(loss.level, "tap");
});

test("calcPrice innkjøp 0: markup null, margin 1", () => {
  const c = calcPrice({ priceInkl: 125, cost: 0 });
  assert.equal(c.markup, null);
  assert.equal(c.margin, 1);
  assert.equal(c.level, "høy");
});

test("calcPrice pris 0: margin null", () => {
  const c = calcPrice({ priceInkl: 0, cost: 10 });
  assert.equal(c.margin, null);
  assert.equal(c.level, "mangler");
  assert.equal(c.stockValueRetail, 0);
});

test("calcPrice negativ pris", () => {
  const c = calcPrice({ priceInkl: -10, cost: 10, stock: 2 });
  assert.equal(c.priceEks, null);
  assert.equal(c.stockValueRetail, null);
});

test("prettyUp9", () => {
  assert.equal(prettyUp9(372.5), 379);
  assert.equal(prettyUp9(550), 559);
  assert.equal(prettyUp9(449), 449);
  assert.equal(prettyUp9(450), 459);
  assert.equal(prettyUp9(0), 9);
  assert.equal(prettyUp9(9.0000000001), 9);
  assert.ok(Number.isNaN(prettyUp9(NaN)));
  assert.ok(Number.isNaN(prettyUp9(Infinity)));
});

test("suggestPrice", () => {
  // 100 / 0.5 = 200 eks -> 250 inkl -> 259
  assert.equal(suggestPrice(100), 259);
  assert.equal(suggestPrice("100,00"), 259);
  assert.equal(suggestPrice(100, 0), 129); // 125 -> 129
  assert.equal(suggestPrice(null), null);
  assert.equal(suggestPrice(0), null);
  assert.equal(suggestPrice(-1), null);
  assert.equal(suggestPrice(100, 1), null);
  assert.equal(suggestPrice(100, -0.1), null);
  assert.equal(suggestPrice(100, NaN), null);
});

test("suggestPrice gir aldri lavere margin enn mål", () => {
  for (const cost of [10, 33.3, 87.5, 199, 412.77]) {
    for (const m of [0.3, 0.5, 0.65]) {
      const p = suggestPrice(cost, m)!;
      const margin = calcPrice({ priceInkl: p, cost }).margin!;
      assert.ok(margin >= m - 1e-9, `cost ${cost} m ${m} -> ${p} gir ${margin}`);
    }
  }
});

test("LEVEL_LABEL dekker alle nivåer", () => {
  for (const k of ["mangler", "tap", "lav", "ok", "høy"] as const) {
    assert.equal(typeof LEVEL_LABEL[k], "string");
  }
});
