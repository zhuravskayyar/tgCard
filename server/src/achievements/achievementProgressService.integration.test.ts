import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { DeckRepository } from "../decks/deckRepository.js";
import { LeaderboardRepository } from "../leaderboards/leaderboardRepository.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { AchievementProgressService } from "./achievementProgressService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test("achievement progress reads collected player statistics and leaves untracked modes unavailable", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const telegramId = String(BigInt(Date.now()) * 10_000n + BigInt(process.pid));
  let playerId: string | null = null;
  let transactionOpen = false;

  try {
    const player = await new PlayerRepository(pool).findOrCreateFromTelegram({
      id: telegramId,
      username: null,
      firstName: "Achievement progress test",
      lastName: null,
      photoUrl: null,
    });
    playerId = player.id;
    await pool.query("UPDATE players SET duel_wins = 7, arena_wins = 2 WHERE id = $1", [playerId]);
    await pool.query(
      "INSERT INTO player_campaign_events (player_id, event_type, payload) VALUES ($1, 'EQUIPMENT_FORGED', $2), ($1, 'EQUIPMENT_FORGED', $3), ($1, 'WITCH_BATTLE_WON', $4)",
      [playerId, JSON.stringify({ category: "things", count: 3 }), JSON.stringify({ category: "artifacts", count: 2 }), JSON.stringify({ battleId: "test" })],
    );
    // Run the real migration in a throwaway schema. The rollback removes its
    // high-water table and any backfill without touching the local game data.
    const schema = `achievement_test_${randomUUID().replaceAll("-", "")}`;
    await pool.query("BEGIN");
    transactionOpen = true;
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`SET LOCAL search_path TO ${schema}, public`);
    await pool.query(await readFile(new URL("../../migrations/080_achievement_history.sql", import.meta.url), "utf8"));

    const service = new AchievementProgressService(pool, new DeckRepository(pool), new LeaderboardRepository(pool));
    const { statistics } = await service.getPlayerProgress(playerId);
    assert.equal(statistics.duelWins, 7);
    assert.equal(statistics.arenaWins, 2);
    assert.equal(statistics.forgedItems, 3);
    assert.equal(statistics.forgedArtifacts, 2);
    assert.equal(statistics.arenaMageWins, 0);
    assert.equal(statistics.completedCollections, 0);
    assert.equal(statistics.witchVictories, 1);
    assert.ok(statistics.deckPower !== null && statistics.deckPower >= 0);
    assert.equal(statistics.urfinBossDamage, null);
    assert.equal(statistics.guildDragonHunts, null);
    assert.equal(statistics.giftsSent, null);

    const observed = new AchievementProgressService(
      pool,
      { findByPlayerId: async () => ({ totalPower: 100_000 }) as Awaited<ReturnType<DeckRepository["findByPlayerId"]>> },
      { find: async () => ({ me: { rank: 1 } }) as Awaited<ReturnType<LeaderboardRepository["find"]>> },
    );
    const earned = (await observed.getPlayerProgress(playerId)).statistics;
    assert.equal(earned.duelChampion, 1);
    assert.equal(earned.arenaChampion, 1);
    assert.equal(earned.deckPower, 100_000);
    const afterDrop = (await service.getPlayerProgress(playerId)).statistics;
    assert.equal(afterDrop.duelChampion, 1);
    assert.equal(afterDrop.arenaChampion, 1);
    assert.equal(afterDrop.deckPower, 100_000);
  } finally {
    if (transactionOpen) await pool.query("ROLLBACK");
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await pool.end();
  }
});
