import type { PoolClient } from "pg";
import { COLLECTION_CARDS, COLLECTIONS, validateCollectionCatalog } from "../collections/collectionCatalog.js";

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

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Clears the retired collections so the new ones can take their positions. Runs once: later seeds find nothing to do. */
async function detachRetiredCollections(client: PoolClient) {
  const activeIds = COLLECTIONS.map(({ id }) => id);
  await client.query("UPDATE cards SET collection_id = NULL WHERE collection_id <> ALL($1::text[])", [activeIds]);
  await client.query("DELETE FROM player_collection_completions WHERE collection_id <> ALL($1::text[])", [activeIds]);
  await client.query("DELETE FROM collection_cards WHERE collection_id <> ALL($1::text[])", [activeIds]);
  await client.query("DELETE FROM collections WHERE id <> ALL($1::text[])", [activeIds]);
}

/**
 * Moves what players already own from retired cards to new ones of the same element, keeping every instance,
 * its level and its deck slot. Each retired card gets its own target, so one deck never ends up with duplicates.
 */
async function replaceRetiredCards(client: PoolClient, canonicalIds: readonly string[]) {
  const retired = await client.query<{ element: string; id: string; min_rarity: string }>(
    "SELECT id, element, min_rarity FROM cards WHERE id <> ALL($1::text[]) AND limited = FALSE ORDER BY id",
    [canonicalIds],
  );
  if (!retired.rows.length) return;
  const references = await client.query<{ column_name: string; table_name: string }>(`
    SELECT conrelid::regclass::text AS table_name, attribute.attname AS column_name
    FROM pg_constraint
    INNER JOIN pg_attribute attribute ON attribute.attrelid = conrelid AND attribute.attnum = ANY(conkey)
    WHERE contype = 'f' AND confrelid = 'cards'::regclass
  `);
  const retiredIds = retired.rows.map(({ id }) => id);
  await client.query("DELETE FROM shop_card_pools WHERE card_id = ANY($1::text[])", [retiredIds]);
  const holders = references.rows.filter(({ table_name: table }) => table !== "shop_card_pools" && table !== "player_card_discoveries");
  const inUse = new Set<string>();
  for (const { table_name: table, column_name: column } of holders) {
    const used = await client.query<{ id: string }>(`SELECT DISTINCT ${column} AS id FROM ${table} WHERE ${column} = ANY($1::text[])`, [retiredIds]);
    for (const { id } of used.rows) inUse.add(id);
  }
  const free = COLLECTION_CARDS.map((card) => ({ element: card.element, id: card.id, rank: RARITY_ORDER.indexOf(card.minRarity) }));
  for (const old of retired.rows) {
    if (!inUse.has(old.id)) {
      await client.query("DELETE FROM player_card_discoveries WHERE card_id = $1", [old.id]);
      await client.query("DELETE FROM cards WHERE id = $1", [old.id]);
      continue;
    }
    const rank = RARITY_ORDER.indexOf(old.min_rarity);
    const candidates = free.filter(({ element }) => element === old.element)
      .sort((left, right) => Number(left.rank > rank) - Number(right.rank > rank) || Math.abs(left.rank - rank) - Math.abs(right.rank - rank) || left.id.localeCompare(right.id));
    const target = candidates[0];
    if (!target) throw new Error(`No new ${old.element} card is left to replace ${old.id}`);
    free.splice(free.indexOf(target), 1);
    await client.query("INSERT INTO retired_catalog_card_replacements (retired_card_id, card_id) VALUES ($1, $2)", [old.id, target.id]);
    for (const { table_name: table, column_name: column } of [...holders, { table_name: "player_card_discoveries", column_name: "card_id" }]) {
      await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [target.id, old.id]);
    }
    await client.query("DELETE FROM cards WHERE id = $1", [old.id]);
  }
}

export async function seedCollectionDefinitions(client: PoolClient) {
  const validation = validateCollectionCatalog();
  await detachRetiredCollections(client);

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

  }

  for (const card of COLLECTION_CARDS) {
    {
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

  await client.query("DELETE FROM collection_cards");
  for (const collection of COLLECTIONS) {
    for (const [index, card] of collection.cards.entries()) {
      await client.query("INSERT INTO collection_cards (collection_id, card_id, position) VALUES ($1, $2, $3)", [collection.id, card.id, index + 1]);
    }
  }

  const canonicalIds = COLLECTION_CARDS.map(({ id }) => id);
  await replaceRetiredCards(client, canonicalIds);
  const databaseValidation = await client.query<{ canonical_cards: string; described_cards: string }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE id = ANY($1::text[])) AS canonical_cards,
        COUNT(*) FILTER (
          WHERE id = ANY($1::text[]) AND char_length(description) > 0
        ) AS described_cards
      FROM cards
    `,
    [canonicalIds],
  );
  const canonicalCardCount = canonicalIds.length;
  if (Number(databaseValidation.rows[0]?.canonical_cards) !== canonicalCardCount) {
    throw new Error(`Database seed must contain exactly ${canonicalCardCount} canonical cards`);
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
