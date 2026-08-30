import assert from "node:assert/strict";
import test from "node:test";
import type { DuelBattleModifiers, DuelCardSnapshot } from "@cardastika/shared";
import {
  calculateArenaDamage,
  getArenaCardChangeCost,
  getArenaReward,
} from "@cardastika/game-core";

const modifiers: DuelBattleModifiers = {
  battleDamagePct: 0,
  battleHpPct: 0,
  deckPowerPct: 0,
  elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
  experienceRewardPct: 0,
  silverRewardPct: 0,
};

function card(element: DuelCardSnapshot["element"], power: number): DuelCardSnapshot {
  return {
    artKey: null,
    basePower: power,
    bonusPower: 0,
    cardId: `${element}-card`,
    code: `${element}-card`,
    displayName: element,
    element,
    finalPower: power,
    instanceId: `${element}-instance`,
    level: 1,
    rarity: "common",
  };
}

test("Arena uses the Duel elemental damage multipliers", () => {
  assert.equal(calculateArenaDamage({ attacker: card("fire", 100), attackerModifiers: modifiers, defender: card("air", 100) }).damage, 150);
  assert.equal(calculateArenaDamage({ attacker: card("fire", 100), attackerModifiers: modifiers, defender: card("water", 100) }).damage, 50);
});

test("Arena card change costs are free three times, then progressive", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(getArenaCardChangeCost), [0, 0, 0, 1, 2, 4, 6, 8, 10, 10]);
});

test("Arena currency boost doubles silver and expands the gold cap", () => {
  assert.deepEqual(getArenaReward(1, 5, 0, 2), { arenaTokens: 30, gold: 18, goldCapped: false, silver: 1_800, ratingChange: 25 });
  assert.deepEqual(getArenaReward(1, 5, 89, 2), { arenaTokens: 30, gold: 1, goldCapped: true, silver: 1_800, ratingChange: 25 });
});

test("Arena rewards are tripled while preserving the daily Gold cap", () => {
  assert.deepEqual(getArenaReward(1, 5, 0), { arenaTokens: 30, gold: 9, goldCapped: false, silver: 900, ratingChange: 25 });
  assert.deepEqual(getArenaReward(1, 5, 44), { arenaTokens: 30, gold: 1, goldCapped: true, silver: 900, ratingChange: 25 });
  assert.deepEqual(getArenaReward(6, 20, 45), { arenaTokens: 3, gold: 0, goldCapped: false, silver: 1_500, ratingChange: -20 });
});
