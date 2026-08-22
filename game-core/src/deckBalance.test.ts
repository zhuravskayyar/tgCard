import assert from "node:assert/strict";
import test from "node:test";
import type { CardElement } from "@cardastika/shared";
import {
  canReplaceDeckCard,
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

test("validates same-element, balanced, and unbalanced replacements", () => {
  const currentDeck = cards([
    ["fire", 3], ["water", 2], ["air", 2], ["earth", 2],
  ]).map((card, index) => ({ ...card, slot: index + 1 }));

  assert.equal(canReplaceDeckCard(currentDeck, 1, { element: "fire" }).valid, true);
  assert.equal(canReplaceDeckCard(currentDeck, 1, { element: "water" }).valid, true);
  assert.equal(canReplaceDeckCard(currentDeck, 8, { element: "fire" }).valid, false);
  assert.equal(canReplaceDeckCard(currentDeck, 99, { element: "fire" }).reason, "slot_not_found");
});
