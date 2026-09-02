import type { PoolClient } from "pg";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "../collections/collectionCatalog.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";

const RETIRED_FALLBACK_CARD_CODES = [
  "shop_uncommon_01",
  "shop_rare_01",
  "shop_epic_01",
  "shop_legendary_01",
  "shop_mythic_01",
] as const;

export async function seedCollectionDefinitions(client: PoolClient) {
  const validation = validateCollectionCatalog();

  // These temporary pre-collection rewards are not part of the canonical
  // canonical catalog. Preserve any already-owned instances; otherwise retire
  // their unused definitions and pool rows through the FK cascade.
  await client.query(
    `
      DELETE FROM cards
      WHERE code = ANY($1::text[])
        AND collection_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM player_card_instances WHERE player_card_instances.card_id = cards.id
        )
    `,
    [RETIRED_FALLBACK_CARD_CODES],
  );

  for (const [index, collection] of COLLECTIONS.entries()) {
    await client.query(
      `
        INSERT INTO collections (
          id, code, display_name, cover_art_key, buff_type, buff_value,
          buff_element, bonus_label, position, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          display_name = EXCLUDED.display_name,
          cover_art_key = EXCLUDED.cover_art_key,
          buff_type = EXCLUDED.buff_type,
          buff_value = EXCLUDED.buff_value,
          buff_element = EXCLUDED.buff_element,
          bonus_label = EXCLUDED.bonus_label,
          position = EXCLUDED.position,
          source = EXCLUDED.source
      `,
      [
        collection.id,
        collection.code,
        collection.displayName,
        collection.coverArtKey,
        collection.bonus.type,
        collection.bonus.value,
        collection.bonus.element ?? null,
        collection.bonusLabel,
        index + 1,
        collection.source,
      ],
    );

    for (const card of collection.cards) {
      await client.query(
        `
          INSERT INTO cards (
          id, code, display_name, art_key, element, collection_id,
          min_rarity, shop_eligible, description, limited, source
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            display_name = EXCLUDED.display_name,
            art_key = EXCLUDED.art_key,
            element = EXCLUDED.element,
          collection_id = EXCLUDED.collection_id,
          min_rarity = EXCLUDED.min_rarity,
            shop_eligible = EXCLUDED.shop_eligible,
            description = EXCLUDED.description,
            limited = EXCLUDED.limited,
            source = EXCLUDED.source
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
          card.description,
          card.limited ?? false,
          card.source ?? "standard",
        ],
      );
    }
  }

  const canonicalIds = [...STARTER_CARDS, ...COLLECTION_CARDS].map(({ id }) => id);
  const databaseValidation = await client.query<{ canonical_cards: string; external_starters: string; described_cards: string }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE id = ANY($1::text[])) AS canonical_cards,
        COUNT(*) FILTER (
          WHERE id = ANY($2::text[]) AND collection_id IS NULL
        ) AS external_starters,
        COUNT(*) FILTER (
          WHERE id = ANY($1::text[]) AND char_length(description) > 0
        ) AS described_cards
      FROM cards
    `,
    [canonicalIds, STARTER_CARDS.map(({ id }) => id)],
  );
  if (Number(databaseValidation.rows[0]?.canonical_cards) !== 133) {
    throw new Error("Database seed must contain exactly 133 canonical cards");
  }
  if (Number(databaseValidation.rows[0]?.external_starters) !== 9) {
    throw new Error("All 9 starter cards must remain outside collections");
  }
  if (Number(databaseValidation.rows[0]?.described_cards) !== 133) {
    throw new Error("All 133 canonical cards must have non-empty descriptions");
  }

  return validation;
}
