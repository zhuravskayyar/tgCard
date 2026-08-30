import assert from "node:assert/strict";
import test from "node:test";
import { CARD_ELEMENTS } from "@cardastika/shared";
import { SHOP_REWARD_CARDS } from "./shopRewardCards.js";

test("base shop reward definitions cover every resolvable rarity", () => {
  assert.deepEqual(
    SHOP_REWARD_CARDS.map(({ targetRarity }) => targetRarity),
    ["uncommon", "rare", "epic", "legendary", "mythic"],
  );
  assert.equal(new Set(SHOP_REWARD_CARDS.map(({ id }) => id)).size, SHOP_REWARD_CARDS.length);
  assert.equal(new Set(SHOP_REWARD_CARDS.map(({ code }) => code)).size, SHOP_REWARD_CARDS.length);

  for (const card of SHOP_REWARD_CARDS) {
    assert.ok(card.displayName);
    assert.equal(card.artKey, null);
    assert.equal(card.collectionId, null);
    assert.ok(CARD_ELEMENTS.includes(card.element));
  }
});
