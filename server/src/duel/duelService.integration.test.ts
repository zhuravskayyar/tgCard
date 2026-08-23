import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { DuelService, DuelStateConflictError } from "./duelService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function telegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Duel ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

async function cleanup(pool: Pool, playerIds: string[]) {
  await pool.query("DELETE FROM duel_matchmaking_searches WHERE challenger_id = ANY($1::uuid[]) OR opponent_id = ANY($1::uuid[])", [playerIds]);
  await pool.query("DELETE FROM duels WHERE challenger_id = ANY($1::uuid[]) OR opponent_id = ANY($1::uuid[])", [playerIds]);
  await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
}

test("matchmaking persists and starts a bot snapshot when no real player is in range", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const challengerUser = telegramUser("bot fallback");
  const playerIds: string[] = [];
  try {
    const challenger = await players.findOrCreateFromTelegram(challengerUser);
    playerIds.push(challenger.id);
    await pool.query(
      "UPDATE player_card_instances SET bonus_power = 100000000 WHERE player_id = $1",
      [challenger.id],
    );

    const service = new DuelService(pool, () => 0.5);
    const found = await service.search(challenger.id);
    assert.equal(found.opponent.powerDifferencePct, 0);
    assert.equal(found.opponent.photoUrl, null);
    assert.match(found.opponent.name, /^[A-Za-z]+_[a-z]+\d+$/);

    const search = await pool.query<{
      opponent_id: string | null;
      opponent_kind: string;
      opponent_snapshot: { name: string };
    }>(
      "SELECT opponent_id, opponent_kind, opponent_snapshot FROM duel_matchmaking_searches WHERE id = $1",
      [found.searchId],
    );
    assert.equal(search.rows[0]?.opponent_kind, "bot");
    assert.equal(search.rows[0]?.opponent_id, null);
    assert.equal(search.rows[0]?.opponent_snapshot.name, found.opponent.name);

    const duel = await service.start(challenger.id, found.searchId);
    assert.equal(duel.opponent.name, found.opponent.name);
    assert.equal(duel.opponent.cards.length, 9);
    assert.ok(duel.opponent.cards.every(({ instanceId }) => instanceId.startsWith("bot:")));

    const persisted = await pool.query<{ opponent_id: string | null; opponent_kind: string }>(
      "SELECT opponent_id, opponent_kind FROM duels WHERE id = $1",
      [duel.duelId],
    );
    assert.equal(persisted.rows[0]?.opponent_kind, "bot");
    assert.equal(persisted.rows[0]?.opponent_id, null);
  } finally {
    if (playerIds.length) await cleanup(pool, playerIds);
    await pool.end();
  }
});

test("winning finalizes once, duplicate final action conflicts, and finished reload does not re-award", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const challengerUser = telegramUser("winner");
  const opponentUser = telegramUser("opponent");
  const playerIds: string[] = [];
  try {
    const challenger = await players.findOrCreateFromTelegram(challengerUser);
    const opponent = await players.findOrCreateFromTelegram(opponentUser);
    playerIds.push(challenger.id, opponent.id);
    const service = new DuelService(pool, () => 0.999999);
    const found = await service.search(challenger.id);
    let duel = await service.start(challenger.id, found.searchId);
    let finalRequestVersion = duel.version;
    while (duel.status === "active") {
      finalRequestVersion = duel.version;
      duel = await service.action(challenger.id, duel.duelId, {
        slotIndex: 0,
        expectedVersion: duel.version,
      });
    }
    assert.equal(duel.status, "won");
    assert.deepEqual(duel.result && {
      outcome: duel.result.outcome,
      xp: duel.result.xp,
      silver: duel.result.silver,
      gold: duel.result.gold,
    }, { outcome: "win", xp: 25, silver: 50, gold: 0 });
    await assert.rejects(
      service.action(challenger.id, duel.duelId, { slotIndex: 0, expectedVersion: finalRequestVersion }),
      DuelStateConflictError,
    );
    const reloaded = await service.findById(challenger.id, duel.duelId);
    assert.deepEqual(reloaded.result, duel.result);
    assert.equal(await service.findActive(challenger.id), null);
    const persisted = await pool.query<{
      account_xp: number;
      duel_wins: number;
      gold: string;
      silver: string;
    }>("SELECT account_xp, duel_wins, silver, gold FROM players WHERE id = $1", [challenger.id]);
    assert.deepEqual({
      xp: persisted.rows[0]?.account_xp,
      wins: persisted.rows[0]?.duel_wins,
      silver: Number(persisted.rows[0]?.silver),
      gold: Number(persisted.rows[0]?.gold),
    }, { xp: 25, wins: 1, silver: 1_550, gold: 0 });
  } finally {
    if (playerIds.length) await cleanup(pool, playerIds);
    await pool.end();
  }
});

test("a loss grants its reward once and resets the Duel win streak", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const challengerUser = telegramUser("loser");
  const opponentUser = telegramUser("stronger");
  const playerIds: string[] = [];
  try {
    const challenger = await players.findOrCreateFromTelegram(challengerUser);
    const opponent = await players.findOrCreateFromTelegram(opponentUser);
    playerIds.push(challenger.id, opponent.id);
    await pool.query("UPDATE players SET duel_win_streak = 5 WHERE id = $1", [challenger.id]);
    const service = new DuelService(pool, () => 0.999999);
    const found = await service.search(challenger.id);
    let duel = await service.start(challenger.id, found.searchId);
    const enemyActiveCards = duel.enemyActiveCards.map((card, index) => (
      index === 0 ? { ...card, finalPower: 1_000 } : card
    ));
    await pool.query(
      `
        UPDATE duels
        SET player_hp = 1,
          enemy_hp = 1_000,
          opponent_snapshot = $2,
          enemy_active_slots = $3
        WHERE id = $1
      `,
      [
        duel.duelId,
        JSON.stringify({ ...duel.opponent, startingHp: 1_000 }),
        JSON.stringify(enemyActiveCards),
      ],
    );
    duel = await service.action(challenger.id, duel.duelId, {
      slotIndex: 0,
      expectedVersion: duel.version,
    });
    assert.equal(duel.status, "lost");
    assert.deepEqual(duel.result && {
      outcome: duel.result.outcome,
      xp: duel.result.xp,
      silver: duel.result.silver,
      gold: duel.result.gold,
      streak: duel.result.winStreak,
    }, { outcome: "loss", xp: 13, silver: 25, gold: 0, streak: 0 });
    const persisted = await pool.query<{
      account_xp: number;
      duel_losses: number;
      duel_win_streak: number;
      silver: string;
    }>("SELECT account_xp, duel_losses, duel_win_streak, silver FROM players WHERE id = $1", [challenger.id]);
    assert.deepEqual({
      xp: persisted.rows[0]?.account_xp,
      losses: persisted.rows[0]?.duel_losses,
      streak: persisted.rows[0]?.duel_win_streak,
      silver: Number(persisted.rows[0]?.silver),
    }, { xp: 13, losses: 1, streak: 0, silver: 1_525 });
  } finally {
    if (playerIds.length) await cleanup(pool, playerIds);
    await pool.end();
  }
});
