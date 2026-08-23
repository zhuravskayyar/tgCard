import { randomInt } from "node:crypto";
import type { CardDefinition, CardRarity } from "@cardastika/shared";
import type { PoolClient } from "pg";
import type { ShopRandomSource } from "./shopChancePolicy.js";

interface CanonicalCardRow {
  art_key: string | null;
  card_id: string;
  code: string;
  collection_id: string | null;
  display_name: string | null;
  element: CardDefinition["element"];
  target_rarity: CardRarity;
}

export interface SelectedShopRewardDefinition extends CardDefinition {
  targetRarity: CardRarity;
}

export class ShopRewardUnavailableError extends Error {
  constructor(public readonly rarity: CardRarity) {
    super(`No shop-pool canonical ${rarity} card is available`);
    this.name = "ShopRewardUnavailableError";
  }
}

export class CryptoShopRandomSource implements ShopRandomSource {
  nextInt(maxExclusive: number) {
    return randomInt(maxExclusive);
  }
}

export async function selectCanonicalShopReward(
  client: PoolClient,
  rarity: CardRarity,
  rng: ShopRandomSource,
): Promise<SelectedShopRewardDefinition> {
  const result = await client.query<CanonicalCardRow>(
    `
      SELECT
        cards.id AS card_id,
        cards.code,
        cards.display_name,
        cards.art_key,
        cards.element,
        cards.collection_id,
        shop_card_pools.target_rarity
      FROM shop_card_pools
      INNER JOIN cards ON cards.id = shop_card_pools.card_id
      WHERE shop_card_pools.target_rarity = $1
      ORDER BY cards.code, cards.id
      FOR SHARE OF cards, shop_card_pools
    `,
    [rarity],
  );
  if (!result.rows.length) throw new ShopRewardUnavailableError(rarity);

  const selectedIndex = rng.nextInt(result.rows.length);
  const row = result.rows[selectedIndex];
  if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || !row || row.target_rarity !== rarity) {
    throw new Error("Shop card selector returned an invalid canonical reward");
  }
  return {
    id: row.card_id,
    code: row.code,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    collectionId: row.collection_id,
    targetRarity: row.target_rarity,
  };
}
