import { addGuardianDragonHealth } from "./guardianDragon.js";

/**
 * Reference: the guardian dragon adds its own health to the player's health in duels, the arena,
 * the tournament and the guild witches battle, but not while it is away on a hike.
 * A row of another month is a dragon that has not been reborn yet, so it counts as zero health.
 */
export function getGuardianDragonBattleHealthBonus(input: {
  unlocked: boolean;
  rowMonthKey: string | null;
  currentMonthKey: string;
  health: number;
  hikeEndsAt: Date | null;
  /** Health of a finished hike that is not collected yet (the service applies it lazily). */
  hikeHealthGain?: number | null;
  now: Date;
}) {
  if (!input.unlocked || input.rowMonthKey !== input.currentMonthKey) return 0;
  if (input.hikeEndsAt && input.hikeEndsAt.getTime() > input.now.getTime()) return 0;
  const health = input.hikeEndsAt ? addGuardianDragonHealth(input.health, input.hikeHealthGain ?? 0) : input.health;
  return Math.max(0, Math.trunc(health));
}

/** Flat battle HP added after the percent bonuses and the mode multipliers. */
export function addFlatBattleHp(hp: number, flatBonus = 0) {
  return hp + Math.max(0, Math.trunc(flatBonus));
}
