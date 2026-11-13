import assert from "node:assert/strict";
import test from "node:test";
import { getBasePowerForLevel } from "./cardProgression.js";
import {
  getAltarPotions,
  getWitchHealth,
  getWitchTreasureDigMinutes,
  getWitchUniqueCardPower,
  rollWitchTreasure,
  WITCH_TREASURE_CARD_BONUS_POWER,
} from "./guildRaid.js";

test("witch health and unique card power follow the reference table", () => {
  assert.equal(getWitchHealth(1), 450_000);
  assert.equal(getWitchHealth(25), 35_000_000);
  assert.equal(getWitchUniqueCardPower(1), 7500);
  assert.equal(getWitchUniqueCardPower(10), 13672);
  assert.equal(getWitchUniqueCardPower(25), 37197);
  assert.throws(() => getWitchHealth(26), RangeError);
});

test("the five treasures scale with the level", () => {
  assert.deepEqual(rollWitchTreasure(3, () => 0), { kind: "gold", amount: 150 });
  assert.deepEqual(rollWitchTreasure(3, () => 0.2), { kind: "gold", amount: 300 });
  assert.deepEqual(rollWitchTreasure(3, () => 0.4), { kind: "silver", amount: 150_000 });
  assert.deepEqual(rollWitchTreasure(3, () => 0.6), { kind: "silver", amount: 600_000 });
  assert.deepEqual(rollWitchTreasure(3, () => 0.99), { kind: "card", level: 83, bonusPower: 1820 });
});

test("treasure card power matches the reference table", () => {
  assert.equal(getBasePowerForLevel(81) + WITCH_TREASURE_CARD_BONUS_POWER, 7100);
  assert.equal(getBasePowerForLevel(90) + WITCH_TREASURE_CARD_BONUS_POWER, 8080);
  assert.equal(getBasePowerForLevel(105) + WITCH_TREASURE_CARD_BONUS_POWER, 9680);
});

test("digging takes level hours, halved by peaceful dwarves", () => {
  assert.equal(getWitchTreasureDigMinutes(1, false), 60);
  assert.equal(getWitchTreasureDigMinutes(10, true), 300);
});

test("altar potions use last week's witch level", () => {
  assert.deepEqual(getAltarPotions(7, false), { level: 7, gold: { hpPct: 7, price: 14 }, silver: { hpPct: 3.5, price: 7000 } });
  assert.equal(getAltarPotions(7, true).gold.hpPct, 9);
  assert.deepEqual(getAltarPotions(0, true), { level: 0, gold: { hpPct: 0, price: 0 }, silver: { hpPct: 0, price: 0 } });
});
