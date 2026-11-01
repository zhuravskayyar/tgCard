import assert from "node:assert/strict";
import test from "node:test";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { CATALOG_DATA } from "./catalogData.generated.js";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "./collectionCatalog.js";

test("catalog has fifty collections of varied size with shared cards", () => {
  assert.equal(COLLECTIONS.length, 50);
  assert.equal(COLLECTION_CARDS.length, 213);
  const sizes = COLLECTIONS.map(({ cards }) => cards.length);
  assert.equal(Math.min(...sizes), 3);
  assert.equal(Math.max(...sizes), 15);
  const uses = new Map<string, number>();
  for (const { cards } of COLLECTIONS) for (const { id } of cards) uses.set(id, (uses.get(id) ?? 0) + 1);
  assert.equal(uses.size, 197);
  assert.equal([...uses.values()].filter((count) => count > 1).length, 38);
  assert.equal(validateCollectionCatalog().cardCount, 213);
});

test("every card has a unique identity and a description; starters stay outside", () => {
  const cards = [...STARTER_CARDS, ...COLLECTION_CARDS];
  assert.equal(new Set(cards.map(({ id }) => id)).size, cards.length);
  assert.equal(new Set(COLLECTION_CARDS.map(({ displayName }) => displayName)).size, COLLECTION_CARDS.length);
  assert.ok(cards.every(({ description }) => description.trim().length > 0));
  assert.ok(STARTER_CARDS.every(({ collectionId, shopEligible }) => collectionId === null && !shopEligible));
});

test("banner pools sell only eligible cards at or above their minimum rarity", () => {
  const order = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  const byId = new Map(COLLECTION_CARDS.map((card) => [card.id, card]));
  for (const pool of Object.values(CATALOG_DATA.shopPools)) {
    for (const [rarity, ids] of Object.entries(pool)) {
      for (const id of ids ?? []) {
        const card = byId.get(id);
        assert.ok(card?.shopEligible, id);
        assert.ok(order.indexOf(card.minRarity) <= order.indexOf(rarity), id);
      }
    }
  }
  assert.equal(byId.get("horrible_kraken")?.minRarity, "mythic");
});
