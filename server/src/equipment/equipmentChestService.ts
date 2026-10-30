import { pickRandomEquipment } from "@cardastika/game-core";
import type { CardRarity, EquipmentChestOffer, EquipmentChestOpenResponse } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";

export const EQUIPMENT_CHESTS: readonly Readonly<EquipmentChestOffer>[] = Object.freeze([
  { id: "chest_worn", name: "Стара скриня", price: 5_000, rarity: "common" },
  { id: "chest_bound", name: "Окута скриня", price: 25_000, rarity: "uncommon" },
  { id: "chest_sealed", name: "Запечатана скриня", price: 125_000, rarity: "rare" },
]);

export class EquipmentChestError extends Error {
  constructor(readonly code: "chest_not_found" | "not_enough_silver") {
    super(code);
    this.name = "EquipmentChestError";
  }
}

/** Adds one random item of the rarity to the storage inside the caller's transaction. */
export async function grantRandomEquipment(client: PoolClient, playerId: string, rarity: CardRarity) {
  const definition = pickRandomEquipment(rarity);
  await client.query(
    `INSERT INTO player_equipment_inventory (player_id, item_id, quantity)
     VALUES ($1, $2, 1)
     ON CONFLICT (player_id, item_id)
     DO UPDATE SET quantity = player_equipment_inventory.quantity + 1, updated_at = NOW()`,
    [playerId, definition.id],
  );
  return definition;
}

export class EquipmentChestService {
  constructor(private readonly pool: Pool) {}

  async open(playerId: string, chestId: string): Promise<EquipmentChestOpenResponse> {
    const chest = EQUIPMENT_CHESTS.find(({ id }) => id === chestId);
    if (!chest) throw new EquipmentChestError("chest_not_found");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<{ silver: string | number }>(
        "UPDATE players SET silver = silver - $2, updated_at = NOW() WHERE id = $1 AND silver >= $2 RETURNING silver",
        [playerId, chest.price],
      );
      if (!updated.rows[0]) throw new EquipmentChestError("not_enough_silver");
      const definition = await grantRandomEquipment(client, playerId, chest.rarity);
      const inventory = await client.query<{ item_id: string; quantity: number }>(
        "SELECT item_id, quantity FROM player_equipment_inventory WHERE player_id = $1 ORDER BY item_id",
        [playerId],
      );
      await client.query("COMMIT");
      return {
        inventory: inventory.rows.map(({ item_id, quantity }) => ({ itemId: item_id, playerId, quantity })),
        resultItemId: definition.id,
        silver: Number(updated.rows[0].silver),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
