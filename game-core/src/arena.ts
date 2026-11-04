import { calculateDuelDamage, getElementMultiplier } from "./duel.js";
import type { CardElement, DuelBattleModifiers, DuelCardSnapshot, ElementMultiplier } from "@cardastika/shared";

export const ARENA_PARTICIPANT_COUNT = 6;
export const ARENA_ACTIVE_CARD_COUNT = 3;
export const ARENA_QUEUE_DURATION_MS = 15_000;
export const ARENA_SLOT_COOLDOWN_MS = 9_000;
// Half a cycle: a bot strikes once in the first cycle, then twice in every later one.
export const ARENA_BOT_ACTION_INTERVAL_MS = 4_500;
export const ARENA_MIN_COUNTED_MOVES = 3;
export const ARENA_UNCOUNTED_RATING_CHANGE = -3;
export const ARENA_IDLE_FINISH_MS = 180_000;
export const ARENA_NO_WINNERS_ALIVE_COUNT = 4;

export const ARENA_RATING_CHANGES = Object.freeze([24, 18, 12, -6, -10, -14]);
export const ARENA_TOKEN_REWARDS = Object.freeze([30, 24, 18, 9, 6, 3]);

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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Rating depends on place, on how strong the opposition was and on the damage dealt.
export function calculateArenaRatingChange(input: {
  averageDamage: number;
  averageOpponentRating: number;
  damageDealt: number;
  placement: number;
  playerRating: number;
}) {
  if (!Number.isSafeInteger(input.placement) || input.placement < 1 || input.placement > ARENA_PARTICIPANT_COUNT) {
    throw new RangeError("Arena placement must be between 1 and 6");
  }
  const opposition = clamp((input.averageOpponentRating - input.playerRating) / 40, -8, 8);
  const damage = input.averageDamage > 0 ? clamp((input.damageDealt / input.averageDamage - 1) * 4, -4, 6) : 0;
  return ARENA_RATING_CHANGES[input.placement - 1]! + Math.round(opposition + damage);
}

export function getArenaTokenReward(placement: number) {
  return ARENA_TOKEN_REWARDS[placement - 1] ?? 0;
}
