import { getElementMultiplier } from "./duel.js";

/**
 * Paid Duels from the reference manual. Once the charges are spent, gold either reopens ten manual
 * Duels (the break timer resets) or plays ten Duels automatically, both at the same price.
 */
export const DUEL_BREAK_PRICE_TIERS = [25, 50, 100, 250, 500, 1000] as const;
/** Every 1000 automatic Duels played today (100 presses of the ten-Duel button) raise the price one step. */
export const DUEL_AUTO_TIER_STEP = 1000;
export const DUEL_AUTO_PACK_SIZE = 10;
/** After a won Duel the remaining charges can be played automatically for 1 gold each. */
export const DUEL_AUTO_REMAINING_PRICE_PER_DUEL = 1;

/** Today's full price; the counter resets with the next UTC day. */
export function getDuelBreakBasePrice(autoDuelsToday: number) {
  if (!Number.isSafeInteger(autoDuelsToday) || autoDuelsToday < 0) {
    throw new RangeError("Automatic Duels played today must be a non-negative whole number");
  }
  const tier = Math.min(DUEL_BREAK_PRICE_TIERS.length - 1, Math.floor(autoDuelsToday / DUEL_AUTO_TIER_STEP));
  return DUEL_BREAK_PRICE_TIERS[tier]!;
}

/**
 * The price shrinks with the break time still left: 50 × 72 / 120 = 30, 25 × 3 / 90 → 1 (reference examples).
 * Never below 1 while the break lasts.
 */
export function getDuelBreakPrice(autoDuelsToday: number, remainingBreakMs: number, totalBreakMs: number) {
  if (!(totalBreakMs > 0)) throw new RangeError("Break length must be positive");
  const base = getDuelBreakBasePrice(autoDuelsToday);
  const left = Math.min(Math.max(remainingBreakMs, 0), totalBreakMs);
  return Math.max(1, Math.ceil(base * left / totalBreakMs - 1e-9));
}

export function getDuelAutoRemainingPrice(remaining: number) {
  return Math.max(0, remaining) * DUEL_AUTO_REMAINING_PRICE_PER_DUEL;
}

interface AutoSlotCard {
  element: Parameters<typeof getElementMultiplier>[0];
  finalPower: number;
}

/**
 * Automatic fights pick the pair with the best trade: own hit minus the return hit.
 * The reference does not describe its choice, so this is our assumption.
 */
export function chooseAutoDuelSlot(
  player: readonly [AutoSlotCard, AutoSlotCard, AutoSlotCard],
  enemy: readonly [AutoSlotCard, AutoSlotCard, AutoSlotCard],
): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  let bestScore = -Infinity;
  for (const slot of [0, 1, 2] as const) {
    const own = player[slot].finalPower * getElementMultiplier(player[slot].element, enemy[slot].element);
    const back = enemy[slot].finalPower * getElementMultiplier(enemy[slot].element, player[slot].element);
    const score = own - back;
    if (score > bestScore) {
      best = slot;
      bestScore = score;
    }
  }
  return best;
}
