import { randomInt } from "node:crypto";
import type { CardRarity, PlayerCard } from "@cardastika/shared";
import type { PoolClient } from "pg";
import type { ShopOfferDefinition } from "./shopCatalog.js";

interface CanonicalCardRow {
  art_key: string | null;
  card_id: string;
  code: string;
  collection_id: string | null;
  display_name: string | null;
  element: PlayerCard["element"];
  power: string | number;
  rarity: PlayerCard["rarity"];
}

export class ShopRewardPolicyUnavailableError extends Error {
  constructor(message = "Shop rarity weights are not configured") {
    super(message);
    this.name = "ShopRewardPolicyUnavailableError";
  }
}

export class ShopRewardUnavailableError extends Error {
  constructor() {
    super("No canonical card is available for the selected shop reward");
    this.name = "ShopRewardUnavailableError";
  }
}

export type ShopRaritySelector = (offer: ShopOfferDefinition) => CardRarity;
export type ShopCardIndexSelector = (cardCount: number) => number;

function toPositiveInteger(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid card power returned while selecting a shop reward");
  }
  return parsed;
}

export function selectConfiguredShopRarity(
  offer: ShopOfferDefinition,
  selectRoll: (totalWeight: number) => number = randomInt,
): CardRarity {
  const weights = offer.rarityWeights;
  if (!weights?.length) {
    throw new ShopRewardPolicyUnavailableError();
  }

  const configuredRarities = new Set<CardRarity>();
  let totalWeight = 0;
  for (const entry of weights) {
    if (
      configuredRarities.has(entry.rarity) ||
      !offer.allowedRarities.includes(entry.rarity) ||
      !Number.isSafeInteger(entry.weight) ||
      entry.weight <= 0
    ) {
      throw new ShopRewardPolicyUnavailableError("Shop rarity weights are invalid");
    }
    configuredRarities.add(entry.rarity);
    totalWeight += entry.weight;
  }

  if (
    !Number.isSafeInteger(totalWeight) ||
    configuredRarities.size !== offer.allowedRarities.length ||
    offer.allowedRarities.some((rarity) => !configuredRarities.has(rarity))
  ) {
    throw new ShopRewardPolicyUnavailableError("Shop rarity weights are incomplete");
  }

  const roll = selectRoll(totalWeight);
  if (!Number.isSafeInteger(roll) || roll < 0 || roll >= totalWeight) {
    throw new ShopRewardPolicyUnavailableError("Shop rarity roll is invalid");
  }
  let boundary = 0;
  for (const entry of weights) {
    boundary += entry.weight;
    if (roll < boundary) return entry.rarity;
  }

  throw new ShopRewardPolicyUnavailableError("Shop rarity selection failed");
}

export async function selectCanonicalShopReward(
  client: PoolClient,
  offer: ShopOfferDefinition,
  selectRarity: ShopRaritySelector = selectConfiguredShopRarity,
  selectCardIndex: ShopCardIndexSelector = randomInt,
): Promise<Omit<PlayerCard, "quantity">> {
  const rarity = selectRarity(offer);
  if (!offer.allowedRarities.includes(rarity)) {
    throw new ShopRewardPolicyUnavailableError("Shop rarity selector returned a disallowed rarity");
  }

  const result = await client.query<CanonicalCardRow>(
    `
      SELECT
        id AS card_id,
        code,
        display_name,
        art_key,
        element,
        rarity,
        power,
        collection_id
      FROM cards
      WHERE rarity = $1
      ORDER BY code, id
    `,
    [rarity],
  );
  if (!result.rows.length) {
    throw new ShopRewardUnavailableError();
  }

  const selectedIndex = selectCardIndex(result.rows.length);
  const row = result.rows[selectedIndex];
  if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || !row) {
    throw new ShopRewardPolicyUnavailableError("Shop card selector returned an invalid index");
  }

  return {
    cardId: row.card_id,
    code: row.code,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    rarity: row.rarity,
    power: toPositiveInteger(row.power),
    collectionId: row.collection_id,
  };
}
