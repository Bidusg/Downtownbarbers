/* Enkel testscript for src/lib/pricing.ts.
 * Kjør: node node_modules/jiti/lib/jiti-cli.mjs scripts/test-pricing.ts */
import assert from "node:assert/strict";
import { calcPrice, prettyUp9, suggestPrice, toNum } from "../src/lib/pricing";

let n = 0;
function t(fn: () => void) {
  fn();
  n++;
}
const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

// Tap
t(() => {
  const c = calcPrice({ priceInkl: 199, cost: 220, stock: 5 });
  assert.equal(c.priceEks, 159.2);
  assert.equal(c.profit !== null && Math.round(c.profit * 100) / 100, -60.8);
  assert.equal(r3(c.margin), -0.382);
  assert.equal(c.level, "tap");
  assert.equal(c.stockValueCost, 1100);
});
// Lav
t(() => {
  const c = calcPrice({ priceInkl: 359, cost: 239 });
  assert.equal(r3(c.margin), 0.168);
  assert.equal(c.level, "lav");
});
// Høy
t(() => {
  const c = calcPrice({ priceInkl: 39, cost: 3.7 });
  assert.equal(r3(c.margin), 0.881);
  assert.equal(c.level, "høy");
});
// Lav, nøyaktig 0.25
t(() => {
  const c = calcPrice({ priceInkl: 299, cost: 179.4 });
  assert.equal(r3(c.margin), 0.25);
  assert.equal(c.level, "lav");
});
// OK
t(() => {
  const c = calcPrice({ priceInkl: 250, cost: 80 });
  assert.equal(c.priceEks, 200);
  assert.equal(c.margin, 0.6);
  assert.equal(c.markup, 1.5);
  assert.equal(c.level, "ok");
});

// prettyUp9
for (const [inp, out] of [
  [372.5, 379],
  [550, 559],
  [448.5, 449],
  [449, 449],
  [0.2, 9],
  [10, 19],
] as const) {
  t(() => assert.equal(prettyUp9(inp), out, `prettyUp9(${inp})`));
}

// suggestPrice
t(() => assert.equal(suggestPrice(220, 0.5), 559));
t(() => assert.equal(suggestPrice(239), 599));
t(() => assert.equal(suggestPrice(149), 379));
t(() => assert.equal(suggestPrice(179.4), 449));
t(() => assert.equal(suggestPrice(0), null));
t(() => assert.equal(suggestPrice(100, 1), null));

// Kanttilfeller
t(() => {
  const c = calcPrice({ priceInkl: 0, cost: 10 });
  assert.equal(c.margin, null);
  assert.ok(!Number.isNaN(c.margin));
});
t(() => {
  const c = calcPrice({ priceInkl: 100, cost: null, stock: 3 });
  assert.equal(c.level, "mangler");
  assert.equal(c.stockValueCost, null);
});
t(() => assert.equal(calcPrice({ priceInkl: 100, cost: 10, stock: -4 }).stock, 0));
t(() => assert.equal(toNum("89,50"), 89.5));
t(() => {
  const c = calcPrice({ priceInkl: NaN, cost: NaN, stock: NaN });
  assert.equal(c.priceInkl, null);
  assert.equal(c.priceEks, null);
  assert.equal(c.cost, null);
  assert.equal(c.profit, null);
  assert.equal(c.margin, null);
  assert.equal(c.stockValueCost, null);
  assert.equal(c.stockValueRetail, null);
});

console.log(`OK ${n} tester`);
