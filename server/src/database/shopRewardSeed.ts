import type { PoolClient } from "pg";
import { SHOP_REWARD_CARDS } from "../shop/shopRewardCards.js";

export const SHOP_REWARD_CARD_SEED_NAME = "003_shop_reward_cards";

export async function seedShopRewardCardDefinitions(client: PoolClient) {
  for (const card of SHOP_REWARD_CARDS) {
    await client.query(
      `
        INSERT INTO cards (
          id,
          code,
          display_name,
          art_key,
          element,
          collection_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          display_name = EXCLUDED.display_name,
          art_key = EXCLUDED.art_key,
          element = EXCLUDED.element,
          collection_id = EXCLUDED.collection_id
      `,
      [
        card.id,
        card.code,
        card.displayName,
        card.artKey,
        card.element,
        card.collectionId,
      ],
    );
    await client.query(
      `
        INSERT INTO shop_card_pools (card_id, target_rarity)
        VALUES ($1, $2)
        ON CONFLICT (card_id) DO UPDATE SET target_rarity = EXCLUDED.target_rarity
      `,
      [card.id, card.targetRarity],
    );
  }
}
