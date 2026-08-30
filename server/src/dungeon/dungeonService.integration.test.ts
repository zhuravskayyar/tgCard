import assert from "node:assert/strict";
import { Pool } from "pg";
import test from "node:test";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { DungeonService } from "./dungeonService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function createTelegramUser() {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: null,
    firstName: "Dungeon test",
    lastName: null,
    photoUrl: null,
  } satisfies ValidatedTelegramUser;
}

test("dungeon completion is server-validated and idempotent", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const dungeon = new DungeonService(pool);
  const player = await players.findOrCreateFromTelegram(createTelegramUser());
  try {
    await pool.query("UPDATE players SET card_shards = 0 WHERE id = $1", [player.id]);
    const started = await dungeon.start(player.id);
    const moves = [...new Set(started.board.map((tile) => tile.pairId))]
      .flatMap((pairId) => started.board.filter((tile) => tile.pairId === pairId).map((tile) => tile.id));
    const first = await dungeon.complete(player.id, started.runId, moves);
    const duplicate = await dungeon.complete(player.id, started.runId, moves);
    assert.equal(first.success, true);
    assert.equal(first.stars, 3);
    assert.equal(first.shardsEarned, 20);
    assert.equal(duplicate.shardsEarned, 20);
    assert.equal(duplicate.cardShards, 20);
    const balance = await pool.query<{ card_shards: string }>("SELECT card_shards FROM players WHERE id = $1", [player.id]);
    assert.equal(Number(balance.rows[0]?.card_shards), 20);
  } finally {
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});
