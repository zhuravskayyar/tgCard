import type { PoolClient } from "pg";
import { LIMITED_CARD_CAMPAIGNS } from "../limited/limitedCardConfig.js";

export async function seedLimitedCardDefinition(client: PoolClient) {
  for (const { card, eventId, promoCode } of LIMITED_CARD_CAMPAIGNS) {
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
        card.id,
        card.code,
        card.displayName,
        card.description,
        card.artKey,
        card.element,
        card.collectionId,
        card.minRarity,
        card.shopEligible,
        card.limited,
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
      [eventId, card.id, promoCode],
    );
  }
}
