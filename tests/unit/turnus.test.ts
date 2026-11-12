import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ROTATION_WEEKS, parityLetter, parityLabel, parityOptions } from "../../src/lib/turnus.ts";

test("MAX_ROTATION_WEEKS", () => assert.equal(MAX_ROTATION_WEEKS, 6));

test("parityLetter", () => {
  assert.equal(parityLetter(1), "A");
  assert.equal(parityLetter(2), "B");
  assert.equal(parityLetter(6), "F");
  assert.equal(parityLetter(0), "");
  assert.equal(parityLetter(-3), "");
  // MISTENKELIG: ingen øvre grense; 27 gir "[" (tegnkode 91).
  assert.equal(parityLetter(27), "[");
});

test("parityLabel", () => {
  assert.equal(parityLabel(0), "Hver uke");
  assert.equal(parityLabel(1), "Uke A");
  assert.equal(parityLabel(3), "Uke C");
  // MISTENKELIG: negativt tall gir "Uke " med tom bokstav.
  assert.equal(parityLabel(-1), "Uke ");
});

test("parityOptions", () => {
  assert.deepEqual(parityOptions(2), [1, 2]);
  assert.deepEqual(parityOptions(6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parityOptions(99), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parityOptions(1), [1]);
  assert.deepEqual(parityOptions(3.9), [1, 2, 3]);
  assert.deepEqual(parityOptions(0), [1, 2]);
  assert.deepEqual(parityOptions(NaN), [1, 2]);
  // MISTENKELIG: negativt tall gir 1 uke (min-klemming), ikke default 2.
  assert.deepEqual(parityOptions(-5), [1]);
});
