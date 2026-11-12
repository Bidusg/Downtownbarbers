import { test } from "node:test";
import assert from "node:assert/strict";
import { osloToUtcISO, osloLocalToIso, isoToOsloLocal } from "../../src/lib/oslo-time.ts";

test("vinter (CET, UTC+1)", () => {
  assert.equal(osloToUtcISO("2026-01-15", "13:00"), "2026-01-15T12:00:00.000Z");
});

test("sommer (CEST, UTC+2)", () => {
  assert.equal(osloToUtcISO("2026-07-01", "13:00"), "2026-07-01T11:00:00.000Z");
  assert.equal(osloToUtcISO("2026-10-06", "13:00"), "2026-10-06T11:00:00.000Z");
});

test("dagsgrense: Oslo midnatt er forrige dag i UTC", () => {
  assert.equal(osloToUtcISO("2026-01-15", "00:00"), "2026-01-14T23:00:00.000Z");
  assert.equal(osloToUtcISO("2026-07-01", "00:00"), "2026-06-30T22:00:00.000Z");
  assert.equal(osloToUtcISO("2026-07-01", "23:59"), "2026-07-01T21:59:00.000Z");
  assert.equal(osloToUtcISO("2025-12-31", "23:30"), "2025-12-31T22:30:00.000Z");
  assert.equal(osloToUtcISO("2026-01-01", "00:30"), "2025-12-31T23:30:00.000Z");
});

test("sommertid starter siste søndag i mars (2026-03-29 kl 02 -> 03)", () => {
  assert.equal(osloToUtcISO("2026-03-28", "12:00"), "2026-03-28T11:00:00.000Z");
  assert.equal(osloToUtcISO("2026-03-29", "01:59"), "2026-03-29T00:59:00.000Z");
  assert.equal(osloToUtcISO("2026-03-29", "03:00"), "2026-03-29T01:00:00.000Z");
  assert.equal(osloToUtcISO("2026-03-29", "12:00"), "2026-03-29T10:00:00.000Z");
  assert.equal(osloToUtcISO("2026-03-30", "12:00"), "2026-03-30T10:00:00.000Z");
});

test("ikke-eksisterende klokkeslett 02:30 den 2026-03-29", () => {
  const iso = osloToUtcISO("2026-03-29", "02:30");
  // MISTENKELIG: ugyldig veggtid aksepteres stille og skyves én time frem til 03:30 CEST.
  assert.equal(iso, "2026-03-29T01:30:00.000Z");
  assert.equal(isoToOsloLocal(iso), "2026-03-29T03:30");
});

test("sommertid slutter siste søndag i oktober (2026-10-25 kl 03 -> 02)", () => {
  assert.equal(osloToUtcISO("2026-10-24", "12:00"), "2026-10-24T10:00:00.000Z");
  assert.equal(osloToUtcISO("2026-10-25", "01:59"), "2026-10-24T23:59:00.000Z");
  assert.equal(osloToUtcISO("2026-10-25", "03:00"), "2026-10-25T02:00:00.000Z");
  assert.equal(osloToUtcISO("2026-10-25", "12:00"), "2026-10-25T11:00:00.000Z");
  assert.equal(osloToUtcISO("2026-10-26", "12:00"), "2026-10-26T11:00:00.000Z");
});

test("tvetydig klokkeslett 02:30 den 2026-10-25 (finnes to ganger)", () => {
  const iso = osloToUtcISO("2026-10-25", "02:30");
  // MISTENKELIG: ingen eksplisitt regel for første/andre forekomst; én av to gyldige velges.
  assert.ok(
    iso === "2026-10-25T00:30:00.000Z" || iso === "2026-10-25T01:30:00.000Z",
    `fikk ${iso}`,
  );
  assert.equal(isoToOsloLocal(iso), "2026-10-25T02:30");
});

test("siste søndag mars/oktober andre år (2025, 2027)", () => {
  assert.equal(osloToUtcISO("2025-03-30", "03:00"), "2025-03-30T01:00:00.000Z");
  assert.equal(osloToUtcISO("2025-03-29", "12:00"), "2025-03-29T11:00:00.000Z");
  assert.equal(osloToUtcISO("2025-10-26", "03:00"), "2025-10-26T02:00:00.000Z");
  assert.equal(osloToUtcISO("2027-03-28", "03:00"), "2027-03-28T01:00:00.000Z");
  assert.equal(osloToUtcISO("2027-10-31", "03:00"), "2027-10-31T02:00:00.000Z");
});

test("manglende minutt tolkes som 0", () => {
  assert.equal(osloToUtcISO("2026-01-15", "13"), "2026-01-15T12:00:00.000Z");
});

test("osloLocalToIso", () => {
  assert.equal(osloLocalToIso("2026-07-01T10:00"), "2026-07-01T08:00:00.000Z");
  assert.equal(osloLocalToIso("2026-01-15T10:00"), "2026-01-15T09:00:00.000Z");
  assert.equal(osloLocalToIso("2026-07-01T10:00:30"), "2026-07-01T08:00:00.000Z");
  assert.equal(osloLocalToIso("  2026-07-01T10:00  "), "2026-07-01T08:00:00.000Z");
  assert.equal(osloLocalToIso(""), null);
  assert.equal(osloLocalToIso(null), null);
  assert.equal(osloLocalToIso(undefined), null);
  assert.equal(osloLocalToIso("2026-07-01"), null);
  assert.equal(osloLocalToIso("junk"), null);
});

test("isoToOsloLocal", () => {
  assert.equal(isoToOsloLocal("2026-07-01T08:00:00.000Z"), "2026-07-01T10:00");
  assert.equal(isoToOsloLocal("2026-01-15T09:00:00Z"), "2026-01-15T10:00");
  assert.equal(isoToOsloLocal("2026-06-30T22:00:00Z"), "2026-07-01T00:00");
  assert.equal(isoToOsloLocal("2026-03-29T01:00:00Z"), "2026-03-29T03:00");
  assert.equal(isoToOsloLocal("2026-03-29T00:59:00Z"), "2026-03-29T01:59");
  assert.equal(isoToOsloLocal("2026-10-25T00:30:00Z"), "2026-10-25T02:30");
  assert.equal(isoToOsloLocal("2026-10-25T01:30:00Z"), "2026-10-25T02:30");
  assert.equal(isoToOsloLocal("2026-10-25T02:00:00Z"), "2026-10-25T03:00");
  assert.equal(isoToOsloLocal(null), "");
  assert.equal(isoToOsloLocal(undefined), "");
  assert.equal(isoToOsloLocal(""), "");
  assert.equal(isoToOsloLocal("not a date"), "");
});

test("roundtrip hver time uten hull (utenfor DST-overgang)", () => {
  for (const d of ["2026-01-10", "2026-03-28", "2026-03-30", "2026-06-15", "2026-10-24", "2026-10-26", "2026-12-24"]) {
    for (let h = 0; h < 24; h++) {
      const t = `${String(h).padStart(2, "0")}:15`;
      assert.equal(isoToOsloLocal(osloToUtcISO(d, t)), `${d}T${t}`);
    }
  }
});
