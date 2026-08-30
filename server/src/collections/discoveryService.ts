import type {
  CardElement,
  CollectionCompletionNotice,
  CollectionModifier,
  CollectionModifierType,
  PlayerCollectionBonus,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

interface CardCollectionRow {
  collection_id: string | null;
}

interface ProgressRow {
  discovered: string | number;
  total: string | number;
}

interface CompletionRow {
  buff_element: CardElement | null;
  buff_type: CollectionModifierType;
  buff_value: string | number;
  bonus_label: string;
  display_name: string;
  id: string;
}

function toModifier(row: CompletionRow): CollectionModifier {
  return {
    type: row.buff_type,
    value: Number(row.buff_value),
    ...(row.buff_element ? { element: row.buff_element } : {}),
  };
}

export async function recordCardDiscovery(
  database: Queryable,
  playerId: string,
  cardId: string,
): Promise<{ collectionCompleted?: CollectionCompletionNotice; newDiscovery: boolean }> {
  const discovery = await database.query(
    `
      INSERT INTO player_card_discoveries (player_id, card_id)
      VALUES ($1, $2)
      ON CONFLICT (player_id, card_id) DO NOTHING
      RETURNING card_id
    `,
    [playerId, cardId],
  );
  const newDiscovery = discovery.rowCount === 1;
  if (!newDiscovery) return { newDiscovery: false };

  const cardResult = await database.query<CardCollectionRow>(
    "SELECT collection_id FROM cards WHERE id = $1",
    [cardId],
  );
  const collectionId = cardResult.rows[0]?.collection_id;
  if (!collectionId) return { newDiscovery: true };

  const progress = await database.query<ProgressRow>(
    `
      SELECT
        COUNT(cards.id) AS total,
        COUNT(player_card_discoveries.card_id) AS discovered
      FROM cards
      LEFT JOIN player_card_discoveries
        ON player_card_discoveries.card_id = cards.id
        AND player_card_discoveries.player_id = $1
      WHERE cards.collection_id = $2
    `,
    [playerId, collectionId],
  );
  const row = progress.rows[0];
  if (!row || Number(row.total) === 0 || Number(row.discovered) !== Number(row.total)) {
    return { newDiscovery: true };
  }

  const completion = await database.query<{ collection_id: string }>(
    `
      INSERT INTO player_collection_completions (player_id, collection_id)
      VALUES ($1, $2)
      ON CONFLICT (player_id, collection_id) DO NOTHING
      RETURNING collection_id
    `,
    [playerId, collectionId],
  );
  if (completion.rowCount !== 1) return { newDiscovery: true };

  const collection = await database.query<CompletionRow>(
    `
      SELECT id, display_name, buff_type, buff_value, buff_element, bonus_label
      FROM collections
      WHERE id = $1
    `,
    [collectionId],
  );
  const completed = collection.rows[0];
  if (!completed) throw new Error("Completed collection definition is missing");
  return {
    newDiscovery: true,
    collectionCompleted: {
      id: completed.id,
      name: completed.display_name,
      bonus: toModifier(completed),
      bonusLabel: completed.bonus_label,
    },
  };
}

export async function getCompletedCollectionModifiers(
  database: Queryable,
  playerId: string,
): Promise<CollectionModifier[]> {
  const bonuses = await getCompletedCollectionBonuses(database, playerId);
  return bonuses.map(({ bonus }) => bonus);
}

export async function getCompletedCollectionBonuses(
  database: Queryable,
  playerId: string,
): Promise<PlayerCollectionBonus[]> {
  const result = await database.query<CompletionRow>(
    `
      SELECT collections.id, collections.display_name, collections.buff_type,
        collections.buff_value, collections.buff_element, collections.bonus_label
      FROM player_collection_completions
      INNER JOIN collections
        ON collections.id = player_collection_completions.collection_id
      WHERE player_collection_completions.player_id = $1
      ORDER BY collections.position
    `,
    [playerId],
  );
  return result.rows.map((row) => ({
    bonus: toModifier(row),
    bonusLabel: row.bonus_label,
    collectionId: row.id,
    collectionName: row.display_name,
  }));
}

export async function backfillCardDiscoveries(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const discoveries = await client.query(
      `
        INSERT INTO player_card_discoveries (player_id, card_id, first_discovered_at)
        SELECT player_id, card_id, MIN(created_at)
        FROM player_card_instances
        GROUP BY player_id, card_id
        ON CONFLICT (player_id, card_id) DO NOTHING
      `,
    );
    const completions = await client.query(
      `
        INSERT INTO player_collection_completions (player_id, collection_id)
        SELECT discoveries.player_id, cards.collection_id
        FROM player_card_discoveries discoveries
        INNER JOIN cards ON cards.id = discoveries.card_id
        WHERE cards.collection_id IS NOT NULL
        GROUP BY discoveries.player_id, cards.collection_id
        HAVING COUNT(DISTINCT discoveries.card_id) = (
          SELECT COUNT(*) FROM cards members WHERE members.collection_id = cards.collection_id
        )
        ON CONFLICT (player_id, collection_id) DO NOTHING
      `,
    );
    await client.query("COMMIT");
    return {
      discoveries: discoveries.rowCount ?? 0,
      completions: completions.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
