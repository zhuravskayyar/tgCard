import type { PoolClient } from "pg";
import { STARTER_CARDS } from "../inventory/starterCards.js";

export const STARTER_CARD_SEED_NAME = "001_starter_cards";
export const STARTER_CARD_CONTENT_SEED_NAME = "002_starter_card_content";

export async function seedStarterCardDefinitions(client: PoolClient) {
  for (const card of STARTER_CARDS) {
    await client.query(
      `
        INSERT INTO cards (
          id,
          code,
          display_name,
          art_key,
          element,
          collection_id,
          min_rarity,
          shop_eligible
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          display_name = EXCLUDED.display_name,
          art_key = EXCLUDED.art_key,
          element = EXCLUDED.element,
          collection_id = EXCLUDED.collection_id,
          min_rarity = EXCLUDED.min_rarity,
          shop_eligible = EXCLUDED.shop_eligible
      `,
      [
        card.id,
        card.code,
        card.displayName,
        card.artKey,
        card.element,
        card.collectionId,
        card.minRarity,
        card.shopEligible,
      ],
    );
  }
}
