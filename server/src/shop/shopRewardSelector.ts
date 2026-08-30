import { randomInt } from "node:crypto";
import type { CardDefinition, CardRarity } from "@cardastika/shared";
import type { PoolClient } from "pg";
import type { ShopRandomSource } from "./shopChancePolicy.js";

interface CanonicalCardRow {
  art_key: string | null;
  card_id: string;
  code: string;
  collection_id: string | null;
  description: string;
  display_name: string | null;
  element: CardDefinition["element"];
  limited: boolean;
  min_rarity: CardRarity;
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
        cards.min_rarity,
        cards.description,
        cards.limited,
        $1::text AS target_rarity
      FROM cards
      WHERE cards.shop_eligible = TRUE
        AND cards.limited = FALSE
        AND array_position(
          ARRAY['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']::text[],
          cards.min_rarity
        ) <= array_position(
          ARRAY['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']::text[],
          $1::text
        )
      ORDER BY cards.code, cards.id
      FOR SHARE OF cards
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
    description: row.description,
    minRarity: row.min_rarity,
    shopEligible: true,
    limited: row.limited,
    targetRarity: row.target_rarity,
  };
}
