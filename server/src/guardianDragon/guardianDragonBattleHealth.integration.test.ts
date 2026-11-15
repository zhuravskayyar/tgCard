import assert from "node:assert/strict";
import test from "node:test";
import { ARENA_UNLOCK_DUEL_RATING } from "@cardastika/shared";
import { Pool } from "pg";
import { PlayerRepository } from "../users/playerRepository.js";
import { loadGuardianDragonBattleHealth } from "./guardianDragonBattleHealth.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test("guardian dragon battle health: locked, home, hiking, finished hike, other month", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const now = new Date("2031-03-10T12:00:00Z");
  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram({
      id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + 7n),
      username: null, firstName: "Dragon battle test", lastName: null, photoUrl: null,
    });
    assert.equal(await loadGuardianDragonBattleHealth(pool, player.id, now), 0);
    await pool.query("UPDATE players SET duel_rating = $2 WHERE id = $1", [player.id, ARENA_UNLOCK_DUEL_RATING]);
    assert.equal(await loadGuardianDragonBattleHealth(pool, player.id, now), 0, "no dragon row yet");
    await pool.query("INSERT INTO guardian_dragons (player_id, month_key, health) VALUES ($1, '2031-03', 400)", [player.id]);
    assert.equal(await loadGuardianDragonBattleHealth(pool, player.id, now), 400);
    await pool.query("UPDATE guardian_dragons SET hike_hours = 2, hike_health_gain = 80, hike_ends_at = $2 WHERE player_id = $1", [player.id, "2031-03-10T14:00:00Z"]);
    assert.equal(await loadGuardianDragonBattleHealth(pool, player.id, now), 0, "away on a hike");
    assert.equal(await loadGuardianDragonBattleHealth(pool, player.id, new Date("2031-03-10T15:00:00Z")), 480, "hike over, gain not collected yet");
    assert.equal(await loadGuardianDragonBattleHealth(pool, player.id, new Date("2031-04-02T00:00:00Z")), 0, "next month, not reborn yet");
  } finally {
    await pool.end();
  }
});
