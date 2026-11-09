import type { RandomSource } from "./duel.js";

/** Per-slot deviation of a bot card from the matching player card before rescaling. */
export const BOT_PROFILE_JITTER_PCT = 12;

export interface DeckPowerProfileOptions {
  deckSize: number;
  minCardPower: number;
  jitterPct?: number;
}

function median(sortedDescending: readonly number[]): number {
  const middle = Math.floor(sortedDescending.length / 2);
  return sortedDescending.length % 2
    ? sortedDescending[middle]!
    : (sortedDescending[middle - 1]! + sortedDescending[middle]!) / 2;
}

/**
 * Normalized strength shape of a player deck: strongest slot first, exactly
 * `deckSize` entries. Missing slots of an incomplete deck take the median
 * card; an empty deck becomes a flat profile.
 */
export function getDeckPowerProfile(cardPowers: readonly number[], deckSize: number): number[] {
  const powers = cardPowers
    .filter((power) => Number.isFinite(power) && power > 0)
    .sort((left, right) => right - left)
    .slice(0, deckSize);
  if (!powers.length) return Array.from({ length: deckSize }, () => 1);
  const filler = median(powers);
  while (powers.length < deckSize) powers.push(filler);
  return powers;
}

/**
 * Splits `totalPower` across bot slots so the bot copies the player's deck
 * shape (mostly weak cards + a few strong ones) instead of a flat average.
 * Result is ordered like the profile: strongest slot first (before jitter).
 */
export function distributeDeckPowerByProfile(
  playerCardPowers: readonly number[],
  totalPower: number,
  options: DeckPowerProfileOptions,
  random: RandomSource,
): number[] {
  const { deckSize, minCardPower, jitterPct = BOT_PROFILE_JITTER_PCT } = options;
  const minimumTotal = deckSize * minCardPower;
  if (!Number.isSafeInteger(totalPower) || totalPower < minimumTotal) {
    throw new RangeError(`Bot deck power must be a safe integer of at least ${minimumTotal}`);
  }

  const weights = getDeckPowerProfile(playerCardPowers, deckSize).map((power) => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("Bot opponent RNG must return a value from 0 inclusive to 1 exclusive");
    }
    return power * (1 + jitterPct * (2 * value - 1) / 100);
  });

  // Scale to the target total; slots that would fall below the minimum card
  // power are pinned there and the rest is rescaled over the remaining slots.
  const exact = new Array<number>(deckSize).fill(0);
  const free = new Set(weights.map((_, index) => index));
  let remaining = totalPower;
  for (;;) {
    const weightTotal = [...free].reduce((sum, index) => sum + weights[index]!, 0);
    const pinned = [...free].filter((index) => remaining * weights[index]! / weightTotal < minCardPower);
    if (!pinned.length) {
      for (const index of free) exact[index] = remaining * weights[index]! / weightTotal;
      break;
    }
    for (const index of pinned) {
      exact[index] = minCardPower;
      free.delete(index);
      remaining -= minCardPower;
    }
  }

  const powers = exact.map(Math.floor);
  let remainder = totalPower - powers.reduce((sum, power) => sum + power, 0);
  const order = exact
    .map((value, index) => ({ fraction: value - Math.floor(value), index }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let step = 0; remainder > 0; step += 1, remainder -= 1) {
    const index = order[step % order.length]!.index;
    powers[index] = powers[index]! + 1;
  }
  return powers;
}
