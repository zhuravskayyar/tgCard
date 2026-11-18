import type { PoolClient } from "pg";

export async function grantGuildWarMagicCrystal(client: Pick<PoolClient, "query">, playerId: string) {
  const result = await client.query(
    "INSERT INTO guild_war_magic_crystals (player_id, quantity) VALUES ($1, 1) ON CONFLICT (player_id) DO NOTHING",
    [playerId],
  );
  return result.rowCount === 1;
}
