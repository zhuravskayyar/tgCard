import assert from "node:assert/strict";
import test from "node:test";
import type { CardElement } from "@cardastika/shared";
import {
  countDeckElements,
  validateDeckElementBalance,
} from "./deckBalance.js";

function cards(distribution: readonly (readonly [CardElement, number])[]) {
  return distribution.flatMap(([element, count]) => Array.from({ length: count }, () => ({ element })));
}

test("counts all four deck elements", () => {
  assert.deepEqual(countDeckElements(cards([
    ["fire", 3], ["water", 2], ["air", 2], ["earth", 2],
  ])), { fire: 3, water: 2, air: 2, earth: 2 });
});

test("allows each element to be the three-card element", () => {
  for (const majority of ["fire", "water", "air", "earth"] as const) {
    const distribution = (["fire", "water", "air", "earth"] as const)
      .map((element) => [element, element === majority ? 3 : 2] as const);
    assert.equal(validateDeckElementBalance(cards(distribution)).valid, true);
  }
});

test("rejects invalid complete-deck distributions and wrong size", () => {
  for (const distribution of [
    [["fire", 4], ["water", 2], ["air", 2], ["earth", 1]],
    [["fire", 3], ["water", 3], ["air", 2], ["earth", 1]],
    [["fire", 5], ["water", 2], ["air", 2], ["earth", 0]],
  ] as const) {
    assert.equal(validateDeckElementBalance(cards(distribution)).valid, false);
  }

  assert.equal(validateDeckElementBalance(cards([
    ["fire", 2], ["water", 2], ["air", 2], ["earth", 2],
  ])).reason, "invalid_deck_size");
});
