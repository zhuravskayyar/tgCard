import assert from "node:assert/strict";
import test from "node:test";
import { CARD_ELEMENTS, CARD_RARITIES } from "@cardastika/shared";
import { STARTER_CARDS, STARTER_CARD_COUNT } from "./starterCards.js";

test("starter definitions are canonical and unique", () => {
  assert.equal(STARTER_CARDS.length, STARTER_CARD_COUNT);
  assert.equal(STARTER_CARD_COUNT, 9);
  assert.equal(new Set(STARTER_CARDS.map(({ id }) => id)).size, STARTER_CARD_COUNT);
  assert.equal(new Set(STARTER_CARDS.map(({ code }) => code)).size, STARTER_CARD_COUNT);

  for (const card of STARTER_CARDS) {
    assert.equal(card.power, 12);
    assert.equal(card.collectionId, null);
    assert.equal(card.displayName, null);
    assert.equal(card.artKey, null);
    assert.ok(CARD_ELEMENTS.includes(card.element));
    assert.ok(CARD_RARITIES.includes(card.rarity));
  }
});
