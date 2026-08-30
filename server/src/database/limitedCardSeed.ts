import type { PoolClient } from "pg";
import { LIMITED_CARD, LIMITED_CARD_EVENT_ID, LIMITED_CARD_PROMO_CODE } from "../limited/limitedCardConfig.js";

export async function seedLimitedCardDefinition(client: PoolClient) {
  await client.query(
    `
      INSERT INTO cards (
        id, code, display_name, description, art_key, element, collection_id,
        min_rarity, shop_eligible, limited
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        art_key = EXCLUDED.art_key,
        element = EXCLUDED.element,
        collection_id = EXCLUDED.collection_id,
        min_rarity = EXCLUDED.min_rarity,
        shop_eligible = EXCLUDED.shop_eligible,
        limited = EXCLUDED.limited
    `,
    [
      LIMITED_CARD.id,
      LIMITED_CARD.code,
      LIMITED_CARD.displayName,
      LIMITED_CARD.description,
      LIMITED_CARD.artKey,
      LIMITED_CARD.element,
      LIMITED_CARD.collectionId,
      LIMITED_CARD.minRarity,
      LIMITED_CARD.shopEligible,
      LIMITED_CARD.limited,
    ],
  );

  await client.query(
    `
      INSERT INTO limited_card_events (id, card_id, promo_code, starts_at, ends_at)
      VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '24 hours')
      ON CONFLICT (id) DO UPDATE SET
        card_id = EXCLUDED.card_id,
        promo_code = EXCLUDED.promo_code
    `,
    [LIMITED_CARD_EVENT_ID, LIMITED_CARD.id, LIMITED_CARD_PROMO_CODE],
  );
}
