import { calculateDuelDamage, getElementMultiplier } from "./duel.js";
import type { CardElement, DuelBattleModifiers, DuelCardSnapshot, ElementMultiplier } from "@cardastika/shared";

export const ARENA_PARTICIPANT_COUNT = 6;
export const ARENA_ACTIVE_CARD_COUNT = 3;
export const ARENA_QUEUE_DURATION_MS = 30_000;
export const ARENA_SLOT_COOLDOWN_MS = 9_000;
export const ARENA_BOT_ACTION_INTERVAL_MS = 1_200;
export const ARENA_REWARD_MULTIPLIER = 3;
export const ARENA_GOLD_DAILY_CAP = 15 * ARENA_REWARD_MULTIPLIER;

export const ARENA_RATING_CHANGES = Object.freeze([25, 18, 10, -8, -14, -20]);
export const ARENA_TOKEN_REWARDS = Object.freeze([30, 24, 18, 9, 6, 3]);
export const ARENA_GOLD_REWARDS = Object.freeze([9, 6, 3, 0, 0, 0]);
export const ARENA_SILVER_MULTIPLIERS = Object.freeze([1, 0.8, 0.65, 0.4, 0.3, 0.2]);
export const ARENA_BASE_SILVER_BY_LEAGUE = Object.freeze([
  100, 120, 150, 200, 250, 300, 400, 450, 500, 600, 650,
  700, 800, 850, 900, 1_000, 1_200, 1_500, 2_000, 2_200, 2_500,
]);

export const ARENA_CARD_CHANGE_COSTS = Object.freeze([0, 0, 0, 1, 2, 4, 6, 8, 10]);

export function getArenaCardChangeCost(changeNumber: number) {
  if (!Number.isSafeInteger(changeNumber) || changeNumber < 1) {
    throw new RangeError("Arena card change number must be a positive integer");
  }
  return ARENA_CARD_CHANGE_COSTS[Math.min(changeNumber, ARENA_CARD_CHANGE_COSTS.length) - 1] ?? 10;
}

export function calculateArenaDamage(input: {
  attacker: DuelCardSnapshot;
  attackerModifiers: DuelBattleModifiers;
  defender: DuelCardSnapshot;
  defenderModifiers?: DuelBattleModifiers;
}) {
  const attack = calculateDuelDamage({
    attackerFinalPower: input.attacker.finalPower,
    attackerElement: input.attacker.element,
    defenderElement: input.defender.element,
    battleDamagePct: input.attackerModifiers.battleDamagePct,
    attackerElementDamagePct: input.attackerModifiers.elementDamagePct[input.attacker.element],
    attackerEquipment: input.attackerModifiers.equipment,
  });
  return {
    ...attack,
    damage: Math.round(attack.damage * Math.max(0, 1 - (input.defenderModifiers?.equipment?.incomingDamageReductionPct ?? 0) / 100)),
  };
}

export function getArenaMultiplier(attacker: CardElement, defender: CardElement): ElementMultiplier {
  return getElementMultiplier(attacker, defender);
}

export function compareArenaResults(
  left: { remainingHp: number; kills: number; totalDamageDealt: number },
  right: { remainingHp: number; kills: number; totalDamageDealt: number },
) {
  return right.totalDamageDealt - left.totalDamageDealt
    || right.kills - left.kills
    || right.remainingHp - left.remainingHp;
}

export function getArenaRatingChange(placement: number) {
  if (!Number.isSafeInteger(placement) || placement < 1 || placement > ARENA_PARTICIPANT_COUNT) {
    throw new RangeError("Arena placement must be between 1 and 6");
  }
  return ARENA_RATING_CHANGES[placement - 1]!;
}

export function getArenaReward(placement: number, leagueIndex: number, availableDailyGold: number, rewardMultiplier: 1 | 2 = 1) {
  if (!Number.isSafeInteger(leagueIndex) || leagueIndex < 0 || leagueIndex >= ARENA_BASE_SILVER_BY_LEAGUE.length) {
    throw new RangeError("Arena league index is outside the configured range");
  }
  if (!Number.isSafeInteger(availableDailyGold) || availableDailyGold < 0) {
    throw new RangeError("Available daily gold must be a non-negative integer");
  }
  if (rewardMultiplier !== 1 && rewardMultiplier !== 2) {
    throw new RangeError("Arena reward multiplier must be 1 or 2");
  }
  const goldBeforeCap = (ARENA_GOLD_REWARDS[placement - 1] ?? 0) * rewardMultiplier;
  const gold = Math.min(goldBeforeCap, Math.max(0, ARENA_GOLD_DAILY_CAP * rewardMultiplier - availableDailyGold));
  return {
    arenaTokens: ARENA_TOKEN_REWARDS[placement - 1] ?? 0,
    gold,
    goldCapped: gold < goldBeforeCap,
    silver: Math.round(ARENA_BASE_SILVER_BY_LEAGUE[leagueIndex]! * (ARENA_SILVER_MULTIPLIERS[placement - 1] ?? 0) * ARENA_REWARD_MULTIPLIER * rewardMultiplier),
    ratingChange: getArenaRatingChange(placement),
  };
}
