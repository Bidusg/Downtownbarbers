import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNumber, normName, parseCostSheet, matchCostRows,
  type ImportRow, type ImportProduct,
} from "../../src/lib/cost-import.ts";

/* ---------- parseNumber ---------- */

test("parseNumber: norske og engelske formater", () => {
  assert.equal(parseNumber("1 234,50"), 1234.5);
  assert.equal(parseNumber("1.234,50"), 1234.5);
  assert.equal(parseNumber("1,234.50"), 1234.5);
  assert.equal(parseNumber("89.5"), 89.5);
  assert.equal(parseNumber("89,5"), 89.5);
  assert.equal(parseNumber("220 kr"), 220);
  assert.equal(parseNumber("kr 220"), 220);
  assert.equal(parseNumber("220 KR."), 220);
  assert.equal(parseNumber("1 234"), 1234); // nbsp som tusenskille
  assert.equal(parseNumber("-5"), -5);
  assert.equal(parseNumber("+5"), 5);
  assert.equal(parseNumber(".5"), 0.5);
  assert.equal(parseNumber(42), 42);
  assert.equal(parseNumber(0), 0);
  assert.equal(parseNumber("0"), 0);
});

test("parseNumber: tusenskille med punktum", () => {
  assert.equal(parseNumber("1.234"), 1234);
  assert.equal(parseNumber("1.234.567"), 1234567);
  // «12.345» er også tusen (norsk)
  assert.equal(parseNumber("12.345"), 12345);
  // To desimaler er desimal
  assert.equal(parseNumber("1.23"), 1.23);
  // MISTENKELIG: "0.500" blir 500 (tusenskille-regex godtar ledende 0), ikke 0.5. Samme for "0.123" -> 123.
  assert.equal(parseNumber("0.500"), 500);
});

test("parseNumber: ugyldig -> null", () => {
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber(undefined), null);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("   "), null);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber("kr"), null);
  assert.equal(parseNumber("12abc"), null);
  assert.equal(parseNumber("1,2,3"), null);
  assert.equal(parseNumber(NaN), null);
  assert.equal(parseNumber(Infinity), null);
  assert.equal(parseNumber({}), null);
  assert.equal(parseNumber(true), null);
  assert.equal(parseNumber("--5"), null);
});

/* ---------- normName ---------- */

test("normName", () => {
  assert.equal(normName("  Reuzel   Pomade  "), "reuzel pomade");
  assert.equal(normName("REUZEL"), "reuzel");
  assert.equal(normName("A-B"), "a - b");
  assert.equal(normName("A - B"), "a - b");
  assert.equal(normName("A–B"), "a - b"); // en-dash
  assert.equal(normName("A—B"), "a - b"); // em-dash
  assert.equal(normName("A−B"), "a - b"); // minus
  assert.equal(normName("A B"), "a b"); // nbsp
  assert.equal(normName(""), "");
  // Bindestrek i ord ("Anti-dandruff") skilles ut som " - "
  assert.equal(normName("Anti-dandruff"), "anti - dandruff");
  assert.equal(normName("Anti-dandruff"), normName("anti - dandruff"));
});

/* ---------- parseCostSheet: generisk layout ---------- */

test("parseCostSheet: standard overskrift", () => {
  const rows: unknown[][] = [
    ["Rapport 2026", "", ""],
    ["Strekkode", "Varenavn", "Merke", "Innkjøpspris", "Utsalg inkl. mva", "Kilde"],
    ["7041234567890", "Pomade Strong", "Reuzel", "89,50", "249", "Faktura"],
    [7041234567891, "Shampoo", "", 45, "", "Anslag fra Dawit"],
    ["", "", "", "", "", ""],
  ];
  const r = parseCostSheet(rows);
  assert.equal(r.costHeader, "Innkjøpspris");
  assert.deepEqual(r.warnings, []);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], {
    line: 3, barcode: "7041234567890", name: "Pomade Strong", brand: "Reuzel",
    cost: 89.5, priceInkl: 249, note: "Faktura", isEstimate: false,
  });
  assert.equal(r.rows[1].line, 4);
  assert.equal(r.rows[1].barcode, "7041234567891");
  assert.equal(r.rows[1].brand, null);
  assert.equal(r.rows[1].cost, 45);
  assert.equal(r.rows[1].priceInkl, null);
  assert.equal(r.rows[1].isEstimate, true);
});

test("parseCostSheet: 'Brukt innkjøp' har forrang foran Innkjøpspris", () => {
  const r = parseCostSheet([
    ["Strekkode", "Varenavn", "Innkjøpspris", "Brukt innkjøp"],
    ["1234567890123", "X", "10", "20"],
  ]);
  assert.equal(r.costHeader, "Brukt innkjøp");
  assert.equal(r.rows[0].cost, 20);
});

test("parseCostSheet: kostpris / innpris alias", () => {
  assert.equal(parseCostSheet([["Varenavn", "Kostpris"], ["A", "5"]]).rows[0].cost, 5);
  assert.equal(parseCostSheet([["Varenavn", "Innpris"], ["A", "6"]]).rows[0].cost, 6);
});

test("parseCostSheet: manglende kostkolonne", () => {
  const r = parseCostSheet([["Strekkode", "Varenavn"], ["123", "A"]]);
  assert.equal(r.rows.length, 0);
  assert.match(r.warnings[0], /ingen kolonne for innkjøpspris/);
});

test("parseCostSheet: ingen overskriftsrad", () => {
  const r = parseCostSheet([["a", "b"], ["c", "d"]]);
  assert.equal(r.rows.length, 0);
  assert.match(r.warnings[0], /Fant ingen overskriftsrad/);
  assert.deepEqual(parseCostSheet([]).rows, []);
});

test("parseCostSheet: uten strekkodekolonne -> advarsel, bare navn", () => {
  const r = parseCostSheet([["Varenavn", "Innkjøpspris"], ["A", "5"]]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].barcode, null);
  assert.ok(r.warnings.some((w) => /Ingen strekkodekolonne/.test(w)));
});

test("parseCostSheet: uten navnekolonne -> advarsel, bare strekkode", () => {
  const r = parseCostSheet([["Strekkode", "Innkjøpspris"], ["123", "5"]]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].name, "");
  assert.ok(r.warnings.some((w) => /Ingen navnekolonne/.test(w)));
});

test("parseCostSheet: strekkode som flyttall og med tekst", () => {
  const r = parseCostSheet([
    ["Strekkode", "Varenavn", "Innkjøpspris"],
    [7.041234567890e12, "A", 1],
    ["EAN 0012345", "B", 2],
  ]);
  assert.equal(r.rows[0].barcode, "7041234567890");
  assert.equal(r.rows[1].barcode, "0012345");
});

test("parseCostSheet: celle med dataverdi 'Strekkoder: 123' er ikke overskrift", () => {
  const r = parseCostSheet([
    ["Strekkoder: 12345678", "Varenavn", "Innkjøpspris"],
    ["x", "A", 1],
  ]);
  // Første celle blankes ut av isLabel; Varenavn finnes fortsatt, strekkode ikke.
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].barcode, null);
});

test("parseCostSheet: hopper over rader uten navn og strekkode, ugyldig kost -> null", () => {
  const r = parseCostSheet([
    ["Strekkode", "Varenavn", "Innkjøpspris"],
    ["", "", 5],
    ["123", "", "abc"],
  ]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].cost, null);
  assert.equal(r.rows[0].line, 3);
});

test("parseCostSheet: leter bare i de 30 første radene", () => {
  const filler: unknown[][] = Array.from({ length: 30 }, () => ["x"]);
  const r = parseCostSheet([...filler, ["Strekkode", "Varenavn", "Innkjøpspris"], ["1", "A", 1]]);
  assert.equal(r.rows.length, 0);
});

/* ---------- parseCostSheet: rå Fixit Lagerverdi ---------- */

const fixitHeader = ["txtProductName", "textbox25", "textbox27", "textbox34", "Textbox78", "Textbox80"];

test("parseCostSheet: rå Fixit-eksport", () => {
  const rows: unknown[][] = [
    ["Lagerverdi", "", "", "", "", ""],
    fixitHeader,
    ["Reuzel Pomade", "89,50", "Reuzel", "Innpris, eks mva", "7041234567890", "Strekkoder: 7041234567890 5555555555555 6666666666666"],
    ["Uten kode", "10", "", "Innpris, eks mva", "", ""],
    ["", "", "", "", "", ""],
    fixitHeader, // gjentatt overskrift (sideskift)
    ["Etter sideskift", "5", "Merke X", "", 1234567890123, "Strekkoder: 1234567890123"],
  ];
  const r = parseCostSheet(rows);
  assert.equal(r.rows.length, 3);
  assert.equal(r.costHeader, "Innpris, eks mva");
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /Rå Fixit-eksport gjenkjent/);

  const a = r.rows[0];
  assert.equal(a.line, 3);
  assert.equal(a.name, "Reuzel Pomade");
  assert.equal(a.cost, 89.5);
  assert.equal(a.brand, "Reuzel");
  assert.equal(a.barcode, "7041234567890");
  assert.deepEqual(a.altBarcodes, ["5555555555555", "6666666666666"]); // hovedkode ikke duplisert
  assert.equal(a.priceInkl, null);
  assert.equal(a.note, "Fixit: Innpris, eks mva");
  assert.equal(a.isEstimate, false);

  const b = r.rows[1];
  assert.equal(b.barcode, null);
  assert.deepEqual(b.altBarcodes, []);
  assert.equal(b.brand, null);

  const c = r.rows[2];
  assert.equal(c.line, 7);
  assert.equal(c.barcode, "1234567890123");
  assert.deepEqual(c.altBarcodes, []);
});

test("parseCostSheet: Fixit uten hovedstrekkode bruker første i Textbox80", () => {
  const r = parseCostSheet([
    ["txtProductName", "textbox25", "Textbox80"],
    ["A", "5", "Strekkoder: 111, 222; 333"],
  ]);
  assert.equal(r.rows[0].barcode, "111");
  assert.deepEqual(r.rows[0].altBarcodes, ["222", "333"]);
  // Ingen kolonne for mode -> bare "Fixit"
  assert.equal(r.rows[0].note, "Fixit");
  assert.match(r.warnings[0], /Innpris \(Fixit\)/);
});

test("parseCostSheet: Fixit uten textbox25", () => {
  const r = parseCostSheet([["txtProductName", "Textbox78"], ["A", "123"]]);
  assert.equal(r.rows.length, 0);
  assert.match(r.warnings[0], /textbox25/);
});

test("parseCostSheet: Fixit overskrift er case-insensitiv", () => {
  const r = parseCostSheet([["TXTPRODUCTNAME", "TEXTBOX25"], ["A", "7"]]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].cost, 7);
});

test("parseCostSheet: Fixit ugyldig kost -> null kost", () => {
  const r = parseCostSheet([["txtProductName", "textbox25"], ["A", "n/a"]]);
  assert.equal(r.rows[0].cost, null);
});

/* ---------- matchCostRows ---------- */

const P = (id: string, name: string, barcode: string | null, extra: Partial<ImportProduct> = {}): ImportProduct => ({
  id, name, barcode, brand: null, price_nok: 100, stock: 1, ...extra,
});
const R = (line: number, extra: Partial<ImportRow> = {}): ImportRow => ({
  line, barcode: null, name: "", brand: null, cost: 10, priceInkl: null, note: null, isEstimate: false, ...extra,
});

test("match: strekkode eksakt", () => {
  const res = matchCostRows(
    [R(2, { barcode: "7041", name: "Annet navn", cost: 50 })],
    [P("a", "Pomade", "7041", { price_nok: 249 })],
    {},
  );
  assert.equal(res.matched.length, 1);
  const m = res.matched[0];
  assert.equal(m.productId, "a");
  assert.equal(m.matchedBy, "strekkode");
  assert.equal(m.newCost, 50);
  assert.equal(m.oldCost, null);
  assert.equal(m.dbPrice, 249);
  assert.equal(m.filePrice, null);
  assert.equal(m.priceDiff, null);
});

test("match: oldCost fra existing", () => {
  const res = matchCostRows([R(2, { barcode: "1" })], [P("a", "X", "1")], { a: { cost_nok: 33 } });
  assert.equal(res.matched[0].oldCost, 33);
});

test("match: ledende nuller strippes begge veier", () => {
  const a = matchCostRows([R(2, { barcode: "0012345" })], [P("p", "X", "12345")], {});
  assert.equal(a.matched[0].productId, "p");
  assert.equal(a.matched[0].matchedBy, "strekkode");
  const b = matchCostRows([R(2, { barcode: "12345" })], [P("p", "X", "0012345")], {});
  assert.equal(b.matched[0].productId, "p");
});

test("match: eksakt har forrang over strippet", () => {
  const res = matchCostRows(
    [R(2, { barcode: "0012345" })],
    [P("exact", "A", "0012345"), P("loose", "B", "12345")],
    {},
  );
  assert.equal(res.matched[0].productId, "exact");
});

test("match: alternative strekkoder", () => {
  const res = matchCostRows(
    [R(2, { barcode: "999", altBarcodes: ["888", "777"], name: "Zzz" })],
    [P("p", "Pomade", "777")],
    {},
  );
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].productId, "p");
  assert.equal(res.matched[0].matchedBy, "strekkode");
});

test("match: produktstrekkode med ikke-sifre normaliseres", () => {
  const res = matchCostRows([R(2, { barcode: "12345" })], [P("p", "X", " 123-45 ")], {});
  assert.equal(res.matched[0].productId, "p");
});

test("match: navn-fallback, case og bindestrek-insensitiv", () => {
  const res = matchCostRows(
    [R(2, { name: "ANTI-dandruff  Shampoo" })],
    [P("p", "anti - dandruff shampoo", null)],
    {},
  );
  assert.equal(res.matched[0].matchedBy, "navn");
  assert.equal(res.matched[0].productId, "p");
});

test("match: strekkode uten treff faller tilbake til navn", () => {
  const res = matchCostRows([R(2, { barcode: "000", name: "Pomade" })], [P("p", "Pomade", "111")], {});
  assert.equal(res.matched[0].matchedBy, "navn");
});

test("match: navn med flere treff snevres inn på merke", () => {
  const products = [
    P("a", "Pomade", null, { brand: "Reuzel" }),
    P("b", "Pomade", null, { brand: "Layrite" }),
  ];
  const res = matchCostRows([R(2, { name: "Pomade", brand: "  LAYRITE " })], products, {});
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].productId, "b");
  assert.equal(res.ambiguous.length, 0);
});

test("match: navn med flere treff og ingen merketreff -> tvetydig", () => {
  const products = [
    P("a", "Pomade", null, { brand: "Reuzel" }),
    P("b", "Pomade", null, { brand: "Layrite" }),
  ];
  const res = matchCostRows([R(2, { name: "Pomade", brand: "Annet" })], products, {});
  assert.equal(res.matched.length, 0);
  assert.equal(res.ambiguous.length, 1);
  assert.equal(res.ambiguous[0].reason, "navnet finnes på flere varer");
  assert.deepEqual(res.ambiguous[0].candidates.map((c) => c.id), ["a", "b"]);
});

test("match: navn flere treff uten merke i fil -> tvetydig", () => {
  const res = matchCostRows(
    [R(2, { name: "Pomade" })],
    [P("a", "Pomade", null), P("b", "Pomade", null)],
    {},
  );
  assert.equal(res.ambiguous.length, 1);
});

test("match: samme strekkode på flere varer -> tvetydig, maks 5 kandidater", () => {
  const products = Array.from({ length: 7 }, (_, i) => P(`p${i}`, `Vare ${i}`, "555"));
  const res = matchCostRows([R(2, { barcode: "555" })], products, {});
  assert.equal(res.ambiguous.length, 1);
  assert.equal(res.ambiguous[0].reason, "strekkoden finnes på flere varer");
  assert.equal(res.ambiguous[0].candidates.length, 5);
});

test("match: strippet strekkode på flere varer -> tvetydig", () => {
  const res = matchCostRows(
    [R(2, { barcode: "12345" })],
    [P("a", "A", "012345"), P("b", "B", "0012345")],
    {},
  );
  assert.equal(res.ambiguous.length, 1);
});

test("match: tvetydig strekkode faller IKKE videre til navn", () => {
  const res = matchCostRows(
    [R(2, { barcode: "555", name: "Unik" })],
    [P("a", "A", "555"), P("b", "B", "555"), P("c", "Unik", null)],
    {},
  );
  assert.equal(res.ambiguous.length, 1);
  assert.equal(res.matched.length, 0);
});

test("match: ingen treff -> unmatched", () => {
  const res = matchCostRows([R(2, { barcode: "1", name: "Finnes ikke", brand: "M" })], [P("a", "Annet", "2")], {});
  assert.equal(res.unmatched.length, 1);
  assert.equal(res.unmatched[0].reason, "fant ingen vare");
  assert.equal(res.unmatched[0].brand, "M");
  assert.equal(res.unmatched[0].line, 2);
});

test("match: rad uten navn og uten treff på strekkode -> unmatched", () => {
  const res = matchCostRows([R(2, { barcode: "1" })], [P("a", "A", "2")], {});
  assert.equal(res.unmatched.length, 1);
});

test("match: duplikat av samme vare i fila", () => {
  const res = matchCostRows(
    [R(2, { barcode: "1", cost: 10 }), R(9, { barcode: "1", cost: 20 })],
    [P("a", "A", "1")],
    {},
  );
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].newCost, 10); // første vinner
  assert.equal(res.ambiguous.length, 1);
  assert.equal(res.ambiguous[0].line, 9);
  assert.equal(res.ambiguous[0].reason, "samme vare som linje 2 i fila");
  assert.deepEqual(res.ambiguous[0].candidates, [{ id: "a", name: "A" }]);
});

test("match: ugyldig innkjøpspris", () => {
  const rows = [
    R(2, { barcode: "1", cost: null }),
    R(3, { barcode: "1", cost: -1 }),
    R(4, { barcode: "1", cost: NaN }),
    R(5, { barcode: "1", cost: Infinity }),
  ];
  const res = matchCostRows(rows, [P("a", "A", "1")], {});
  assert.equal(res.matched.length, 0);
  assert.equal(res.unmatched.length, 4);
  assert.ok(res.unmatched.every((u) => u.reason === "ugyldig innkjøpspris"));
});

test("match: kost 0 er gyldig", () => {
  const res = matchCostRows([R(2, { barcode: "1", cost: 0 })], [P("a", "A", "1")], {});
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].newCost, 0);
});

test("match: ugyldig kost-rad bruker ikke opp produktet", () => {
  const res = matchCostRows(
    [R(2, { barcode: "1", cost: null }), R(3, { barcode: "1", cost: 5 })],
    [P("a", "A", "1")],
    {},
  );
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].line, 3);
});

test("match: prisavvik når |diff| > 0,5", () => {
  const products = [P("a", "A", "1", { price_nok: 100 }), P("b", "B", "2", { price_nok: 100 }), P("c", "C", "3", { price_nok: 100 })];
  const res = matchCostRows(
    [
      R(2, { barcode: "1", priceInkl: 120.456 }),
      R(3, { barcode: "2", priceInkl: 100.5 }), // eksakt 0,5 -> ikke avvik
      R(4, { barcode: "3", priceInkl: 90 }),
    ],
    products,
    {},
  );
  assert.equal(res.matched.length, 3);
  assert.equal(res.priceDiffs.length, 2);
  assert.equal(res.matched[0].priceDiff, 20.46);
  assert.equal(res.matched[1].priceDiff, null);
  assert.equal(res.matched[1].filePrice, 100.5);
  assert.equal(res.matched[2].priceDiff, -10);
});

test("match: price_nok som streng / null håndteres", () => {
  const p = P("a", "A", "1");
  (p as unknown as { price_nok: unknown }).price_nok = "199.5";
  const q = P("b", "B", "2");
  (q as unknown as { price_nok: unknown }).price_nok = null;
  const res = matchCostRows([R(2, { barcode: "1" }), R(3, { barcode: "2" })], [p, q], {});
  assert.equal(res.matched[0].dbPrice, 199.5);
  assert.equal(res.matched[1].dbPrice, 0);
});

test("match: isEstimate og note føres videre", () => {
  const res = matchCostRows([R(2, { barcode: "1", isEstimate: true, note: "Anslag" })], [P("a", "A", "1")], {});
  assert.equal(res.matched[0].isEstimate, true);
  assert.equal(res.matched[0].note, "Anslag");
});

test("match: tomme lister", () => {
  assert.deepEqual(matchCostRows([], [], {}), { matched: [], priceDiffs: [], unmatched: [], ambiguous: [] });
});

test("match: strekkode som bare er nuller strippes til tom og ignoreres i løs match", () => {
  const res = matchCostRows([R(2, { barcode: "000", name: "" })], [P("a", "A", "0")], {});
  // "000" eksakt ≠ "0"; strippet er tom -> ingen løs match
  assert.equal(res.unmatched.length, 1);
});

test("integrasjon: Fixit-fil -> match", () => {
  const sheet = parseCostSheet([
    ["txtProductName", "textbox25", "textbox27", "textbox34", "Textbox78", "Textbox80"],
    ["Pomade", "89,50", "Reuzel", "Innpris", "0007041", "Strekkoder: 0007041 9999"],
    ["Ukjent", "5", "", "Innpris", "1", ""],
  ]);
  const res = matchCostRows(sheet.rows, [P("a", "Noe helt annet", "7041", { price_nok: 249 })], {});
  assert.equal(res.matched.length, 1);
  assert.equal(res.matched[0].newCost, 89.5);
  assert.equal(res.unmatched.length, 1);
});
