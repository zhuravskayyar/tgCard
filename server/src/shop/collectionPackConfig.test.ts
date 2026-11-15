import assert from "node:assert/strict";
import test from "node:test";
import { COLLECTION_PACK_IDS, priceFullCollection } from "@cardastika/game-core";
import { CATALOG_DATA } from "../collections/catalogData.generated.js";
import { COLLECTION_PACK_CARD_PRICE, COLLECTION_PACKS } from "./collectionPackConfig.js";

// Collections of the holiday bundles (migration 089) and the reserved dragon magic.
const NOT_SOLD = ["magic_1", "magic_heal", "winter_reinforcement", "berserks", "sorceresses", "ufavorites", "dragon_fans", "dragon_whisperers", "ugenerals", "treasure_hunters", "dwarves_war", "dwarves_peace", "voodoo_cult", "ancient_order"];

test("the packs match the rotation ids and the card catalog", () => {
  assert.deepEqual(COLLECTION_PACKS.map(({ id }) => id), [...COLLECTION_PACK_IDS]);
  const cards = new Map(CATALOG_DATA.cards.map((card) => [card.id, card]));
  const codes = COLLECTION_PACKS.flatMap((pack) => pack.collectionCodes);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) {
    assert.ok(!NOT_SOLD.includes(code), `${code} must not be sold`);
    const collection = CATALOG_DATA.collections.find((candidate) => candidate.code === code);
    assert.ok(collection, `${code} exists in the catalog`);
    for (const cardId of collection.cardIds) assert.equal(cards.get(cardId)?.shopEligible, false, `${cardId} is not shop eligible`);
  }
});

test("prices follow the per-card ladder and a random card costs more per card than its set", () => {
  const cards = new Map(CATALOG_DATA.cards.map((card) => [card.id, card]));
  for (const pack of COLLECTION_PACKS) {
    assert.deepEqual(Object.keys(pack.setPrices).sort(), [...pack.collectionCodes].sort());
    for (const code of pack.collectionCodes) {
      const collection = CATALOG_DATA.collections.find((candidate) => candidate.code === code)!;
      const ladder = collection.cardIds.reduce((sum, id) => sum + COLLECTION_PACK_CARD_PRICE[cards.get(id)!.minRarity as keyof typeof COLLECTION_PACK_CARD_PRICE], 0);
      const price = pack.setPrices[code]!;
      assert.ok(Math.abs(price - ladder) <= 5, `${code}: ${price} vs ladder ${ladder}`);
      assert.ok(price / collection.cardIds.length < pack.randomPrice, `${code}: random must cost more per card`);
    }
  }
});

test("the shared ladder helper reproduces every configured set price", () => {
  const cards = new Map(CATALOG_DATA.cards.map((card) => [card.id, card]));
  for (const pack of COLLECTION_PACKS) {
    for (const code of pack.collectionCodes) {
      const collection = CATALOG_DATA.collections.find((candidate) => candidate.code === code)!;
      const price = priceFullCollection(collection.cardIds.map((id) => cards.get(id)!.minRarity));
      assert.equal(price, pack.setPrices[code], `${code}: ladder ${price} vs configured ${pack.setPrices[code]}`);
    }
  }
});
