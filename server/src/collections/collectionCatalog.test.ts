import assert from "node:assert/strict";
import test from "node:test";
import { CARD_DESCRIPTIONS } from "../cards/cardDescriptions.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "./collectionCatalog.js";

test("canonical content contains 17 collections, 124 members, and 9 external starters", () => {
  const validation = validateCollectionCatalog();
  assert.equal(COLLECTIONS.length, 17);
  assert.equal(COLLECTION_CARDS.length, 124);
  assert.equal(COLLECTION_CARDS.length + STARTER_CARDS.length, 133);
  assert.deepEqual(COLLECTIONS.map(({ cards }) => cards.length), [6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 4]);
  assert.ok(STARTER_CARDS.every(({ collectionId }) => collectionId === null));
  assert.ok(COLLECTION_CARDS.every(({ collectionId }) => collectionId !== null));
  assert.equal(new Set(COLLECTION_CARDS.map(({ code }) => code)).size, 124);
  assert.equal(Object.values(validation.elementCounts).reduce((sum, count) => sum + count, 0), 124);
  assert.equal(COLLECTIONS.at(-1)?.source, "raid");
  assert.deepEqual(COLLECTIONS.at(-1)?.cards.map(({ element }) => element), ["fire", "water", "earth", "air"]);
});
test("supplied Ukrainian names and membership remain canonical", () => {
  assert.deepEqual(COLLECTIONS.map(({ displayName }) => displayName), [
    "Хижаки", "Панцирні", "Нічні", "Бурекрилі", "Глибинники", "Болотники",
    "Печерники", "Грозові", "Отруйні", "Рогаті", "Первозвірі", "Стихійні",
    "Велетні", "Дракони", "Дикі духи", "Потвори", "Відьми",
  ]);
  assert.equal(COLLECTIONS[13]?.cards[7]?.displayName, "Лун");
  assert.equal(COLLECTIONS[15]?.cards[2]?.displayName, "Мантикора");
});

test("canonical cards use the supplied descriptions and only the requested renames", () => {
  const cards = [...STARTER_CARDS, ...COLLECTION_CARDS];
  assert.equal(cards.length, 133);
  assert.equal(Object.keys(CARD_DESCRIPTIONS).length, 133);
  assert.equal(new Set(cards.map(({ id }) => id)).size, 133);
  assert.equal(new Set(cards.map(({ code }) => code)).size, 133);
  assert.ok(cards.every(({ description }) => description.trim().length > 0));
  assert.equal(new Set(cards.map(({ description }) => description)).size, 133);
  assert.ok(cards.every(({ code, description }) => CARD_DESCRIPTIONS[code] === description));
  for (const [id, displayName] of [["starter_03", "Жук-бомбардир"], ["caveborn_01", "Протей"], ["thunderborn_02", "Птах Рух"]] as const) {
    const card = cards.find((candidate) => candidate.id === id);
    assert.equal(card?.code, id);
    assert.equal(card?.displayName, displayName);
  }
  assert.equal(
    cards.find(({ id }) => id === "horned_07")?.description,
    "Привіт, Як! — Як як? — Як як як. — А ти як? Після цього навіть гори роблять вигляд, що нічого не чули.",
  );
});
