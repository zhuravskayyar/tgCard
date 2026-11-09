import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { EquipmentForgeError } from "./equipmentState.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;
function telegramUser(): ValidatedTelegramUser {
  sequence += 1n;
  return { id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence), username: null, firstName: "Equipment forge test", lastName: null, photoUrl: null };
}

async function setItems(pool: Pool, playerId: string, items: Record<string, number>) {
  await pool.query("DELETE FROM player_equipment_inventory WHERE player_id = $1", [playerId]);
  for (const [itemId, quantity] of Object.entries(items)) {
    await pool.query("INSERT INTO player_equipment_inventory (player_id, item_id, quantity) VALUES ($1, $2, $3)", [playerId, itemId, quantity]);
  }
}

async function quantities(pool: Pool, playerId: string) {
  const rows = await pool.query<{ item_id: string; quantity: number }>("SELECT item_id, quantity FROM player_equipment_inventory WHERE player_id = $1", [playerId]);
  return Object.fromEntries(rows.rows.map(({ item_id, quantity }) => [item_id, quantity]));
}

test("quick forge spends whole batches and gold; equipped copies stay", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  try {
    const player = await players.findOrCreateFromTelegram(telegramUser());
    await pool.query("UPDATE players SET gold = 100, equipment = $2::jsonb WHERE id = $1", [player.id, JSON.stringify({ equipped: { head: "equipment_head_fire_common" } })]);
    // 9 hats, one worn: 8 spare make 2 batches.
    await setItems(pool, player.id, { equipment_head_fire_common: 9, equipment_shield_uncommon: 5 });

    await assert.rejects(players.quickForgeEquipment(player.id, [{ itemId: "equipment_head_fire_common", count: 3 }]), EquipmentForgeError);
    const result = await players.quickForgeEquipment(player.id, [
      { itemId: "equipment_head_fire_common", count: 2 },
      { itemId: "equipment_shield_uncommon", count: 1 },
    ]);
    assert.equal(result.gold, 100 - 2 * 5 - 50);
    assert.deepEqual(await quantities(pool, player.id), {
      equipment_head_fire_common: 1,
      equipment_head_fire_uncommon: 2,
      equipment_shield_rare: 1,
    });
  } finally {
    await pool.end();
  }
});

test("atelier changes the element, charges gold and shards, and keeps the slot equipped", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  try {
    const player = await players.findOrCreateFromTelegram(telegramUser());
    await pool.query("UPDATE players SET gold = 60000, card_shards = 1200, equipment = $2::jsonb WHERE id = $1", [player.id, JSON.stringify({ equipped: { cloak: "equipment_cloak_fire_legendary" } })]);
    await setItems(pool, player.id, { equipment_cloak_fire_legendary: 1, equipment_boots_air_epic: 1 });

    await assert.rejects(players.changeEquipmentElement(player.id, "equipment_boots_air_epic", "fire"), EquipmentForgeError);
    const result = await players.changeEquipmentElement(player.id, "equipment_cloak_fire_legendary", "water");
    assert.equal(result.resultItemId, "equipment_cloak_water_legendary");
    assert.equal(result.gold, 10_000);
    assert.equal(result.cardShards, 200);
    assert.equal(result.equipment.equipped.cloak, "equipment_cloak_water_legendary");
    assert.deepEqual(await quantities(pool, player.id), { equipment_boots_air_epic: 1, equipment_cloak_water_legendary: 1 });

    await pool.query("UPDATE players SET gold = 60000 WHERE id = $1", [player.id]);
    await assert.rejects(players.changeEquipmentElement(player.id, "equipment_cloak_water_legendary", "earth"), (error: unknown) => error instanceof EquipmentForgeError && error.code === "not_enough_shards");
  } finally {
    await pool.end();
  }
});
