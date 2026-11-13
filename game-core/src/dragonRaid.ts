/**
 * Guild dragon raids, copied from the reference rules (docs/reference-elem-raids.md).
 * Only the names are our own; numbers and mechanics follow the reference.
 */

export type DragonLairKind = "ancient" | "rare";

export interface DragonLairDefinition {
  /** Stable lair code used in the database and API. */
  code: string;
  kind: DragonLairKind;
  /** Card id of the dragon the lair holds; also the reward card. */
  cardId: string;
  lairName: string;
  health: number;
}

export const DRAGON_LAIRS: readonly DragonLairDefinition[] = Object.freeze([
  { code: "fire", kind: "ancient", cardId: "fire_dragon", lairName: "Смоляна печера", health: 300_000 },
  { code: "north", kind: "ancient", cardId: "north_dragon", lairName: "Гніздо на Перевалі", health: 300_000 },
  { code: "silver", kind: "ancient", cardId: "silver_dragon", lairName: "Срібна копальня", health: 300_000 },
  { code: "leviathan", kind: "ancient", cardId: "ancient_leviathan", lairName: "Сива безодня", health: 300_000 },
  { code: "black", kind: "rare", cardId: "black_dragon", lairName: "Чорна вежа", health: 500_000 },
  { code: "feathered", kind: "rare", cardId: "feathered_dragon", lairName: "Пернаті скелі", health: 500_000 },
  { code: "underground", kind: "rare", cardId: "underground_dragon", lairName: "Полозові нори", health: 500_000 },
  { code: "sea", kind: "rare", cardId: "sea_dragon", lairName: "Зміїна затока", health: 500_000 },
].map((lair) => Object.freeze(lair as DragonLairDefinition)));

export function getDragonLair(code: string) {
  return DRAGON_LAIRS.find((lair) => lair.code === code) ?? null;
}

/** Ancient decks draw from «Старі змії» plus the Leviathan card; rare decks from «Шулікові улюбленці». */
export const DRAGON_DECK_SOURCES: Readonly<Record<DragonLairKind, { collectionCode: string; extraCardIds: readonly string[] }>> = Object.freeze({
  ancient: Object.freeze({ collectionCode: "dragons", extraCardIds: Object.freeze(["ancient_leviathan"]) }),
  rare: Object.freeze({ collectionCode: "ufavorites", extraCardIds: Object.freeze([]) }),
});

export const DRAGON_DECK_SIZE = 9;
export const DRAGON_CARD_POWER_RANGE: Readonly<Record<DragonLairKind, readonly [number, number]>> = Object.freeze({
  ancient: Object.freeze([2700, 3300] as const),
  rare: Object.freeze([3900, 4800] as const),
});

export const DRAGON_BREATH_INTERVAL_MS = 30_000;
export const DRAGON_BREATH_DAMAGE: Readonly<Record<DragonLairKind, number>> = Object.freeze({ ancient: 10_000, rare: 20_000 });
export const DRAGON_BATTLE_LOG_SIZE = 5;
export const DRAGON_INACTIVE_ENROLLMENT_MINUTES = 15;
export const RAID_CARD_SWAP_GOLD = 10;

/** Reward card level; its power is the level's base plus the standard 0–20% bonus (59 → 2680–3216, 69 → 3630–4356). */
export const DRAGON_REWARD_CARD_LEVEL: Readonly<Record<DragonLairKind, number>> = Object.freeze({ ancient: 59, rare: 69 });

export const DRAGON_LAIR_MAX_LEVEL = 20;

const HOUR = 1;
const DAY = 24 * HOUR;
/** Respawn time in hours for lair levels 1–20. */
export const DRAGON_RESPAWN_HOURS: readonly number[] = Object.freeze([
  6 * DAY + 20, 6 * DAY + 12, 6 * DAY + 4, 5 * DAY + 20, 4 * DAY + 20,
  4 * DAY + 14, 4 * DAY + 8, 4 * DAY + 2, 3 * DAY + 20, 2 * DAY + 20,
  2 * DAY + 16, 2 * DAY + 12, 2 * DAY + 8, 2 * DAY + 4, 1 * DAY + 12,
  1 * DAY + 10, 1 * DAY + 8, 1 * DAY + 6, 1 * DAY + 4, 20 * HOUR,
]);

export function getDragonRespawnHours(lairLevel: number) {
  assertLairLevel(lairLevel);
  return DRAGON_RESPAWN_HOURS[lairLevel - 1]!;
}

export interface DragonLairUpgradeCost {
  currency: "gold" | "silver";
  amount: number;
}

const GOLD_LEVELS: Readonly<Record<number, number>> = Object.freeze({ 5: 2_000, 10: 10_000, 15: 50_000, 20: 100_000 });
const SILVER_STEPS: readonly { from: number; to: number; ancient: number; rare: number }[] = Object.freeze([
  { from: 2, to: 4, ancient: 1_000_000, rare: 3_000_000 },
  { from: 6, to: 9, ancient: 2_000_000, rare: 6_000_000 },
  { from: 11, to: 14, ancient: 4_000_000, rare: 12_000_000 },
  { from: 16, to: 19, ancient: 8_000_000, rare: 24_000_000 },
]);

/** Treasury cost of raising a lair to `targetLevel` (2–20). Level 1 is free. */
export function getDragonLairUpgradeCost(kind: DragonLairKind, targetLevel: number): DragonLairUpgradeCost {
  assertLairLevel(targetLevel);
  if (targetLevel === 1) throw new RangeError("Lair level 1 is the starting level");
  const gold = GOLD_LEVELS[targetLevel];
  if (gold) return { currency: "gold", amount: gold };
  const step = SILVER_STEPS.find(({ from, to }) => targetLevel >= from && targetLevel <= to);
  if (!step) throw new RangeError(`No lair cost for level ${targetLevel}`);
  return { currency: "silver", amount: step[kind] };
}

/** A lair cannot be above the guild level. */
export function canUpgradeDragonLair(currentLevel: number, guildLevel: number) {
  return currentLevel < DRAGON_LAIR_MAX_LEVEL && currentLevel + 1 <= guildLevel;
}

/** Breath damage is split evenly between the living participants; the remainder goes to the first ones. */
export function splitDragonBreath(kind: DragonLairKind, livingCount: number): number[] {
  if (!Number.isSafeInteger(livingCount) || livingCount < 0) throw new RangeError("Living count must be a non-negative integer");
  if (livingCount === 0) return [];
  const total = DRAGON_BREATH_DAMAGE[kind];
  const share = Math.floor(total / livingCount);
  const remainder = total - share * livingCount;
  return Array.from({ length: livingCount }, (_, index) => share + (index < remainder ? 1 : 0));
}

/** Whole breaths due since `lastBreathAt`; the new mark advances by whole intervals only. */
export function getDueDragonBreaths(lastBreathAt: number, now: number) {
  if (now <= lastBreathAt) return { count: 0, nextLastBreathAt: lastBreathAt };
  const count = Math.floor((now - lastBreathAt) / DRAGON_BREATH_INTERVAL_MS);
  return { count, nextLastBreathAt: lastBreathAt + count * DRAGON_BREATH_INTERVAL_MS };
}

export interface DragonSlayerEntry {
  playerId: string;
  /** Points held before this raid (bound to the guild). */
  pointsBefore: number;
  damage: number;
  joinedAt: number;
}

export interface DragonSlayerOutcome {
  playerId: string;
  pointsAfter: number;
  winner: boolean;
}

/**
 * Victory: everyone gains points equal to damage dealt; the highest total wins the dragon card and
 * keeps half (rounded down). Ties go to more damage in this raid, then to the earlier enrollment, then to the id.
 */
export function resolveDragonSlayerPoints(entries: readonly DragonSlayerEntry[]): DragonSlayerOutcome[] {
  if (!entries.length) return [];
  const totals = entries.map((entry) => {
    if (!Number.isSafeInteger(entry.pointsBefore) || entry.pointsBefore < 0) throw new RangeError("Slayer points must be non-negative integers");
    if (!Number.isSafeInteger(entry.damage) || entry.damage < 0) throw new RangeError("Raid damage must be a non-negative integer");
    return { ...entry, total: entry.pointsBefore + entry.damage };
  });
  const ranked = [...totals].sort((left, right) => right.total - left.total
    || right.damage - left.damage
    || left.joinedAt - right.joinedAt
    || left.playerId.localeCompare(right.playerId));
  const winnerId = ranked[0]!.playerId;
  return totals.map((entry) => ({
    playerId: entry.playerId,
    pointsAfter: entry.playerId === winnerId ? Math.floor(entry.total / 2) : entry.total,
    winner: entry.playerId === winnerId,
  }));
}

/** Random card powers for one participant's dragon deck. */
export function rollDragonDeckPowers(kind: DragonLairKind, random: () => number, size = DRAGON_DECK_SIZE) {
  const [min, max] = DRAGON_CARD_POWER_RANGE[kind];
  return Array.from({ length: size }, () => {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("Random source must return a value in [0, 1)");
    return min + Math.floor(roll * (max - min + 1));
  });
}

/** Achievement thresholds and the dragon hunter title (+10% raid power and health) from the reference. */
export const DRAGON_HUNT_ACHIEVEMENT_TIERS = Object.freeze([25, 250, 1000] as const);
export const DRAGON_HUNTER_TITLE_VICTORIES = 1000;
export const DRAGON_HUNTER_TITLE_POWER_PCT = 10;

function assertLairLevel(level: number) {
  if (!Number.isSafeInteger(level) || level < 1 || level > DRAGON_LAIR_MAX_LEVEL) {
    throw new RangeError(`Lair level must be 1–${DRAGON_LAIR_MAX_LEVEL}`);
  }
}
