import { randomInt } from "node:crypto";
import type { CardRarity, PlayerCard } from "@cardastika/shared";
import type { PoolClient } from "pg";
import type { ShopRandomSource } from "./shopChancePolicy.js";

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

export class ShopRewardUnavailableError extends Error {
  constructor(public readonly rarity: CardRarity) {
    super(`No shop-eligible canonical ${rarity} card is available`);
    this.name = "ShopRewardUnavailableError";
  }
}

export class CryptoShopRandomSource implements ShopRandomSource {
  nextInt(maxExclusive: number) {
    return randomInt(maxExclusive);
  }
}

function toPositiveInteger(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid card power returned while selecting a shop reward");
  }
  return parsed;
}

export async function selectCanonicalShopReward(
  client: PoolClient,
  rarity: CardRarity,
  rng: ShopRandomSource,
): Promise<Omit<PlayerCard, "quantity">> {
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
      WHERE rarity = $1 AND shop_eligible = TRUE
      ORDER BY code, id
      FOR SHARE
    `,
    [rarity],
  );
  if (!result.rows.length) throw new ShopRewardUnavailableError(rarity);

  const selectedIndex = rng.nextInt(result.rows.length);
  const row = result.rows[selectedIndex];
  if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || !row || row.rarity !== rarity) {
    throw new Error("Shop card selector returned an invalid canonical reward");
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
