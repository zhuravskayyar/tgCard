import type { PoolClient } from "pg";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "../collections/collectionCatalog.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";

const RETIRED_STARTER_CARD_IDS = [
  "starter_01",
  "starter_02",
  "starter_03",
  "starter_04",
  "starter_05",
  "starter_06",
  "starter_07",
  "starter_08",
  "starter_09",
] as const;

export async function seedCollectionDefinitions(client: PoolClient) {
  const validation = validateCollectionCatalog();

  for (const [index, collection] of COLLECTIONS.entries()) {
    await client.query(
      `
        INSERT INTO collections (
          id, code, display_name, cover_art_key, buff_type, buff_value,
          buff_element, buff_scope, bonus_label, position, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          display_name = EXCLUDED.display_name,
          cover_art_key = EXCLUDED.cover_art_key,
          buff_type = EXCLUDED.buff_type,
          buff_value = EXCLUDED.buff_value,
          buff_element = EXCLUDED.buff_element,
          buff_scope = EXCLUDED.buff_scope,
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
        collection.bonus.scope ?? "all_battles",
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
  const canonicalCardCount = canonicalIds.length;
  const starterCardCount = STARTER_CARDS.length;
  if (Number(databaseValidation.rows[0]?.canonical_cards) !== canonicalCardCount) {
    throw new Error(`Database seed must contain exactly ${canonicalCardCount} canonical cards`);
  }
  if (Number(databaseValidation.rows[0]?.external_starters) !== starterCardCount) {
    throw new Error(`All ${starterCardCount} starter cards must remain outside collections`);
  }
  if (Number(databaseValidation.rows[0]?.described_cards) !== canonicalCardCount) {
    throw new Error(`All ${canonicalCardCount} canonical cards must have non-empty descriptions`);
  }

  const activeCatalogRows = await client.query<{ cards: string; collections: string }>(
    `
      SELECT
        (SELECT COUNT(*) FROM cards) AS cards,
        (SELECT COUNT(*) FROM collections) AS collections
    `,
  );
  if (Number(activeCatalogRows.rows[0]?.cards) !== canonicalCardCount) {
    throw new Error("Legacy card definitions are still active; apply migration 063 before seeding the new catalog");
  }
  if (Number(activeCatalogRows.rows[0]?.collections) !== COLLECTIONS.length) {
    throw new Error("Legacy collections are still active; apply migration 063 before seeding the new catalog");
  }

  const retiredStarterCards = await client.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM cards WHERE id = ANY($1::text[]) OR code = ANY($1::text[])",
    [RETIRED_STARTER_CARD_IDS],
  );
  if (Number(retiredStarterCards.rows[0]?.count) > 0) {
    throw new Error("Legacy starter cards are still active; apply migration 062 before seeding the catalog");
  }

  return validation;
}
