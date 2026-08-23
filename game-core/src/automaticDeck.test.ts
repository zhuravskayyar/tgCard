import assert from "node:assert/strict";
import test from "node:test";
import { countDeckElements } from "./deckBalance.js";
import { buildBestValidDeck, type OwnedDeckCard } from "./automaticDeck.js";

function card(
  code: string,
  element: OwnedDeckCard["element"],
  finalPower: number,
  instanceId = `instance_${code}`,
  cardId = `id_${code}`,
): OwnedDeckCard {
  return { cardId, code, element, finalPower, instanceId };
}

const balancedInventory = [
  card("fire_1", "fire", 30), card("fire_2", "fire", 20), card("fire_3", "fire", 10),
  card("water_1", "water", 29), card("water_2", "water", 19), card("water_3", "water", 9),
  card("air_1", "air", 28), card("air_2", "air", 18), card("air_3", "air", 8),
  card("earth_1", "earth", 27), card("earth_2", "earth", 17), card("earth_3", "earth", 40),
] as const;

test("chooses the globally strongest valid nine-card instance deck with 3/2/2/2 balance", () => {
  const result = buildBestValidDeck(balancedInventory);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.cards.length, 9);
  assert.equal(result.totalPower, 228);
  assert.deepEqual(countDeckElements(result.cards), { fire: 2, water: 2, air: 2, earth: 3 });
});

test("a stronger acquired instance replaces the weaker candidate from the same element", () => {
  const before = buildBestValidDeck(balancedInventory);
  const after = buildBestValidDeck([...balancedInventory, card("fire_new", "fire", 50)]);
  assert.equal(before.status, "ready");
  assert.equal(after.status, "ready");
  if (before.status !== "ready" || after.status !== "ready") return;
  assert.ok(after.cards.some(({ code }) => code === "fire_new"));
  assert.ok(!after.cards.some(({ code }) => code === "fire_3"));
  assert.ok(after.totalPower > before.totalPower);
});

test("a fourth high-power instance is excluded when it would exceed the element maximum", () => {
  const inventory = [
    card("fire_1", "fire", 100), card("fire_2", "fire", 99),
    card("fire_3", "fire", 98), card("fire_4", "fire", 97),
    card("water_1", "water", 80), card("water_2", "water", 79),
    card("air_1", "air", 70), card("air_2", "air", 69),
    card("earth_1", "earth", 60), card("earth_2", "earth", 59),
  ];
  const result = buildBestValidDeck(inventory);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(countDeckElements(result.cards), { fire: 3, water: 2, air: 2, earth: 2 });
  assert.ok(!result.cards.some(({ code }) => code === "fire_4"));
  assert.equal(result.totalPower, 714);
});

test("duplicate canonical cards remain distinct instances with independent power", () => {
  const inventory = [
    card("fire_copy", "fire", 30, "fire-copy-a", "same-fire-card"),
    card("fire_copy", "fire", 45, "fire-copy-b", "same-fire-card"),
    card("water_copy", "water", 25, "water-copy-a", "same-water-card"),
    card("water_copy", "water", 26, "water-copy-b", "same-water-card"),
    card("water_copy", "water", 27, "water-copy-c", "same-water-card"),
    card("air_copy", "air", 20, "air-copy-a", "same-air-card"),
    card("air_copy", "air", 21, "air-copy-b", "same-air-card"),
    card("earth_copy", "earth", 15, "earth-copy-a", "same-earth-card"),
    card("earth_copy", "earth", 16, "earth-copy-b", "same-earth-card"),
  ];
  const result = buildBestValidDeck(inventory);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(new Set(result.cards.map(({ instanceId }) => instanceId)).size, 9);
  assert.ok(result.cards.some(({ instanceId, finalPower }) => instanceId === "fire-copy-b" && finalPower === 45));
});

test("tie-breaking is deterministic regardless of inventory order", () => {
  const inventory = balancedInventory.map((entry) => ({ ...entry, finalPower: 12 }));
  const forward = buildBestValidDeck(inventory);
  const reverse = buildBestValidDeck([...inventory].reverse());
  assert.deepEqual(reverse, forward);
  assert.equal(forward.status, "ready");
  if (forward.status !== "ready") return;
  assert.deepEqual(forward.cards.map(({ code }) => code), [
    "air_1", "air_2", "air_3", "earth_1", "earth_2", "fire_1", "fire_2", "water_1", "water_2",
  ]);
});

test("returns a structured insufficient state instead of an invalid deck", () => {
  const result = buildBestValidDeck(balancedInventory.filter(({ element }) => element !== "earth"));
  assert.deepEqual(result, {
    status: "insufficient_valid_cards",
    availableElementCounts: { fire: 3, water: 3, air: 3, earth: 0 },
  });
});

test("canonical starter instances remain a 108-power deck", () => {
  const elements = ["fire", "fire", "fire", "water", "water", "air", "air", "earth", "earth"] as const;
  const result = buildBestValidDeck(elements.map((element, index) => (
    card(`starter_${String(index + 1).padStart(2, "0")}`, element, 12)
  )));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.totalPower, 108);
  assert.deepEqual(result.elementCounts, { fire: 3, water: 2, air: 2, earth: 2 });
});
