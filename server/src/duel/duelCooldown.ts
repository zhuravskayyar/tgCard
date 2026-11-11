import type { DuelAvailability } from "@cardastika/shared";

type DuelCharges = Pick<DuelAvailability, "remaining" | "max" | "refillAt">;

export const DUEL_CAPACITY = 10;
export const DUEL_COOLDOWN_MS = 2 * 60 * 60 * 1_000;

export interface DuelCooldownState {
  duel_remaining: number;
  duel_refill_at: Date | string | null;
}

export function getDuelAvailability(state: DuelCooldownState, now: Date): DuelCharges {
  const refillAt = state.duel_refill_at ? new Date(state.duel_refill_at).getTime() : null;
  if (state.duel_remaining === 0 && refillAt !== null && refillAt <= now.getTime()) {
    return { remaining: DUEL_CAPACITY, max: DUEL_CAPACITY, refillAt: null };
  }
  return {
    remaining: state.duel_remaining,
    max: DUEL_CAPACITY,
    refillAt: refillAt === null ? null : new Date(refillAt).toISOString(),
  };
}

export function spendDuel(availability: DuelCharges, now: Date, cooldownReductionMinutes = 0): DuelCharges {
  if (availability.remaining <= 0) throw new RangeError("No duels remaining");
  if (!Number.isSafeInteger(cooldownReductionMinutes) || cooldownReductionMinutes < 0) {
    throw new RangeError("Duel cooldown reduction must be a non-negative whole number of minutes");
  }
  const remaining = availability.remaining - 1;
  return {
    remaining,
    max: DUEL_CAPACITY,
    refillAt: remaining === 0
      ? new Date(now.getTime() + Math.max(60_000, DUEL_COOLDOWN_MS - cooldownReductionMinutes * 60_000)).toISOString()
      : null,
  };
}
