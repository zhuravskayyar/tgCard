import { getDuelAutoRemainingPrice, getDuelBreakPrice } from "@cardastika/game-core";
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
      ? new Date(now.getTime() + getDuelBreakMs(cooldownReductionMinutes)).toISOString()
      : null,
  };
}

/** Break length: two hours, minus the completed collection reduction, never under a minute. */
export function getDuelBreakMs(cooldownReductionMinutes = 0) {
  return Math.max(60_000, DUEL_COOLDOWN_MS - cooldownReductionMinutes * 60_000);
}

/** Gold prices for automatic and reopened Duels, read from the current charges. */
export function getDuelPaidPrices(
  charges: DuelCharges,
  autoDuelsToday: number,
  cooldownReductionMinutes: number,
  now: Date,
): Pick<DuelAvailability, "autoRemainingPrice" | "breakPrice"> {
  return {
    autoRemainingPrice: getDuelAutoRemainingPrice(charges.remaining),
    breakPrice: charges.remaining === 0 && charges.refillAt
      ? getDuelBreakPrice(
        autoDuelsToday,
        new Date(charges.refillAt).getTime() - now.getTime(),
        getDuelBreakMs(cooldownReductionMinutes),
      )
      : null,
  };
}
