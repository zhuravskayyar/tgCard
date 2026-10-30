import assert from "node:assert/strict";
import test from "node:test";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "./collectionCatalog.js";

test("active catalog contains fifteen ten-card collections and nine external starters", () => {
  assert.equal(COLLECTIONS.length, 15);
  assert.equal(COLLECTION_CARDS.length, 150);
  assert.ok(COLLECTIONS.every(({ cards }) => cards.length === 10));
  assert.ok(STARTER_CARDS.every(({ collectionId, shopEligible }) => collectionId === null && !shopEligible));
  assert.ok(COLLECTION_CARDS.every(({ collectionId, shopEligible, source }) => collectionId !== null && shopEligible && source === "standard"));
  assert.deepEqual(validateCollectionCatalog().elementCounts, { fire: 26, water: 40, air: 29, earth: 55 });
});

test("current collection names, membership and contextual bonuses remain canonical", () => {
  assert.deepEqual(COLLECTIONS.map(({ displayName }) => displayName), [
    "Прикордоння", "Чорний ліс", "Трясовина", "Попіл", "Безодня", "Шторм", "Крига",
    "Кам’яні зали", "Ніч", "Руїни", "Дракони", "Три царства", "Алхімія", "Загублений світ", "Пустка",
  ]);
  for (const collection of COLLECTIONS) {
    assert.ok(collection.cards.every(({ collectionId }) => collectionId === collection.id));
    assert.ok(collection.bonus.scope, `${collection.code} must declare where its bonus applies`);
  }
  assert.deepEqual(COLLECTIONS[0]?.bonus, { type: "silver_reward_pct", value: 3, scope: "duel" });
  assert.equal(COLLECTIONS.find(({ code }) => code === "black_forest")?.cards[1]?.displayName, "Мантикора");
});

test("retired raid and bundle collections are absent from the active catalog", () => {
  const retired = new Set(["witches", "element_spirits", "goblin_brotherhood"]);
  assert.ok(COLLECTIONS.every(({ code }) => !retired.has(code)));
  assert.ok(COLLECTION_CARDS.every(({ id }) => ![...retired].some((code) => id.startsWith(`${code}_`))));
});

test("all active cards have unique identities, descriptions and explicit artwork references", () => {
  const cards = [...STARTER_CARDS, ...COLLECTION_CARDS];
  assert.equal(cards.length, 159);
  assert.equal(new Set(cards.map(({ id }) => id)).size, 159);
  assert.equal(new Set(cards.map(({ code }) => code)).size, 159);
  assert.ok(cards.every(({ description }) => description.trim().length > 0));
  assert.ok(cards.every(({ artKey }) => artKey?.startsWith("new-cards/")));
  assert.equal(STARTER_CARDS[1]?.displayName, "Рогач");
  assert.ok(STARTER_CARDS.every(({ id }) => !COLLECTION_CARDS.some((card) => card.id === id)));
});
