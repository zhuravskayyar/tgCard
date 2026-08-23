import assert from "node:assert/strict";
import test from "node:test";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "./collectionCatalog.js";

test("canonical content contains 16 collections, 120 members, and 9 external starters", () => {
  const validation = validateCollectionCatalog();
  assert.equal(COLLECTIONS.length, 16);
  assert.equal(COLLECTION_CARDS.length, 120);
  assert.equal(COLLECTION_CARDS.length + STARTER_CARDS.length, 129);
  assert.deepEqual(COLLECTIONS.map(({ cards }) => cards.length), [6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9]);
  assert.ok(STARTER_CARDS.every(({ collectionId }) => collectionId === null));
  assert.ok(COLLECTION_CARDS.every(({ collectionId }) => collectionId !== null));
  assert.equal(new Set(COLLECTION_CARDS.map(({ code }) => code)).size, 120);
  assert.equal(Object.values(validation.elementCounts).reduce((sum, count) => sum + count, 0), 120);
});
test("supplied Ukrainian names and membership remain canonical", () => {
  assert.deepEqual(COLLECTIONS.map(({ displayName }) => displayName), [
    "Хижаки", "Панцирні", "Нічні", "Бурекрилі", "Глибинники", "Болотники",
    "Печерники", "Грозові", "Отруйні", "Рогаті", "Первозвірі", "Стихійні",
    "Велетні", "Дракони", "Дикі духи", "Потвори",
  ]);
  assert.equal(COLLECTIONS[13]?.cards[7]?.displayName, "Лун");
  assert.equal(COLLECTIONS[15]?.cards[2]?.displayName, "Мантикора");
});
