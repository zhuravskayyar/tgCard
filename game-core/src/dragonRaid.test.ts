import assert from "node:assert/strict";
import test from "node:test";
import {
  DRAGON_LAIRS,
  canUpgradeDragonLair,
  getDragonLairUpgradeCost,
  getDragonRespawnHours,
  getDueDragonBreaths,
  resolveDragonSlayerPoints,
  rollDragonDeckPowers,
  splitDragonBreath,
} from "./dragonRaid.js";

test("eight lairs: four ancient at 300k and four rare at 500k", () => {
  assert.equal(DRAGON_LAIRS.length, 8);
  assert.deepEqual(DRAGON_LAIRS.filter((lair) => lair.kind === "ancient").map((lair) => lair.health), [300_000, 300_000, 300_000, 300_000]);
  assert.deepEqual(DRAGON_LAIRS.filter((lair) => lair.kind === "rare").map((lair) => lair.health), [500_000, 500_000, 500_000, 500_000]);
});

test("respawn follows the reference table", () => {
  assert.equal(getDragonRespawnHours(1), 6 * 24 + 20);
  assert.equal(getDragonRespawnHours(5), 4 * 24 + 20);
  assert.equal(getDragonRespawnHours(15), 36);
  assert.equal(getDragonRespawnHours(20), 20);
  assert.throws(() => getDragonRespawnHours(21), RangeError);
});

test("lair upgrade costs: silver by kind, gold every fifth level", () => {
  assert.deepEqual(getDragonLairUpgradeCost("ancient", 2), { currency: "silver", amount: 1_000_000 });
  assert.deepEqual(getDragonLairUpgradeCost("rare", 4), { currency: "silver", amount: 3_000_000 });
  assert.deepEqual(getDragonLairUpgradeCost("rare", 5), { currency: "gold", amount: 2_000 });
  assert.deepEqual(getDragonLairUpgradeCost("ancient", 9), { currency: "silver", amount: 2_000_000 });
  assert.deepEqual(getDragonLairUpgradeCost("ancient", 10), { currency: "gold", amount: 10_000 });
  assert.deepEqual(getDragonLairUpgradeCost("rare", 14), { currency: "silver", amount: 12_000_000 });
  assert.deepEqual(getDragonLairUpgradeCost("ancient", 15), { currency: "gold", amount: 50_000 });
  assert.deepEqual(getDragonLairUpgradeCost("rare", 19), { currency: "silver", amount: 24_000_000 });
  assert.deepEqual(getDragonLairUpgradeCost("rare", 20), { currency: "gold", amount: 100_000 });
});

test("a lair never rises above the guild level", () => {
  assert.equal(canUpgradeDragonLair(3, 3), false);
  assert.equal(canUpgradeDragonLair(3, 4), true);
  assert.equal(canUpgradeDragonLair(20, 55), false);
});

test("breath is split evenly between the living", () => {
  assert.deepEqual(splitDragonBreath("ancient", 3), [3334, 3333, 3333]);
  assert.deepEqual(splitDragonBreath("rare", 4), [5000, 5000, 5000, 5000]);
  assert.deepEqual(splitDragonBreath("rare", 0), []);
});

test("breaths are counted in whole 30-second steps", () => {
  assert.deepEqual(getDueDragonBreaths(0, 29_999), { count: 0, nextLastBreathAt: 0 });
  assert.deepEqual(getDueDragonBreaths(0, 75_000), { count: 2, nextLastBreathAt: 60_000 });
});

test("slayer points: the reference example wins and keeps half", () => {
  const outcome = resolveDragonSlayerPoints([
    { playerId: "a", pointsBefore: 400_000, damage: 200_000, joinedAt: 2 },
    { playerId: "b", pointsBefore: 0, damage: 250_000, joinedAt: 1 },
  ]);
  assert.deepEqual(outcome, [
    { playerId: "a", pointsAfter: 300_000, winner: true },
    { playerId: "b", pointsAfter: 250_000, winner: false },
  ]);
});

test("slayer ties go to more damage, then earlier enrollment", () => {
  const outcome = resolveDragonSlayerPoints([
    { playerId: "a", pointsBefore: 100, damage: 100, joinedAt: 1 },
    { playerId: "b", pointsBefore: 0, damage: 200, joinedAt: 2 },
  ]);
  assert.equal(outcome.find((entry) => entry.winner)?.playerId, "b");
});

test("dragon deck powers stay inside the kind's range", () => {
  let seed = 0;
  const random = () => { seed = (seed + 0.137) % 1; return seed; };
  for (const power of rollDragonDeckPowers("ancient", random)) assert.ok(power >= 2700 && power <= 3300);
  for (const power of rollDragonDeckPowers("rare", random)) assert.ok(power >= 3900 && power <= 4800);
});
