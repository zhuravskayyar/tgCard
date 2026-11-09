import { calculateDuelDamage, getElementMultiplier } from "./duel.js";
import type { CardElement, DuelBattleModifiers, DuelCardSnapshot, ElementMultiplier } from "@cardastika/shared";

export const ARENA_PARTICIPANT_COUNT = 6;
export const ARENA_ACTIVE_CARD_COUNT = 3;
/** Registration time by league tier (three leagues per tier): grey, green, blue, epic, then every higher tier. */
export const ARENA_QUEUE_SECONDS_BY_TIER = Object.freeze([5, 10, 15, 20, 25]);
/** Every other live player who signs up brings the start this much closer. */
export const ARENA_QUEUE_JOIN_SHORTENING_MS = 5_000;
export const ARENA_QUEUE_MIN_DURATION_MS = 5_000;
/** One battle cycle: three strikes, then the used lanes get new cards at the next cycle. */
export const ARENA_SLOT_COOLDOWN_MS = 9_000;
// Half a cycle: a bot strikes once in the first cycle, then twice in every later one.
export const ARENA_BOT_ACTION_INTERVAL_MS = 4_500;
export const ARENA_MIN_COUNTED_MOVES = 3;
export const ARENA_UNCOUNTED_RATING_CHANGE = -3;
export const ARENA_IDLE_FINISH_MS = 180_000;
export const ARENA_NO_WINNERS_ALIVE_COUNT = 4;

export const ARENA_RATING_CHANGES = Object.freeze([24, 18, 12, -6, -10, -14]);

/** The first card change in a battle is free, every later one costs the same gold. */
export const ARENA_CARD_CHANGE_COSTS = Object.freeze([0, 5]);

export function getArenaCardChangeCost(changeNumber: number) {
  if (!Number.isSafeInteger(changeNumber) || changeNumber < 1) {
    throw new RangeError("Arena card change number must be a positive integer");
  }
  return ARENA_CARD_CHANGE_COSTS[Math.min(changeNumber, ARENA_CARD_CHANGE_COSTS.length) - 1]!;
}

/** How long the registration lasts for a queue opened in this league with this many live players. */
export function getArenaQueueDurationMs(leagueIndex: number, participantCount: number) {
  const tier = Math.max(0, Math.floor(leagueIndex / 3));
  const base = (ARENA_QUEUE_SECONDS_BY_TIER[Math.min(tier, ARENA_QUEUE_SECONDS_BY_TIER.length - 1)] ?? 25) * 1_000;
  const shortening = Math.max(0, participantCount - 1) * ARENA_QUEUE_JOIN_SHORTENING_MS;
  return Math.max(Math.min(base, ARENA_QUEUE_MIN_DURATION_MS), base - shortening);
}

/**
 * Level range of the daily "win arenas" reward card by arena league tier (three leagues per tier).
 * Never below epic (level 20); higher tiers give stronger cards. Our own balance on the reference idea.
 */
export const ARENA_REWARD_CARD_LEVELS_BY_TIER: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([20, 24] as const),
  Object.freeze([24, 28] as const),
  Object.freeze([29, 33] as const),
  Object.freeze([35, 42] as const),
  Object.freeze([44, 50] as const),
  Object.freeze([50, 56] as const),
  Object.freeze([60, 63] as const),
]);

export function getArenaRewardCardLevelRange(arenaLeagueIndex: number): readonly [number, number] {
  const tier = Math.max(0, Math.floor(arenaLeagueIndex / 3));
  return ARENA_REWARD_CARD_LEVELS_BY_TIER[Math.min(tier, ARENA_REWARD_CARD_LEVELS_BY_TIER.length - 1)]!;
}

/** The moment the current cycle ends; a lane used now opens again with a new card at that moment. */
export function getArenaCycleEnd(cyclesStartAtMs: number, nowMs: number) {
  if (nowMs < cyclesStartAtMs) return cyclesStartAtMs;
  return cyclesStartAtMs + (Math.floor((nowMs - cyclesStartAtMs) / ARENA_SLOT_COOLDOWN_MS) + 1) * ARENA_SLOT_COOLDOWN_MS;
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
