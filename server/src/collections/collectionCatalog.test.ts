import assert from "node:assert/strict";
import test from "node:test";
import { CARD_DESCRIPTIONS } from "../cards/cardDescriptions.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "./collectionCatalog.js";

test("canonical content contains 20 collections, 141 members, and 9 external starters", () => {
  const validation = validateCollectionCatalog();
  assert.equal(COLLECTIONS.length, 20);
  assert.equal(COLLECTION_CARDS.length, 141);
  assert.equal(COLLECTION_CARDS.length + STARTER_CARDS.length, 150);
  assert.deepEqual(COLLECTIONS.map(({ cards }) => cards.length), [6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 9, 4, 4, 4]);
  assert.ok(STARTER_CARDS.every(({ collectionId }) => collectionId === null));
  assert.ok(COLLECTION_CARDS.every(({ collectionId }) => collectionId !== null));
  assert.equal(new Set(COLLECTION_CARDS.map(({ code }) => code)).size, 141);
  assert.equal(Object.values(validation.elementCounts).reduce((sum, count) => sum + count, 0), 141);
  const witches = COLLECTIONS.find(({ code }) => code === "witches");
  assert.equal(witches?.source, "raid");
  assert.deepEqual(witches?.cards.map(({ element }) => element), ["fire", "water", "earth", "air"]);
});
test("supplied Ukrainian names and membership remain canonical", () => {
  assert.deepEqual(COLLECTIONS.map(({ displayName }) => displayName), [
    "Хижаки", "Панцирні", "Нічні", "Бурекрилі", "Глибинники", "Болотники",
    "Печерники", "Грозові", "Отруйні", "Рогаті", "Первозвірі", "Стихійні",
    "Велетні", "Дракони", "Дикі духи", "Потвори", "Чумна алхімія", "Відьми",
    "Духи стихій", "Гоблінська братва",
  ]);
  assert.equal(COLLECTIONS[13]?.cards[7]?.displayName, "Лун");
  assert.equal(COLLECTIONS[15]?.cards[2]?.displayName, "Мантикора");
  const plagueAlchemy = COLLECTIONS.find(({ code }) => code === "plague_alchemy");
  assert.ok(plagueAlchemy);
  assert.deepEqual(plagueAlchemy.cards.map(({ element }) => element), ["earth", "water", "air", "earth", "earth", "water", "air", "fire", "fire"]);
  assert.deepEqual(plagueAlchemy.cards.map(({ minRarity }) => minRarity), ["epic", "rare", "legendary", "epic", "rare", "epic", "legendary", "legendary", "mythic"]);
  assert.deepEqual(plagueAlchemy.bonus, { type: "element_damage_pct", value: 5, element: "fire", scope: "guild_raid" });
});

test("new four-card collections contain only the requested epic cards", () => {
  const elementalSpirits = COLLECTIONS.find(({ code }) => code === "element_spirits");
  assert.ok(elementalSpirits);
  assert.deepEqual(elementalSpirits.cards.map(({ id, displayName, element, minRarity, artKey, collectionId }) => ({ id, displayName, element, minRarity, artKey, collectionId })), [
    { id: "element_spirits_01", displayName: "Дух Вогню", element: "fire", minRarity: "epic", artKey: "element_spirits_01", collectionId: "collection_element_spirits" },
    { id: "element_spirits_02", displayName: "Дух Води", element: "water", minRarity: "epic", artKey: "element_spirits_02", collectionId: "collection_element_spirits" },
    { id: "element_spirits_03", displayName: "Дух Землі", element: "earth", minRarity: "epic", artKey: "element_spirits_03", collectionId: "collection_element_spirits" },
    { id: "element_spirits_04", displayName: "Дух Повітря", element: "air", minRarity: "epic", artKey: "element_spirits_04", collectionId: "collection_element_spirits" },
  ]);
  assert.deepEqual(elementalSpirits.bonus, { type: "none", value: 0 });

  const goblinBrotherhood = COLLECTIONS.find(({ code }) => code === "goblin_brotherhood");
  assert.ok(goblinBrotherhood);
  assert.deepEqual(goblinBrotherhood.cards.map(({ id, displayName, element, minRarity, artKey, collectionId }) => ({ id, displayName, element, minRarity, artKey, collectionId })), [
    { id: "goblin_brotherhood_01", displayName: "Рвач", element: "earth", minRarity: "epic", artKey: "goblin_brotherhood_01", collectionId: "collection_goblin_brotherhood" },
    { id: "goblin_brotherhood_02", displayName: "Шнир", element: "air", minRarity: "epic", artKey: "goblin_brotherhood_02", collectionId: "collection_goblin_brotherhood" },
    { id: "goblin_brotherhood_03", displayName: "Порох", element: "fire", minRarity: "epic", artKey: "goblin_brotherhood_03", collectionId: "collection_goblin_brotherhood" },
    { id: "goblin_brotherhood_04", displayName: "Батя Грум", element: "water", minRarity: "epic", artKey: "goblin_brotherhood_04", collectionId: "collection_goblin_brotherhood" },
  ]);
  assert.deepEqual(goblinBrotherhood.bonus, { type: "none", value: 0 });
});

test("canonical cards use the supplied descriptions and only the requested renames", () => {
  const cards = [...STARTER_CARDS, ...COLLECTION_CARDS];
  assert.equal(cards.length, 150);
  assert.equal(Object.keys(CARD_DESCRIPTIONS).length, 150);
  assert.equal(new Set(cards.map(({ id }) => id)).size, 150);
  assert.equal(new Set(cards.map(({ code }) => code)).size, 150);
  assert.ok(cards.every(({ description }) => description.trim().length > 0));
  assert.equal(new Set(cards.map(({ description }) => description)).size, 150);
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
