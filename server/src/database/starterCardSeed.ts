import type { PoolClient } from "pg";
import { STARTER_CARDS } from "../inventory/starterCards.js";

export const STARTER_CARD_SEED_NAME = "001_starter_cards";

export async function seedStarterCardDefinitions(client: PoolClient) {
  for (const card of STARTER_CARDS) {
    await client.query(
      `
        INSERT INTO cards (id, code, element, rarity, power, collection_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          element = EXCLUDED.element,
          rarity = EXCLUDED.rarity,
          power = EXCLUDED.power,
          collection_id = EXCLUDED.collection_id
      `,
      [card.id, card.code, card.element, card.rarity, card.power, card.collectionId],
    );
  }
}
