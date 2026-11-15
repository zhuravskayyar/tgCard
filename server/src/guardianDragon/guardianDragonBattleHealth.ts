import { getGuardianDragonBattleHealthBonus, getGuardianDragonMonthKey } from "@cardastika/game-core";
import { isArenaUnlocked } from "@cardastika/shared";
import type { PoolClient } from "pg";

interface BattleHealthRow {
  duel_rating: number;
  duel_highest_league_index: number;
  month_key: string | null;
  health: number | null;
  hike_ends_at: Date | null;
  hike_health_gain: number | null;
}

/**
 * HP the guardian dragon adds to its owner in a duel, the arena, the tournament and the witches battle.
 * Read only: the dragon row is reborn or finished lazily by GuardianDragonService, so this reads it as it
 * would look after that. Same unlock gate as the dragon itself (the arena league).
 */
export async function loadGuardianDragonBattleHealth(client: Pick<PoolClient, "query">, playerId: string, now: Date = new Date()) {
  const result = await client.query<BattleHealthRow>(
    `SELECT p.duel_rating, p.duel_highest_league_index, d.month_key, d.health, d.hike_ends_at, d.hike_health_gain
     FROM players p LEFT JOIN guardian_dragons d ON d.player_id = p.id
     WHERE p.id = $1`,
    [playerId],
  );
  const row = result.rows[0];
  if (!row) return 0;
  return getGuardianDragonBattleHealthBonus({
    unlocked: isArenaUnlocked(Number(row.duel_rating), Number(row.duel_highest_league_index)),
    rowMonthKey: row.month_key,
    currentMonthKey: getGuardianDragonMonthKey(now),
    health: Number(row.health ?? 0),
    hikeEndsAt: row.hike_ends_at,
    hikeHealthGain: row.hike_health_gain === null ? null : Number(row.hike_health_gain),
    now,
  });
}
