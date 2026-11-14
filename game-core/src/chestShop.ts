import type { CardRarity } from "@cardastika/shared";

/**
 * Chest shop from the reference manual (`/forum/3/228581/`): 15 chests opened in order for silver,
 * each holding one random prize. The shop stays open for 4 hours; an unfinished shop restarts from
 * chest 1 next time, and opening all 15 closes it at once.
 */
export const CHEST_SHOP_CHEST_COUNT = 15;
export const CHEST_SHOP_OPEN_MS = 4 * 60 * 60 * 1_000;
/** If the 9th (weakest) battle deck card is below this level, card and source prizes are level 1. */
export const CHEST_SHOP_MIN_NINTH_CARD_LEVEL = 19;

export type ChestPrizeKind = "gold_small" | "gold_large" | "diamonds" | "equipment" | "card" | "source";

export interface ChestShopChest {
  number: number;
  price: number;
  goldSmall: number;
  goldLarge: number;
  diamonds: number;
  equipmentRarity: CardRarity;
  /** Card and source prizes are this many levels below the 9th battle deck card. */
  levelsBelowNinthCard: number;
}

function chest(number: number, price: number, goldSmall: number, equipmentRarity: CardRarity): ChestShopChest {
  return {
    number,
    price,
    goldSmall,
    goldLarge: goldSmall * 2,
    diamonds: number,
    equipmentRarity,
    levelsBelowNinthCard: 20 - number,
  };
}

/** Prices and prizes copied from the reference table; all 15 cost 20 010 000 silver. */
export const CHEST_SHOP_CHESTS: readonly ChestShopChest[] = Object.freeze([
  chest(1, 10_000, 20, "common"),
  chest(2, 15_000, 30, "common"),
  chest(3, 25_000, 40, "common"),
  chest(4, 40_000, 50, "common"),
  chest(5, 70_000, 60, "common"),
  chest(6, 100_000, 70, "common"),
  chest(7, 200_000, 80, "common"),
  chest(8, 300_000, 90, "common"),
  chest(9, 500_000, 100, "common"),
  chest(10, 750_000, 110, "uncommon"),
  chest(11, 1_000_000, 130, "uncommon"),
  chest(12, 2_000_000, 150, "uncommon"),
  chest(13, 3_000_000, 170, "uncommon"),
  chest(14, 5_000_000, 190, "rare"),
  chest(15, 7_000_000, 210, "rare"),
]);

/**
 * The manual lists the six possible prizes but not their odds, so every prize has the same weight.
 * This is our assumption; change the weights here.
 */
export const CHEST_PRIZE_WEIGHTS: Readonly<Record<ChestPrizeKind, number>> = Object.freeze({
  gold_small: 1,
  gold_large: 1,
  diamonds: 1,
  equipment: 1,
  card: 1,
  source: 1,
});

/** Chests from this number up appear in the public feed of other players' prizes. */
export const CHEST_SHOP_FEED_FROM = 8;

export function getChestShopChest(number: number) {
  const found = CHEST_SHOP_CHESTS[number - 1];
  if (!found) throw new RangeError("Chest number must be between 1 and 15");
  return found;
}

export function pickChestPrizeKind(random: () => number = Math.random): ChestPrizeKind {
  const entries = Object.entries(CHEST_PRIZE_WEIGHTS) as [ChestPrizeKind, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [kind, weight] of entries) {
    roll -= weight;
    if (roll < 0) return kind;
  }
  return entries[entries.length - 1]![0];
}

/** Level of a card or magic source prize from the 9th battle deck card (the weakest of the nine). */
export function getChestPrizeLevel(chestNumber: number, ninthCardLevel: number) {
  if (ninthCardLevel < CHEST_SHOP_MIN_NINTH_CARD_LEVEL) return 1;
  return Math.max(1, ninthCardLevel - getChestShopChest(chestNumber).levelsBelowNinthCard);
}

/** Monday 00:00 UTC of the week, as YYYY-MM-DD; the same week boundary as guild raids. */
export function getChestShopWeekKey(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export interface ChestShopState {
  openUntil: Date | null;
  nextChest: number;
  /** Week key of the last weekly opening, or null. */
  weeklyOpenedWeek: string | null;
}

/** Open right now: within its 4 hours. */
export function isChestShopOpen(state: ChestShopState, now: Date) {
  return state.openUntil !== null && state.openUntil.getTime() > now.getTime();
}

/**
 * Our opening rule (the user asked for a weekly bonus): one opening per Monday-to-Sunday week, started
 * by the player. The reference opens it for every 1000 gold bought or spent; that is not implemented.
 */
export function canOpenChestShop(state: ChestShopState, now: Date) {
  return !isChestShopOpen(state, now) && state.weeklyOpenedWeek !== getChestShopWeekKey(now);
}
