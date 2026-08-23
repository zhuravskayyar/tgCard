import assert from "node:assert/strict";
import test from "node:test";
import type { CardElement, DuelBattleModifiers, DuelCardSnapshot } from "@cardastika/shared";
import {
  applyAccountXp,
  applyDuelOutcomeToStats,
  calculateDuelDamage,
  calculateDuelReward,
  cycleCardPoolSlot,
  getDuelBaseSilver,
  getDuelBaseXp,
  getDuelLogVisualState,
  getEffectiveDeckPower,
  getElementMultiplier,
  getMatchmakingRange,
  getRequiredAccountXp,
  getStartingHp,
  initializeCyclicCardPool,
  isDeckPowerInMatchmakingRange,
  resolveDuelExchange,
} from "./duel.js";

const noModifiers: DuelBattleModifiers = {
  battleDamagePct: 0,
  battleHpPct: 0,
  deckPowerPct: 0,
  elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
  experienceRewardPct: 0,
  silverRewardPct: 0,
};

function card(code: string, element: CardElement = "fire", finalPower = 100): DuelCardSnapshot {
  return {
    instanceId: `instance-${code}`,
    cardId: `card-${code}`,
    code,
    displayName: code,
    artKey: code,
    element,
    level: 1,
    basePower: finalPower,
    bonusPower: 0,
    finalPower,
    rarity: "common",
  };
}

test("element matrix has all 16 canonical attacker and defender values", () => {
  const elements: CardElement[] = ["fire", "water", "air", "earth"];
  const expected = [
    [1, 0.5, 1.5, 1],
    [1.5, 1, 1, 0.5],
    [0.5, 1, 1, 1.5],
    [1, 1.5, 0.5, 1],
  ];
  elements.forEach((attacker, attackerIndex) => {
    elements.forEach((defender, defenderIndex) => {
      assert.equal(getElementMultiplier(attacker, defender), expected[attackerIndex]![defenderIndex]);
    });
  });
});

test("effective power, HP, and matchmaking ranges use centralized rounding", () => {
  assert.equal(getEffectiveDeckPower(1_000, 6), 1_060);
  assert.equal(getStartingHp(1_060, 5), 1_113);
  assert.deepEqual(getMatchmakingRange(1_000, 0), { minimum: 900, maximum: 1_100, percentage: 10 });
  assert.deepEqual(getMatchmakingRange(1_000, 4), { minimum: 900, maximum: 1_100, percentage: 10 });
  assert.deepEqual(getMatchmakingRange(1_000, 5), { minimum: 850, maximum: 1_150, percentage: 15 });
  assert.deepEqual(getMatchmakingRange(1_000, 12), { minimum: 850, maximum: 1_150, percentage: 15 });
  const range = getMatchmakingRange(1_000, 0);
  assert.equal(isDeckPowerInMatchmakingRange(900, range), true);
  assert.equal(isDeckPowerInMatchmakingRange(1_101, range), false);
});

test("deterministic initial pool has three active cards and a cyclic six-card reserve", () => {
  const cards = "ABCDEFGHI".split("").map((code) => card(code));
  let pool = initializeCyclicCardPool(cards, () => 0.999999);
  assert.deepEqual(pool.activeCards.map(({ code }) => code), ["A", "B", "C"]);
  assert.deepEqual(pool.reserveQueue.map(({ code }) => code), ["D", "E", "F", "G", "H", "I"]);

  pool = cycleCardPoolSlot(pool, 1);
  assert.deepEqual(pool.activeCards.map(({ code }) => code), ["A", "D", "C"]);
  assert.deepEqual(pool.reserveQueue.map(({ code }) => code), ["E", "F", "G", "H", "I", "B"]);
  for (let index = 0; index < 6; index += 1) pool = cycleCardPoolSlot(pool, 1);
  assert.equal(pool.activeCards[1].code, "B");
  assert.equal(new Set([...pool.activeCards, ...pool.reserveQueue].map(({ code }) => code)).size, 9);
});

test("mirrored exchange uses the same selected slot and preserves historical card snapshots", () => {
  const playerCards = "ABCDEFGHI".split("").map((code) => card(code));
  const enemyCards = "JKLMNOPQR".split("").map((code) => card(code));
  const result = resolveDuelExchange({
    playerHp: 1_000,
    enemyHp: 1_000,
    playerPool: initializeCyclicCardPool(playerCards, () => 0.999999),
    enemyPool: initializeCyclicCardPool(enemyCards, () => 0.999999),
    playerModifiers: noModifiers,
    enemyModifiers: noModifiers,
    slotIndex: 2,
    turnNumber: 0,
  });
  assert.equal(result.exchange.playerCard.code, "C");
  assert.equal(result.exchange.enemyCard.code, "L");
  assert.equal(result.exchange.visualState, "neutral");
  assert.equal(result.playerPool.activeCards[2].code, "D");
  assert.equal(result.enemyPool.activeCards[2].code, "M");
  assert.equal(result.exchange.playerCard.code, "C");
  assert.equal(result.exchange.enemyCard.code, "L");
});

test("damage applies element, battle, and element collection modifiers", () => {
  assert.deepEqual(calculateDuelDamage({
    attackerFinalPower: 200,
    attackerElement: "water",
    defenderElement: "fire",
    battleDamagePct: 0,
    attackerElementDamagePct: 0,
  }), { damage: 300, multiplier: 1.5 });
  assert.deepEqual(calculateDuelDamage({
    attackerFinalPower: 180,
    attackerElement: "fire",
    defenderElement: "water",
    battleDamagePct: 0,
    attackerElementDamagePct: 0,
  }), { damage: 90, multiplier: 0.5 });
  assert.equal(calculateDuelDamage({
    attackerFinalPower: 200,
    attackerElement: "water",
    defenderElement: "fire",
    battleDamagePct: 10,
    attackerElementDamagePct: 5,
  }).damage, 345);
});

test("counterattack always resolves and a mutual KO is a challenger victory", () => {
  const playerCards = [card("A", "fire", 70), ..."BCDEFGHI".split("").map((code) => card(code))];
  const enemyCards = [card("J", "earth", 80), ..."KLMNOPQR".split("").map((code) => card(code))];
  const result = resolveDuelExchange({
    playerHp: 50,
    enemyHp: 50,
    playerPool: initializeCyclicCardPool(playerCards, () => 0.999999),
    enemyPool: initializeCyclicCardPool(enemyCards, () => 0.999999),
    playerModifiers: noModifiers,
    enemyModifiers: noModifiers,
    slotIndex: 0,
    turnNumber: 0,
  });
  assert.equal(result.playerHp, 0);
  assert.equal(result.enemyHp, 0);
  assert.equal(result.exchange.playerDamage, 70);
  assert.equal(result.exchange.enemyDamage, 80);
  assert.equal(result.status, "won");
});

test("win streak increments on wins, resets on loss, and widens the next search", () => {
  assert.equal(applyDuelOutcomeToStats({ duelWins: 0, duelLosses: 0, duelWinStreak: 0 }, "win").duelWinStreak, 1);
  assert.equal(applyDuelOutcomeToStats({ duelWins: 1, duelLosses: 0, duelWinStreak: 1 }, "win").duelWinStreak, 2);
  const five = applyDuelOutcomeToStats({ duelWins: 4, duelLosses: 0, duelWinStreak: 4 }, "win");
  assert.equal(five.duelWinStreak, 5);
  assert.equal(getMatchmakingRange(1_000, five.duelWinStreak).percentage, 15);
  assert.equal(applyDuelOutcomeToStats({ duelWins: 5, duelLosses: 0, duelWinStreak: 5 }, "loss").duelWinStreak, 0);
});

test("Duel XP and Silver formulas and collection reward modifiers are exact", () => {
  assert.equal(getDuelBaseXp(8, "win"), 60);
  assert.equal(getDuelBaseXp(8, "loss"), 34);
  assert.equal(getDuelBaseSilver(8, "win"), 120);
  assert.equal(getDuelBaseSilver(8, "loss"), 60);
  assert.deepEqual(calculateDuelReward(8, "win", {
    experienceRewardPct: 5,
    silverRewardPct: 5,
  }), { baseXp: 60, baseSilver: 120, xp: 63, silver: 126 });
});

test("linear account XP preserves overflow and supports multiple Gold-paying level-ups", () => {
  assert.equal(getRequiredAccountXp(8), 800);
  assert.deepEqual(applyAccountXp({ level: 1, xp: 80, gainedXp: 70 }), {
    newLevel: 2,
    remainingXp: 50,
    reachedLevels: [2],
    goldReward: 2,
  });
  assert.deepEqual(applyAccountXp({ level: 7, xp: 0, gainedXp: 700 }), {
    newLevel: 8,
    remainingXp: 0,
    reachedLevels: [8],
    goldReward: 8,
  });
  assert.deepEqual(applyAccountXp({ level: 7, xp: 0, gainedXp: 2_400 }), {
    newLevel: 10,
    remainingXp: 0,
    reachedLevels: [8, 9, 10],
    goldReward: 27,
  });
  assert.equal("gold" in calculateDuelReward(8, "win", noModifiers), false);
});

test("battle-log visual mapping identifies player strong, enemy strong, and neutral rows", () => {
  assert.equal(getDuelLogVisualState(1.5, 0.5), "player_strong");
  assert.equal(getDuelLogVisualState(0.5, 1.5), "enemy_strong");
  assert.equal(getDuelLogVisualState(1, 1), "neutral");
});
