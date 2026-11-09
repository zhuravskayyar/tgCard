import { EQUIPMENT_STORAGE_LIMIT, pickRandomEquipment, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import type { CardRarity, EquipmentChestOffer, EquipmentChestOpenResponse } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { parseStoredEquipment } from "./equipmentState.js";

export const EQUIPMENT_CHESTS: readonly Readonly<EquipmentChestOffer>[] = Object.freeze([
  { id: "chest_worn", name: "Стара скриня", price: 5_000, rarity: "common" },
  { id: "chest_bound", name: "Окута скриня", price: 25_000, rarity: "uncommon" },
  { id: "chest_sealed", name: "Запечатана скриня", price: 125_000, rarity: "rare" },
]);

export class EquipmentChestError extends Error {
  constructor(readonly code: "chest_not_found" | "not_enough_silver" | "equipment_storage_full") {
    super(code);
    this.name = "EquipmentChestError";
  }
}

const CATEGORY_BY_ITEM_ID = new Map(STARTER_EQUIPMENT_DEFINITIONS.map(({ category, id }) => [id, category]));

/**
 * Storage holds up to 888 things and 888 artifacts, equipped copies not counted.
 * Purchases need room in both; rewards may still push storage past the limit.
 */
export async function assertEquipmentStorageSpace(client: PoolClient, playerId: string) {
  const player = await client.query<{ equipment: unknown }>("SELECT equipment FROM players WHERE id = $1", [playerId]);
  const equipped = Object.values(parseStoredEquipment(playerId, player.rows[0]?.equipment).equipped);
  const inventory = await client.query<{ item_id: string; quantity: number }>(
    "SELECT item_id, quantity FROM player_equipment_inventory WHERE player_id = $1",
    [playerId],
  );
  const stored = { artifacts: 0, things: 0 };
  for (const { item_id, quantity } of inventory.rows) {
    const category = CATEGORY_BY_ITEM_ID.get(item_id);
    if (category) stored[category] += quantity - (equipped.includes(item_id) ? 1 : 0);
  }
  if (stored.things >= EQUIPMENT_STORAGE_LIMIT || stored.artifacts >= EQUIPMENT_STORAGE_LIMIT) {
    throw new EquipmentChestError("equipment_storage_full");
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
      await assertEquipmentStorageSpace(client, playerId);
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
