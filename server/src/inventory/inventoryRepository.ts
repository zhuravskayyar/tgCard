import { BASE_POWER_BY_LEVEL } from "@cardastika/game-core";
import type { CardElement, PlayerCardInstance } from "@cardastika/shared";
import type { Pool } from "pg";
import {
  mapCardInstanceRow,
  type CardInstanceProjectionRow,
} from "../cards/cardInstanceMapper.js";

export class InventoryPersistenceError extends Error {
  constructor() {
    super("Inventory persistence is unavailable");
    this.name = "InventoryPersistenceError";
  }
}

const INSTANCE_PROJECTION = `
  player_card_instances.id AS instance_id,
  cards.id AS card_id,
  cards.code,
  cards.display_name,
  cards.art_key,
  cards.element,
  player_card_instances.level,
  player_card_instances.bonus_power,
  player_card_instances.level_progress_elements,
  player_card_instances.protected_from_absorption,
  player_card_instances.stored_elements,
  cards.limited,
  cards.collection_id
`;

function compareWeakCards(left: PlayerCardInstance, right: PlayerCardInstance) {
  return right.finalPower - left.finalPower
    || left.instanceId.localeCompare(right.instanceId)
    || left.cardId.localeCompare(right.cardId);
}

export class InventoryRepository {
  constructor(private readonly pool: Pool) {}

  async findByPlayerId(playerId: string): Promise<PlayerCardInstance[]> {
    try {
      const result = await this.pool.query<CardInstanceProjectionRow>(
        `
          SELECT ${INSTANCE_PROJECTION}
          FROM player_card_instances
          INNER JOIN cards ON cards.id = player_card_instances.card_id
          WHERE player_card_instances.player_id = $1
          ORDER BY cards.code, cards.id, player_card_instances.created_at, player_card_instances.id
        `,
        [playerId],
      );
      return result.rows.map(mapCardInstanceRow);
    } catch {
      throw new InventoryPersistenceError();
    }
  }

  async findWeakPageByPlayerId(
    playerId: string,
    page: number,
    pageSize: 9,
    element?: CardElement,
    excludeInstanceId?: string,
  ): Promise<{ cards: PlayerCardInstance[]; totalCards: number }> {
    try {
      const countParameters: unknown[] = [playerId];
      const filters: string[] = [];
      if (element) {
        countParameters.push(element);
        filters.push(`AND cards.element = $${countParameters.length}`);
      }
      if (excludeInstanceId) {
        countParameters.push(excludeInstanceId);
        filters.push(`AND player_card_instances.id <> $${countParameters.length}`);
      }
      const filter = filters.join("\n");
      const countResult = await this.pool.query<{ total: string }>(
        `
          SELECT COUNT(*) AS total
          FROM player_card_instances
          INNER JOIN cards ON cards.id = player_card_instances.card_id
          LEFT JOIN player_decks ON player_decks.player_id = player_card_instances.player_id
          LEFT JOIN deck_slots
            ON deck_slots.deck_id = player_decks.id
            AND deck_slots.card_instance_id = player_card_instances.id
          WHERE player_card_instances.player_id = $1
            AND deck_slots.card_instance_id IS NULL
            AND player_card_instances.protected_from_absorption = FALSE
            ${filter}
        `,
        countParameters,
      );
      const offset = (page - 1) * pageSize;
      const queryParameters = [...countParameters, BASE_POWER_BY_LEVEL, pageSize, offset];
      const powerParameter = countParameters.length + 1;
      const limitParameter = countParameters.length + 2;
      const offsetParameter = countParameters.length + 3;
      const result = await this.pool.query<CardInstanceProjectionRow>(
        `
          SELECT ${INSTANCE_PROJECTION}
          FROM player_card_instances
          INNER JOIN cards ON cards.id = player_card_instances.card_id
          LEFT JOIN player_decks ON player_decks.player_id = player_card_instances.player_id
          LEFT JOIN deck_slots
            ON deck_slots.deck_id = player_decks.id
            AND deck_slots.card_instance_id = player_card_instances.id
          WHERE player_card_instances.player_id = $1
            AND deck_slots.card_instance_id IS NULL
            AND player_card_instances.protected_from_absorption = FALSE
            ${filter}
          ORDER BY (($${powerParameter}::integer[])[player_card_instances.level] + player_card_instances.bonus_power) DESC,
            player_card_instances.id ASC
          LIMIT $${limitParameter} OFFSET $${offsetParameter}
        `,
        queryParameters,
      );
      return {
        cards: result.rows.map(mapCardInstanceRow).sort(compareWeakCards),
        totalCards: Number(countResult.rows[0]?.total ?? 0),
      };
    } catch {
      throw new InventoryPersistenceError();
    }
  }

  async findWeakByPlayerId(playerId: string): Promise<PlayerCardInstance[]> {
    const firstPage = await this.findWeakPageByPlayerId(playerId, 1, 9);
    if (firstPage.totalCards <= 9) return firstPage.cards;
    try {
      const result = await this.pool.query<CardInstanceProjectionRow>(
        `
          SELECT ${INSTANCE_PROJECTION}
          FROM player_card_instances
          INNER JOIN cards ON cards.id = player_card_instances.card_id
          LEFT JOIN player_decks ON player_decks.player_id = player_card_instances.player_id
          LEFT JOIN deck_slots
            ON deck_slots.deck_id = player_decks.id
            AND deck_slots.card_instance_id = player_card_instances.id
          WHERE player_card_instances.player_id = $1
            AND deck_slots.card_instance_id IS NULL
            AND player_card_instances.protected_from_absorption = FALSE
        `,
        [playerId],
      );
      return result.rows.map(mapCardInstanceRow).sort(compareWeakCards);
    } catch {
      throw new InventoryPersistenceError();
    }
  }
}
