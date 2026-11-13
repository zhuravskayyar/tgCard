/**
 * Guild witch raids, copied from the reference rules (docs/reference-elem-raids.md).
 * Only the names are our own («Чотири чаклунки», «Відьмин скарб»); numbers follow the reference.
 */

export const WITCH_RAID_MIN_GUILD_LEVEL = 34;
export const WITCH_RAID_MAX_LEVEL = 25;
export const WITCH_BATTLE_LOG_SIZE = 10;
export const WITCH_CURSE_INTERVAL_MS = 60_000;
export const WITCH_CURSE_DAMAGE_PCT = 10;
export const WITCH_HEAL_THRESHOLDS = Object.freeze([0.75, 0.5, 0.25] as const);
/** The «Witches» collection of the reference is our «Чотири чаклунки». */
export const WITCH_COLLECTION_CODE = "sorceresses";

/** Health of each witch, levels 1–25. */
export const WITCH_HEALTH_BY_LEVEL: readonly number[] = Object.freeze([
  450_000, 510_000, 590_000, 670_000, 760_000, 870_000,
  1_100_000, 1_400_000, 1_760_000, 2_200_000, 2_700_000,
  3_200_000, 4_100_000, 4_900_000, 6_000_000, 7_300_000,
  8_700_000, 10_500_000, 12_500_000, 15_000_000, 17_800_000,
  21_000_000, 25_000_000, 30_000_000, 35_000_000,
]);

/** Fixed power of the unique witch card, levels 1–25. */
export const WITCH_UNIQUE_CARD_POWER_BY_LEVEL: readonly number[] = Object.freeze([
  7500, 8017, 8570, 9162, 9795, 10470, 11192, 11965, 12790, 13672,
  14617, 15625, 16702, 17855, 19087, 20405, 21812, 23317, 24927, 26647,
  28485, 30450, 32552, 34797, 37197,
]);

export function getWitchHealth(level: number) {
  return WITCH_HEALTH_BY_LEVEL[assertWitchLevel(level) - 1]!;
}

export function getWitchUniqueCardPower(level: number) {
  return WITCH_UNIQUE_CARD_POWER_BY_LEVEL[assertWitchLevel(level) - 1]!;
}

/** Treasure card: level 80 + witch level, base power bonus 1820 (81 → 7100 … 105 → 9680). */
export const WITCH_TREASURE_CARD_LEVEL_OFFSET = 80;
export const WITCH_TREASURE_CARD_BONUS_POWER = 1820;

export type WitchTreasure =
  | { kind: "gold"; amount: number }
  | { kind: "silver"; amount: number }
  | { kind: "card"; level: number; bonusPower: number };

/**
 * The five treasures of the reference. It names no odds, so each is equally likely.
 */
export function rollWitchTreasure(level: number, random: () => number): WitchTreasure {
  const safeLevel = assertWitchLevel(level);
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("Random source must return a value in [0, 1)");
  const index = Math.floor(roll * 5);
  if (index === 0) return { kind: "gold", amount: 50 * safeLevel };
  if (index === 1) return { kind: "gold", amount: 100 * safeLevel };
  if (index === 2) return { kind: "silver", amount: 50_000 * safeLevel };
  if (index === 3) return { kind: "silver", amount: 200_000 * safeLevel };
  return { kind: "card", level: WITCH_TREASURE_CARD_LEVEL_OFFSET + safeLevel, bonusPower: WITCH_TREASURE_CARD_BONUS_POWER };
}

/** Digging lasts as many hours as the witch level; «Гноми на відпочинку» halve it. */
export function getWitchTreasureDigMinutes(level: number, peacefulDwarves: boolean) {
  const minutes = assertWitchLevel(level) * 60;
  return peacefulDwarves ? minutes / 2 : minutes;
}

/**
 * Altar: X is the highest witch level beaten last week. Strong potion +X% HP for 2X gold;
 * mighty potion +X/2% HP for 1000X silver. The full witch collection makes the gold potion two levels higher.
 */
export function getAltarPotions(lastWeekLevel: number, witchCollectionComplete: boolean) {
  const level = Math.max(0, Math.min(WITCH_RAID_MAX_LEVEL, Math.trunc(lastWeekLevel)));
  return {
    level,
    gold: { hpPct: level > 0 ? level + (witchCollectionComplete ? 2 : 0) : 0, price: level * 2 },
    silver: { hpPct: level / 2, price: level * 1000 },
  };
}

function assertWitchLevel(level: number) {
  if (!Number.isSafeInteger(level) || level < 1 || level > WITCH_RAID_MAX_LEVEL) {
    throw new RangeError(`Witch raid level must be 1–${WITCH_RAID_MAX_LEVEL}`);
  }
  return level;
}
