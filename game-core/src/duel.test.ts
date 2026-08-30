import assert from "node:assert/strict";
import test from "node:test";
import type { CardElement, DuelBattleModifiers, DuelCardSnapshot } from "@cardastika/shared";
import {
  ACCOUNT_XP_REQUIRED_BY_LEVEL,
  applyAccountXp,
  applyDuelOutcomeToStats,
  calculateDuelDamage,
  calculateDuelReward,
  getDuelGoldReward,
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

test("equipment modifies damage and consumes the amulet only once", () => {
  const result = resolveDuelExchange({
    playerHp: 100,
    enemyHp: 100,
    playerMaxHp: 100,
    enemyMaxHp: 100,
    playerPool: initializeCyclicCardPool([card("A"), ..."BCDEFGHI".split("").map((code) => card(code))], () => 0.999999),
    enemyPool: initializeCyclicCardPool([card("J"), ..."KLMNOPQR".split("").map((code) => card(code))], () => 0.999999),
    playerModifiers: {
      ...noModifiers,
      equipment: { damageReflectionPct: 0, incomingDamageReductionPct: 0, outgoingDamagePct: 10, reviveHpPct: 20, voodooHpReductionPct: 0 },
      equipmentState: { reviveUsed: false, voodooUsed: false },
    },
    enemyModifiers: {
      ...noModifiers,
      equipment: { damageReflectionPct: 0, incomingDamageReductionPct: 25, outgoingDamagePct: 0, reviveHpPct: 0, voodooHpReductionPct: 0 },
    },
    equipmentEnabled: true,
    slotIndex: 0,
    turnNumber: 0,
  });

  assert.equal(result.exchange.playerDamage, 83);
  assert.equal(result.exchange.enemyDamage, 100);
  assert.equal(result.playerHp, 20);
  assert.equal(result.enemyHp, 17);
  assert.equal(result.playerEquipmentState.reviveUsed, true);
  assert.equal(result.status, "active");
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
  }), { accountBoostMultiplier: 1, baseXp: 60, baseSilver: 120, xp: 63, silver: 126 });

  assert.deepEqual(calculateDuelReward(8, "win", {
    experienceRewardPct: 5,
    silverRewardPct: 5,
  }, 2), { accountBoostMultiplier: 2, baseXp: 60, baseSilver: 120, xp: 123, silver: 252 });
  assert.deepEqual(calculateDuelReward(8, "win", {
    experienceRewardPct: 5,
    silverRewardPct: 5,
  }, 2, 100_000), { accountBoostMultiplier: 2, baseXp: 100_000, baseSilver: 120, xp: 205_000, silver: 252 });
});

test("Duel victory Gold is random, level-capped, and unavailable on losses", () => {
  assert.equal(getDuelGoldReward(8, "win", 0, () => 0), 1);
  assert.equal(getDuelGoldReward(8, "win", 0, () => 0.999), 2);
  assert.equal(getDuelGoldReward(1, "win", 0, () => 0.999), 1);
  assert.equal(getDuelGoldReward(8, "win", 8, () => 0), 0);
  assert.equal(getDuelGoldReward(8, "loss", 0, () => 0), 0);
  assert.equal(getDuelGoldReward(8, "win", 0, () => 0, 2), 2);
  assert.equal(getDuelGoldReward(8, "win", 15, () => 0.999, 2), 1);
  assert.equal(getDuelGoldReward(8, "win", 16, () => 0, 2), 0);
});

test("canonical account XP table preserves overflow and caps at level 120", () => {
  assert.equal(ACCOUNT_XP_REQUIRED_BY_LEVEL.length, 121);
  assert.equal(ACCOUNT_XP_REQUIRED_BY_LEVEL[51], 11_630_000);
  assert.equal(ACCOUNT_XP_REQUIRED_BY_LEVEL[81], 1_000_000_000);
  assert.equal(ACCOUNT_XP_REQUIRED_BY_LEVEL[120], 4_000_000_000);
  assert.equal(getRequiredAccountXp(1), 240);
  assert.equal(getRequiredAccountXp(2), 500);
  assert.equal(getRequiredAccountXp(8), 72_500);
  assert.equal(getRequiredAccountXp(80), 1_000_000_000);
  assert.equal(getRequiredAccountXp(120), 0);
  assert.deepEqual(applyAccountXp({ level: 1, xp: 200, gainedXp: 70 }), {
    newLevel: 2,
    remainingXp: 30,
    reachedLevels: [2],
    goldReward: 2,
  });
  assert.deepEqual(applyAccountXp({ level: 1, xp: 0, gainedXp: 740 }), {
    newLevel: 3,
    remainingXp: 0,
    reachedLevels: [2, 3],
    goldReward: 5,
  });
  assert.deepEqual(applyAccountXp({ level: 119, xp: 3_999_999_999, gainedXp: 1 }), {
    newLevel: 120,
    remainingXp: 0,
    reachedLevels: [120],
    goldReward: 120,
  });
  assert.equal("gold" in calculateDuelReward(8, "win", noModifiers), false);
});

test("battle-log visual mapping identifies player strong, enemy strong, and neutral rows", () => {
  assert.equal(getDuelLogVisualState(1.5, 0.5), "player_strong");
  assert.equal(getDuelLogVisualState(0.5, 1.5), "enemy_strong");
  assert.equal(getDuelLogVisualState(1, 1), "neutral");
});
