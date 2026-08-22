import type { PlayerCard } from "@cardastika/shared";
import type { Pool } from "pg";

interface PlayerCardRow {
  art_key: string | null;
  card_id: string;
  code: string;
  collection_id: string | null;
  display_name: string | null;
  element: PlayerCard["element"];
  power: string | number;
  quantity: string | number;
  rarity: PlayerCard["rarity"];
}

export class InventoryPersistenceError extends Error {
  constructor() {
    super("Inventory persistence is unavailable");
    this.name = "InventoryPersistenceError";
  }
}

function toPositiveInteger(value: string | number, field: "power" | "quantity") {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field} value returned by database`);
  }

  return parsed;
}

export class InventoryRepository {
  constructor(private readonly pool: Pool) {}

  async findByPlayerId(playerId: string): Promise<PlayerCard[]> {
    try {
      const result = await this.pool.query<PlayerCardRow>(
        `
          SELECT
            cards.id AS card_id,
            cards.code,
            cards.display_name,
            cards.art_key,
            cards.element,
            cards.rarity,
            cards.power,
            cards.collection_id,
            player_cards.quantity
          FROM player_cards
          INNER JOIN cards ON cards.id = player_cards.card_id
          WHERE player_cards.player_id = $1
          ORDER BY cards.code
        `,
        [playerId],
      );

      return result.rows.map((row) => ({
        cardId: row.card_id,
        code: row.code,
        displayName: row.display_name,
        artKey: row.art_key,
        element: row.element,
        rarity: row.rarity,
        power: toPositiveInteger(row.power, "power"),
        collectionId: row.collection_id,
        quantity: toPositiveInteger(row.quantity, "quantity"),
      }));
    } catch {
      throw new InventoryPersistenceError();
    }
  }
}
