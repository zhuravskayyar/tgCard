import { BASE_POWER_BY_LEVEL } from "@cardastika/game-core";
import type {
  CardElement,
  CardRarity,
  CollectionModifierType,
  PlayerCollectionCard,
  PlayerCollectionCardResponse,
  PlayerCollectionResponse,
  PlayerCollectionsResponse,
  PlayerCollectionSummary,
} from "@cardastika/shared";
import type { Pool } from "pg";

interface SummaryRow {
  bonus_label: string;
  buff_element: CardElement | null;
  buff_type: CollectionModifierType;
  buff_value: string | number;
  code: string;
  completed_at: Date | string | null;
  cover_art_key: string | null;
  discovered_cards: string | number;
  display_name: string;
  id: string;
  total_cards: string | number;
}

interface CardRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  description: string;
  discovered: boolean;
  display_name: string;
  element: CardElement;
  id: string;
  limited: boolean;
  min_rarity: CardRarity;
  owned_copies: string | number;
  strongest_instance_id: string | null;
}

export class CollectionMissingError extends Error {
  constructor() {
    super("Collection does not exist");
    this.name = "CollectionMissingError";
  }
}

export class CollectionCardMissingError extends Error {
  constructor() {
    super("Collection card does not exist");
    this.name = "CollectionCardMissingError";
  }
}

export class CollectionPersistenceError extends Error {
  constructor() {
    super("Collection persistence is unavailable");
    this.name = "CollectionPersistenceError";
  }
}

function mapSummary(row: SummaryRow): PlayerCollectionSummary {
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    coverArtKey: row.cover_art_key,
    bonus: {
      type: row.buff_type,
      value: Number(row.buff_value),
      ...(row.buff_element ? { element: row.buff_element } : {}),
    },
    bonusLabel: row.bonus_label,
    discoveredCards: Number(row.discovered_cards),
    totalCards: Number(row.total_cards),
    completed: row.completed_at !== null,
    completedAt: row.completed_at instanceof Date
      ? row.completed_at.toISOString()
      : row.completed_at,
  };
}

function mapCard(row: CardRow): PlayerCollectionCard {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    collectionId: row.collection_id,
    limited: row.limited,
    minRarity: row.min_rarity,
    discovered: row.discovered,
    ownedCopies: Number(row.owned_copies),
    strongestInstanceId: row.strongest_instance_id,
  };
}

const SUMMARY_QUERY = `
  SELECT
    collections.id,
    collections.code,
    collections.display_name,
    COALESCE(
      collections.cover_art_key,
      (
        SELECT cards.art_key
        FROM cards
        WHERE cards.collection_id = collections.id
          AND cards.art_key IS NOT NULL
        ORDER BY cards.code
        LIMIT 1
      )
    ) AS cover_art_key,
    collections.buff_type,
    collections.buff_value,
    collections.buff_element,
    collections.bonus_label,
    COUNT(cards.id) AS total_cards,
    COUNT(discoveries.card_id) AS discovered_cards,
    completions.completed_at
  FROM collections
  LEFT JOIN cards ON cards.collection_id = collections.id
  LEFT JOIN player_card_discoveries discoveries
    ON discoveries.card_id = cards.id AND discoveries.player_id = $1
  LEFT JOIN player_collection_completions completions
    ON completions.collection_id = collections.id AND completions.player_id = $1
`;

export class CollectionRepository {
  constructor(private readonly pool: Pool) {}

  private async findSummary(playerId: string, collectionId: string) {
    const result = await this.pool.query<SummaryRow>(
      `${SUMMARY_QUERY}
       WHERE collections.id = $2
       GROUP BY collections.id, completions.completed_at`,
      [playerId, collectionId],
    );
    const row = result.rows[0];
    if (!row) throw new CollectionMissingError();
    return mapSummary(row);
  }

  async list(playerId: string): Promise<PlayerCollectionsResponse> {
    try {
      const result = await this.pool.query<SummaryRow>(
        `${SUMMARY_QUERY}
         GROUP BY collections.id, completions.completed_at
         ORDER BY collections.position`,
        [playerId],
      );
      const limitedCards = await this.pool.query<CardRow>(
        `
          SELECT
            cards.id, cards.code, cards.display_name, cards.art_key, cards.element,
            cards.collection_id, cards.min_rarity, cards.description, cards.limited,
            (discoveries.card_id IS NOT NULL) AS discovered,
            COUNT(instances.id) AS owned_copies,
            (ARRAY_AGG(instances.id ORDER BY
              (($2::integer[])[instances.level] + instances.bonus_power) DESC,
              instances.id
            ) FILTER (WHERE instances.id IS NOT NULL))[1] AS strongest_instance_id
          FROM cards
          LEFT JOIN player_card_discoveries discoveries
            ON discoveries.card_id = cards.id AND discoveries.player_id = $1
          LEFT JOIN player_card_instances instances
            ON instances.card_id = cards.id AND instances.player_id = $1
          WHERE cards.limited = TRUE
          GROUP BY cards.id, discoveries.card_id
          ORDER BY cards.code
        `,
        [playerId, BASE_POWER_BY_LEVEL],
      );
      return {
        collections: result.rows.map(mapSummary),
        limitedCards: limitedCards.rows.map(mapCard),
      };
    } catch (error) {
      if (error instanceof CollectionMissingError) throw error;
      throw new CollectionPersistenceError();
    }
  }

  private async findCards(playerId: string, collectionId: string, cardId?: string) {
    const parameters: unknown[] = [playerId, BASE_POWER_BY_LEVEL, collectionId];
    const cardFilter = cardId ? "AND cards.id = $4" : "";
    if (cardId) parameters.push(cardId);
    const result = await this.pool.query<CardRow>(
      `
        SELECT
          cards.id, cards.code, cards.display_name, cards.art_key, cards.element,
          cards.collection_id, cards.min_rarity, cards.description, cards.limited,
          (discoveries.card_id IS NOT NULL) AS discovered,
          COUNT(instances.id) AS owned_copies,
          (ARRAY_AGG(instances.id ORDER BY
            (($2::integer[])[instances.level] + instances.bonus_power) DESC,
            instances.id
          ) FILTER (WHERE instances.id IS NOT NULL))[1] AS strongest_instance_id
        FROM cards
        LEFT JOIN player_card_discoveries discoveries
          ON discoveries.card_id = cards.id AND discoveries.player_id = $1
        LEFT JOIN player_card_instances instances
          ON instances.card_id = cards.id AND instances.player_id = $1
        WHERE cards.collection_id = $3
          ${cardFilter}
        GROUP BY cards.id, discoveries.card_id
        ORDER BY cards.code
      `,
      parameters,
    );
    return result.rows.map(mapCard);
  }

  async detail(playerId: string, collectionId: string): Promise<PlayerCollectionResponse> {
    try {
      const collection = await this.findSummary(playerId, collectionId);
      return { collection, cards: await this.findCards(playerId, collectionId) };
    } catch (error) {
      if (error instanceof CollectionMissingError) throw error;
      throw new CollectionPersistenceError();
    }
  }

  async card(
    playerId: string,
    collectionId: string,
    cardId: string,
  ): Promise<PlayerCollectionCardResponse> {
    try {
      const collection = await this.findSummary(playerId, collectionId);
      const card = (await this.findCards(playerId, collectionId, cardId))[0];
      if (!card) throw new CollectionCardMissingError();
      return { collection, card };
    } catch (error) {
      if (error instanceof CollectionMissingError || error instanceof CollectionCardMissingError) throw error;
      throw new CollectionPersistenceError();
    }
  }
}
