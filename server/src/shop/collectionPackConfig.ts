import { COLLECTION_CARD_GOLD_PRICE } from "@cardastika/game-core";

/**
 * «Колекції тижня»: the ten sellable collection packs and every price, in gold.
 * Rationale and the full table are in `docs/collection-packs.md`; change numbers here only.
 *
 * Not sold: `magic_1` / `magic_heal` (dragon magic, reserved) and every collection of the holiday
 * bundles or of the shop-eligible cards (`collectionPackConfig.test.ts` enforces it).
 */
export interface CollectionPackConfig {
  /** Collections of the pack; each gets its own «Повна колекція» offer. */
  collectionCodes: readonly string[];
  displayName: string;
  /** A `COLLECTION_PACK_IDS` entry (checked by the config test). */
  id: string;
  /** Price of one «Випадкова карта» from any collection of the pack. */
  randomPrice: number;
  /** Price of the «Повна колекція» offer per collection code. */
  setPrices: Readonly<Record<string, number>>;
}

/** One full set may be bought once per collection per rotation week. */
export const COLLECTION_PACK_SET_LIMIT = 1;

/** Per-card gold ladder behind the set prices; it lives in game-core so the missing-cards price shares it. */
export const COLLECTION_PACK_CARD_PRICE = COLLECTION_CARD_GOLD_PRICE;

export const COLLECTION_PACKS: readonly CollectionPackConfig[] = [
  { id: "umutants", displayName: "Шулікові виродки", collectionCodes: ["umutants"], setPrices: { umutants: 60 }, randomPrice: 20 },
  { id: "ugiants", displayName: "Шулікові велетні", collectionCodes: ["ugiants"], setPrices: { ugiants: 230 }, randomPrice: 60 },
  { id: "usoldiers", displayName: "Шулікова зграя", collectionCodes: ["usoldiers"], setPrices: { usoldiers: 120 }, randomPrice: 20 },
  { id: "diamond_brotherhood", displayName: "Алмазна артіль", collectionCodes: ["diamond_brotherhood"], setPrices: { diamond_brotherhood: 150 }, randomPrice: 50 },
  {
    id: "zodiac",
    displayName: "Зодіак",
    collectionCodes: ["zodiac_air", "zodiac_earth", "zodiac_fire", "zodiac_water"],
    setPrices: { zodiac_air: 110, zodiac_earth: 110, zodiac_fire: 110, zodiac_water: 110 },
    randomPrice: 50,
  },
  {
    id: "shores_path",
    displayName: "Береги й Шлях",
    collectionCodes: ["sacred_shores", "great_path"],
    setPrices: { sacred_shores: 150, great_path: 150 },
    randomPrice: 50,
  },
  {
    id: "thirtieth_west",
    displayName: "За горами й Прерії",
    collectionCodes: ["thirtieth", "western_wastes"],
    setPrices: { thirtieth: 150, western_wastes: 150 },
    randomPrice: 50,
  },
  {
    id: "flame_storm",
    displayName: "Жар і Шторм",
    collectionCodes: ["legion_of_flame", "breath_of_storm"],
    setPrices: { legion_of_flame: 150, breath_of_storm: 150 },
    randomPrice: 50,
  },
  {
    id: "engines_forge",
    displayName: "Глибини й Ковадло",
    collectionCodes: ["deep_engines", "titans_of_forge"],
    setPrices: { deep_engines: 150, titans_of_forge: 150 },
    randomPrice: 50,
  },
  {
    id: "breach_mirror",
    displayName: "Брама й Люстро",
    collectionCodes: ["breach_wedge", "mirror_fragments"],
    setPrices: { breach_wedge: 100, mirror_fragments: 100 },
    randomPrice: 30,
  },
];

export function getCollectionPackConfig(id: string): CollectionPackConfig | undefined {
  return COLLECTION_PACKS.find((pack) => pack.id === id);
}

/** Offer ids are `set:<collection code>` (full collection) and `random:<pack id>`. */
export const PACK_SET_OFFER_PREFIX = "set:";
export const PACK_RANDOM_OFFER_PREFIX = "random:";
