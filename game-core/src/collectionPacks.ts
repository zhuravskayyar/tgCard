/**
 * «Колекції тижня»: ten collection packs, two of them on sale each ISO week (Monday 00:00 UTC start).
 * Pack contents and prices live on the server (`server/src/shop/collectionPackConfig.ts`); this file
 * owns only the pack ids and the pure rotation, so the order below is the rotation order.
 */
export const COLLECTION_PACK_IDS = Object.freeze([
  "umutants",
  "ugiants",
  "usoldiers",
  "diamond_brotherhood",
  "zodiac",
  "shores_path",
  "thirtieth_west",
  "flame_storm",
  "engines_forge",
  "breach_mirror",
] as const);

export type CollectionPackId = (typeof COLLECTION_PACK_IDS)[number];

export const COLLECTION_PACKS_PER_WEEK = 2;

const WEEK_MS = 7 * 86_400_000;
/** Monday 1970-01-05 00:00 UTC: the first Monday after the Unix epoch. */
const ROTATION_EPOCH_MS = Date.UTC(1970, 0, 5);

export interface CollectionPackRotation {
  /** Exclusive: the next Monday 00:00 UTC. */
  endsAt: Date;
  packIds: readonly [CollectionPackId, CollectionPackId];
  startsAt: Date;
  /** Monday of the week as YYYY-MM-DD; the key of the weekly purchase limit. */
  weekKey: string;
}

/** Two different packs for the week containing `now`; every pack comes round once per 5 weeks. */
export function getCollectionPackRotation(now: Date): CollectionPackRotation {
  const weekIndex = Math.floor((now.getTime() - ROTATION_EPOCH_MS) / WEEK_MS);
  const count = COLLECTION_PACK_IDS.length;
  const first = (((weekIndex * COLLECTION_PACKS_PER_WEEK) % count) + count) % count;
  const startsAt = new Date(ROTATION_EPOCH_MS + weekIndex * WEEK_MS);
  return {
    packIds: [COLLECTION_PACK_IDS[first]!, COLLECTION_PACK_IDS[(first + 1) % count]!],
    startsAt,
    endsAt: new Date(startsAt.getTime() + WEEK_MS),
    weekKey: startsAt.toISOString().slice(0, 10),
  };
}

/** Weeks from `now` until each pack is on sale again (the current week excluded), by scanning the rotation forward. */
export interface CollectionPackSchedule {
  /** Packs on sale next week, in rotation order. */
  nextWeekPackIds: readonly string[];
  /** For every pack of the current week: whole weeks until it comes round again. */
  returnsInWeeks: Readonly<Record<string, number>>;
}

interface RotationLike {
  packIds: readonly string[];
}

/** `rotation` is injectable so a service with fixture packs can reuse the same scan. */
export function getCollectionPackSchedule(
  now: Date,
  rotation: (date: Date) => RotationLike = getCollectionPackRotation,
): CollectionPackSchedule {
  const current = rotation(now).packIds;
  const nextWeekPackIds = rotation(new Date(now.getTime() + WEEK_MS)).packIds;
  const returnsInWeeks: Record<string, number> = {};
  for (const id of current) {
    // A pack returns within one full cycle; the scan is bounded so a custom rotation cannot loop forever.
    for (let weeks = 1; weeks <= COLLECTION_PACK_IDS.length; weeks += 1) {
      if (rotation(new Date(now.getTime() + weeks * WEEK_MS)).packIds.includes(id)) {
        returnsInWeeks[id] = weeks;
        break;
      }
    }
  }
  return { nextWeekPackIds, returnsInWeeks };
}

/** Gold per card by its minimum rarity: the holiday 4 epic = 150 (37.5 each) plus our own steps. */
export const COLLECTION_CARD_GOLD_PRICE: Readonly<Record<"uncommon" | "rare" | "epic" | "legendary", number>> = Object.freeze({
  uncommon: 15,
  rare: 25,
  epic: 37.5,
  legendary: 120,
});

/** Up to 100 gold rounds to 5, above 100 to 10: the rule behind every full-collection price. */
export function roundCollectionPrice(gold: number): number {
  const step = gold > 100 ? 10 : 5;
  return Math.round(gold / step) * step;
}

/**
 * Price of the cards a player still lacks, from the per-card ladder.
 * Nothing discovered returns the configured `fullPrice` untouched; otherwise the rounded ladder sum, never above it.
 * A rarity outside the ladder throws, so a mispriced card can never reach the player as NaN.
 */
export function priceMissingCollectionCards(
  missingRarities: readonly string[],
  totalCount: number,
  fullPrice: number,
): number {
  if (missingRarities.length >= totalCount) return fullPrice;
  const sum = missingRarities.reduce((total, rarity) => {
    const price = COLLECTION_CARD_GOLD_PRICE[rarity as keyof typeof COLLECTION_CARD_GOLD_PRICE];
    if (price === undefined) throw new Error(`No collection price for rarity ${rarity}`);
    return total + price;
  }, 0);
  return Math.min(fullPrice, roundCollectionPrice(sum));
}

/** Ladder price of a whole collection (used to derive the full price of new offers and to test the config). */
export function priceFullCollection(rarities: readonly string[]): number {
  return priceMissingCollectionCards(rarities, rarities.length + 1, Number.MAX_SAFE_INTEGER);
}
