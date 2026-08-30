import assert from "node:assert/strict";
import test from "node:test";
import { getDeckPower, validateDeckElementBalance } from "@cardastika/game-core";
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

test("matchmaking always builds and persists a varied bot deck even when a real player is eligible", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const challengerUser = telegramUser("bot only");
  const eligibleRealUser = telegramUser("ignored real opponent");
  const playerIds: string[] = [];
  try {
    const challenger = await players.findOrCreateFromTelegram(challengerUser);
    const eligibleReal = await players.findOrCreateFromTelegram(eligibleRealUser);
    playerIds.push(challenger.id, eligibleReal.id);
    const playerCountBefore = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM players");

    const service = new DuelService(pool, () => 0);
    const found = await service.search(challenger.id);
    assert.equal(found.opponent.powerDifferencePct, -10);
    assert.match(found.opponent.photoUrl ?? "", /^\/card-art\/.+\.(?:webp|png|jpg|jpeg)$/);
    assert.match(found.opponent.name, /^[A-Za-z]+\d+$/);
    const playerCountAfter = await pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM players");
    assert.equal(playerCountAfter.rows[0]?.count, playerCountBefore.rows[0]?.count);

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
    assert.equal(validateDeckElementBalance(duel.opponent.cards).valid, true);
    assert.equal(getDeckPower(duel.opponent.cards), duel.opponent.effectiveDeckPower);
    assert.notEqual(duel.opponent.effectiveDeckPower, duel.player.effectiveDeckPower);
    assert.ok(duel.opponent.cards.every(({ cardId }) => (
      !duel.player.cards.some((card) => card.cardId === cardId)
    )));

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

test("winning finalizes once, grants Duel Gold, and resets its limit after a level-up", {
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
    await pool.query(
      "UPDATE players SET account_xp = 239, duel_gold_earned_today = 1, duel_gold_level = level WHERE id = $1",
      [challenger.id],
    );
    const service = new DuelService(pool, () => 0);
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
      duelGoldReward: duel.result.duelGoldReward,
      levelUpGoldReward: duel.result.levelUpGoldReward,
    }, { outcome: "win", xp: 108, silver: 100, gold: 2, duelGoldReward: 1, levelUpGoldReward: 2 });
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
      duel_gold_earned_today: number;
      duel_gold_level: number;
      gold: string;
      silver: string;
    }>("SELECT account_xp, duel_wins, duel_gold_earned_today, duel_gold_level, silver, gold FROM players WHERE id = $1", [challenger.id]);
    assert.deepEqual({
      xp: Number(persisted.rows[0]?.account_xp),
      wins: persisted.rows[0]?.duel_wins,
      duelGoldEarnedToday: persisted.rows[0]?.duel_gold_earned_today,
      duelGoldLevel: persisted.rows[0]?.duel_gold_level,
      silver: Number(persisted.rows[0]?.silver),
      gold: Number(persisted.rows[0]?.gold),
    }, { xp: 107, wins: 1, duelGoldEarnedToday: 1, duelGoldLevel: 2, silver: 1_600, gold: 3 });
  } finally {
    if (playerIds.length) await cleanup(pool, playerIds);
    await pool.end();
  }
});

test("tutorial players receive a guaranteed first victory after a losing exchange", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const challengerUser = telegramUser("tutorial winner");
  const playerIds: string[] = [];
  try {
    const challenger = await players.findOrCreateFromTelegram(challengerUser);
    playerIds.push(challenger.id);
    const service = new DuelService(pool, () => 0.999999);
    const found = await service.search(challenger.id);
    let duel = await service.start(challenger.id, found.searchId, true);
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
    assert.equal(duel.status, "won");
    assert.equal(duel.result?.outcome, "win");
    const persisted = await pool.query<{ duel_wins: number; duel_losses: number }>(
      "SELECT duel_wins, duel_losses FROM players WHERE id = $1",
      [challenger.id],
    );
    assert.deepEqual(persisted.rows[0], { duel_wins: 1, duel_losses: 0 });
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
    await pool.query("UPDATE players SET tutorial_eligible = FALSE WHERE id = $1", [challenger.id]);
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
    }, { outcome: "loss", xp: 12, silver: 50, gold: 0, streak: 0 });
    const persisted = await pool.query<{
      account_xp: number;
      duel_losses: number;
      duel_win_streak: number;
      silver: string;
    }>("SELECT account_xp, duel_losses, duel_win_streak, silver FROM players WHERE id = $1", [challenger.id]);
    assert.deepEqual({
      xp: Number(persisted.rows[0]?.account_xp),
      losses: persisted.rows[0]?.duel_losses,
      streak: persisted.rows[0]?.duel_win_streak,
      silver: Number(persisted.rows[0]?.silver),
    }, { xp: 12, losses: 1, streak: 0, silver: 1_550 });
  } finally {
    if (playerIds.length) await cleanup(pool, playerIds);
    await pool.end();
  }
});
