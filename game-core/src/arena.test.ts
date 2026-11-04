import assert from "node:assert/strict";
import test from "node:test";
import { ARENA_LEAGUE_CONFIG, ARENA_START_RATING, getArenaLeagueIndexAfter, getLeagueByRating, type DuelBattleModifiers, type DuelCardSnapshot } from "@cardastika/shared";
import {
  calculateArenaDamage,
  calculateArenaRatingChange,
  getArenaCardChangeCost,
  getArenaTokenReward,
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

const evenFight = { averageDamage: 100, averageOpponentRating: 1_400, damageDealt: 100, playerRating: 1_400 };

test("Arena rating follows the place in an even fight", () => {
  assert.equal(calculateArenaRatingChange({ ...evenFight, placement: 1 }), 24);
  assert.equal(calculateArenaRatingChange({ ...evenFight, placement: 6 }), -14);
});

test("Arena rating rewards strong opposition and high damage, within limits", () => {
  assert.equal(calculateArenaRatingChange({ ...evenFight, placement: 1, averageOpponentRating: 1_480 }), 26);
  assert.equal(calculateArenaRatingChange({ ...evenFight, placement: 1, damageDealt: 200 }), 28);
  assert.equal(calculateArenaRatingChange({ ...evenFight, placement: 1, damageDealt: 10_000, averageOpponentRating: 9_000 }), 38);
  assert.equal(calculateArenaRatingChange({ ...evenFight, placement: 3, damageDealt: 0, averageOpponentRating: 0 }), 0);
});

test("Arena tokens follow the place", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(getArenaTokenReward), [30, 24, 18, 9, 6, 3]);
});

test("Arena has its own league scale and a demotion buffer", () => {
  assert.equal(getLeagueByRating(ARENA_START_RATING, ARENA_LEAGUE_CONFIG).index, 6);
  assert.equal(getLeagueByRating(4_200, ARENA_LEAGUE_CONFIG).index, 20);
  assert.equal(getArenaLeagueIndexAfter(1_600, 6), 7);
  assert.equal(getArenaLeagueIndexAfter(1_301, 6), 6);
  assert.equal(getArenaLeagueIndexAfter(1_300, 6), 5);
});
