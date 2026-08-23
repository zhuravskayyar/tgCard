import type { PlayerCardInstance } from "@cardastika/shared";
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

  async findWeakByPlayerId(playerId: string): Promise<PlayerCardInstance[]> {
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
        `,
        [playerId],
      );
      return result.rows.map(mapCardInstanceRow).sort(compareWeakCards);
    } catch {
      throw new InventoryPersistenceError();
    }
  }
}
