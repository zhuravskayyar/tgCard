import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { EQUIPMENT_THING_SLOTS, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { ArenaService } from "./arenaService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function telegramUser(): ValidatedTelegramUser {
  telegramSequence += 1n;
  return { id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence), username: null, firstName: "Arena tester", lastName: null, photoUrl: null };
}

async function finishWithMoves(pool: Pool, service: ArenaService, playerId: string, moves: number) {
  await service.joinQueue(playerId);
  await pool.query("UPDATE arena_queue SET created_at = NOW() - INTERVAL '31 seconds' WHERE player_id = $1", [playerId]);
  const match = (await service.findActive(playerId)).arena!;
  const row = await pool.query<{ state: { participants: Array<{ hp: number; id: string; moves?: number; totalDamageDealt: number }> } }>("SELECT state FROM arena_matches WHERE id = $1", [match.matchId]);
  const state = row.rows[0]!.state;
  for (const participant of state.participants) {
    if (participant.id === playerId) { participant.moves = moves; participant.totalDamageDealt = 50_000; } else participant.hp = 0;
  }
  await pool.query("UPDATE arena_matches SET state = $2 WHERE id = $1", [match.matchId, JSON.stringify(state)]);
  return (await service.findActive(playerId)).arena!;
}

test("Arena pays rating and tokens only for a fought match, with no silver or gold per fight", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  let playerId = "";
  try {
    playerId = (await players.findOrCreateFromTelegram(telegramUser())).id;
    const service = new ArenaService(pool);
    const before = (await pool.query<{ arena_rating: number; gold: string; silver: string }>("SELECT arena_rating, gold, silver FROM players WHERE id = $1", [playerId])).rows[0]!;
    assert.equal(before.arena_rating, 1_400);

    const skipped = (await finishWithMoves(pool, service, playerId, 2)).result!;
    assert.equal(skipped.reward.counted, false);
    assert.equal(skipped.reward.status, "loss");
    assert.equal(skipped.reward.ratingChange, -3);
    assert.equal(skipped.reward.arenaTokens, 0);

    const fought = (await finishWithMoves(pool, service, playerId, 3)).result!;
    assert.equal(fought.reward.counted, true);
    assert.equal(fought.reward.status, "win");
    assert.ok(fought.reward.ratingChange > 0);
    assert.equal(fought.reward.arenaTokens, 30);

    const after = (await pool.query<{ gold: string; silver: string }>("SELECT gold, silver FROM players WHERE id = $1", [playerId])).rows[0]!;
    assert.equal(after.gold, before.gold);
    assert.equal(after.silver, before.silver);
    const events = await pool.query<{ event_type: string }>("SELECT event_type FROM player_campaign_events WHERE player_id = $1 AND event_type LIKE 'ARENA_%' ORDER BY event_type", [playerId]);
    assert.deepEqual(events.rows.map(({ event_type }) => event_type), ["ARENA_FINISHED", "ARENA_WON"]);

    const board = await service.getLeaderboard(playerId);
    assert.equal(board.league.index, 6);
    assert.equal(board.player.playerId, playerId);
  } finally {
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await pool.end();
  }
});

test("Arena starts with six participants and keeps attacker slot cooldowns independent of target", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  let playerId = "";
  try {
    playerId = (await players.findOrCreateFromTelegram(telegramUser())).id;
    const service = new ArenaService(pool);
    const queued = await service.joinQueue(playerId);
    assert.equal(queued.match, null);
    assert.ok(queued.queue);
    assert.equal(queued.queue.participantCount, 1);
    await pool.query("UPDATE arena_queue SET created_at = NOW() - INTERVAL '31 seconds' WHERE player_id = $1", [playerId]);
    const started = (await service.findActive(playerId)).arena;
    assert.ok(started);
    assert.equal(started.participants.length, 6);
    assert.equal(started.participants.filter(({ isBot }) => isBot).length, 5);
    assert.ok(started.participants.filter(({ isBot }) => isBot).every(({ photoUrl }) => photoUrl?.startsWith("/card-art/")));
    assert.ok(started.playerSlots.every(({ card, cooldownUntil }) => card === null && cooldownUntil !== null), "cards open face down");
    const openingRow = await pool.query<{ state: { participants: Array<{ cooldownUntil: Array<string | null> }> } }>("SELECT state FROM arena_matches WHERE id = $1", [started.matchId]);
    const openingState = openingRow.rows[0]!.state;
    for (const participant of openingState.participants) participant.cooldownUntil = [null, null, null];
    await pool.query("UPDATE arena_matches SET state = $2 WHERE id = $1", [started.matchId, JSON.stringify(openingState)]);
    const match = (await service.findActive(playerId)).arena!;
    assert.equal(match.playerSlots.filter(({ cooldownUntil }) => cooldownUntil === null).length, 3);
    const initialTargetId = match.targetId!;

    const attacked = await service.action(playerId, match.matchId, { expectedVersion: match.version, slotIndex: 0 });
    assert.ok(attacked.playerSlots[0].cooldownUntil);
    assert.equal(attacked.playerSlots[0].card, null);
    assert.equal(attacked.playerSlots[1].cooldownUntil, null);
    assert.equal(attacked.playerSlots[2].cooldownUntil, null);
    assert.ok(attacked.targetSlots);
    assert.equal(attacked.targetSlots[0].cooldownUntil, attacked.playerSlots[0].cooldownUntil);
    assert.equal(attacked.targetSlots[0].card, null);
    assert.equal(attacked.targetSlots[1].cooldownUntil, null);
    assert.ok(attacked.targetSlots[1].card);
    assert.equal(attacked.targetSlots[2].cooldownUntil, null);
    assert.ok(attacked.targetSlots[2].card);
    assert.equal(attacked.battleLog[0]?.attackerId, playerId);

    const attackedAgain = await service.action(playerId, match.matchId, { expectedVersion: attacked.version, slotIndex: 1 });
    assert.ok(attackedAgain.playerSlots[0].cooldownUntil);
    assert.ok(attackedAgain.playerSlots[1].cooldownUntil);
    assert.equal(attackedAgain.playerSlots[2].cooldownUntil, null);
    assert.ok(attackedAgain.targetSlots);
    assert.equal(attackedAgain.targetSlots[0].cooldownUntil, attackedAgain.playerSlots[0].cooldownUntil);
    assert.equal(attackedAgain.targetSlots[0].card, null);
    assert.equal(attackedAgain.targetSlots[1].cooldownUntil, attackedAgain.playerSlots[1].cooldownUntil);
    assert.equal(attackedAgain.targetSlots[1].card, null);
    assert.equal(attackedAgain.targetSlots[2].cooldownUntil, null);
    assert.ok(attackedAgain.targetSlots[2].card);

    const stored = await pool.query<{ state: {
      participants: Array<{ id: string; cooldownUntil: [string | null, string | null, string | null] }>;
      pairStates: Record<string, { attackerActiveSlots: [{ instanceId: string }, { instanceId: string }, { instanceId: string }] }>;
    } }>(
      "SELECT state FROM arena_matches WHERE id = $1",
      [match.matchId],
    );
    const state = stored.rows[0]!.state;
    const playerState = state.participants.find((participant) => participant.id === playerId)!;
    assert.ok(playerState.cooldownUntil[0]);
    assert.ok(playerState.cooldownUntil[1]);
    const activeCardsBeforeTargetSwitch = state.pairStates[`${playerId}::${initialTargetId}`]!.attackerActiveSlots.map(({ instanceId }) => instanceId);
    const activeCardBeforeExpiry = activeCardsBeforeTargetSwitch[0];

    playerState.cooldownUntil[0] = new Date(Date.now() + 60_000).toISOString();
    const preservedCooldown = playerState.cooldownUntil[0];
    await pool.query("UPDATE arena_matches SET state = $2 WHERE id = $1", [match.matchId, JSON.stringify(state)]);

    const directTargetId = match.participants.find(({ id, alive }) => alive && id !== playerId && id !== initialTargetId)!.id;
    let switched = await service.changeTarget(playerId, match.matchId, { expectedVersion: attackedAgain.version, targetId: directTargetId });
    assert.equal(switched.targetId, directTargetId);
    for (let index = 0; index < match.participants.length && switched.targetId !== initialTargetId; index += 1) {
      switched = await service.changeTarget(playerId, match.matchId, { expectedVersion: switched.version });
    }
    assert.equal(switched.targetId, initialTargetId);
    assert.equal(switched.playerSlots[0].cooldownUntil, preservedCooldown);
    assert.equal(switched.playerSlots[2].card?.instanceId, activeCardsBeforeTargetSwitch[2]);

    const switchedState = await pool.query<{ state: {
      pairStates: Record<string, { attackerActiveSlots: [{ instanceId: string }, { instanceId: string }, { instanceId: string }] }>;
    } }>("SELECT state FROM arena_matches WHERE id = $1", [match.matchId]);
    assert.deepEqual(
      switchedState.rows[0]!.state.pairStates[`${playerId}::${initialTargetId}`]!.attackerActiveSlots.map(({ instanceId }) => instanceId),
      activeCardsBeforeTargetSwitch,
    );

    const expired = await pool.query<{ state: {
      participants: Array<{ id: string; cooldownUntil: [string | null, string | null, string | null] }>;
      pairStates: Record<string, { attackerActiveSlots: [{ instanceId: string }, { instanceId: string }, { instanceId: string }] }>;
    } }>(
      "SELECT state FROM arena_matches WHERE id = $1",
      [match.matchId],
    );
    const expiredState = expired.rows[0]!.state;
    const expiredPlayer = expiredState.participants.find((participant) => participant.id === playerId)!;
    expiredPlayer.cooldownUntil[0] = new Date(Date.now() - 1_000).toISOString();
    expiredPlayer.cooldownUntil[1] = new Date(Date.now() + 60_000).toISOString();
    expiredPlayer.cooldownUntil[2] = null;
    await pool.query("UPDATE arena_matches SET state = $2 WHERE id = $1", [match.matchId, JSON.stringify(expiredState)]);

    const advanced = (await service.findActive(playerId)).arena;
    assert.ok(advanced);
    assert.equal(advanced.playerSlots[0].cooldownUntil, null);
    assert.notEqual(advanced.playerSlots[0].card?.instanceId, activeCardBeforeExpiry);
    assert.ok(advanced.playerSlots[1].cooldownUntil);
    assert.equal(advanced.playerSlots[2].cooldownUntil, null);
    assert.ok(advanced.targetSlots);
    assert.equal(advanced.targetSlots[0].cooldownUntil, null);
    assert.ok(advanced.targetSlots[0].card);
    assert.equal(advanced.targetSlots[1].cooldownUntil, advanced.playerSlots[1].cooldownUntil);
    assert.equal(advanced.targetSlots[1].card, null);
    assert.equal(advanced.targetSlots[2].cooldownUntil, null);
    assert.ok(advanced.targetSlots[2].card);
  } finally {
    if (playerId) {
      await pool.query("DELETE FROM arena_matches WHERE player_id = $1", [playerId]);
      await pool.query("DELETE FROM arena_queue WHERE player_id = $1", [playerId]);
      await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    }
    await pool.end();
  }
});

test("Arena Shop spends Arena Tokens and grants shared card shards", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  let playerId = "";
  try {
    playerId = (await players.findOrCreateFromTelegram(telegramUser())).id;
    await pool.query("UPDATE players SET arena_tokens = 50, card_shards = 0 WHERE id = $1", [playerId]);
    const purchase = await new ArenaService(pool).purchase(playerId, "arena_shards_25");
    assert.equal(purchase.arenaTokens, 30);
    assert.equal(purchase.cardShards, 25);
  } finally {
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await pool.end();
  }
});

test("Arena Shop grants random equipment to the player inventory", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  let playerId = "";
  try {
    playerId = (await players.findOrCreateFromTelegram(telegramUser())).id;
    await pool.query("UPDATE players SET arena_tokens = 60 WHERE id = $1", [playerId]);

    const purchase = await new ArenaService(pool).purchase(playerId, "arena_equipment_common");
    const inventory = await players.getEquipmentInventory(playerId);
    const purchasedItem = inventory.find(({ quantity }) => quantity > 0);
    const definition = STARTER_EQUIPMENT_DEFINITIONS.find(({ id }) => id === purchasedItem?.itemId);

    assert.equal(purchase.arenaTokens, 0);
    assert.ok(purchasedItem);
    assert.equal(purchasedItem.quantity, 1);
    assert.ok(definition);
    assert.equal(definition.category, "things");
    assert.equal(definition.rarity, "common");
    assert.ok(EQUIPMENT_THING_SLOTS.includes(definition.slot as typeof EQUIPMENT_THING_SLOTS[number]));
    assert.ok(definition.element);
  } finally {
    if (playerId) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    await pool.end();
  }
});

test("Arena keeps a 15-second registration window and puts live players into one match", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const service = new ArenaService(pool);
  let firstId = "";
  let secondId = "";
  let matchId = "";
  try {
    firstId = (await players.findOrCreateFromTelegram(telegramUser())).id;
    secondId = (await players.findOrCreateFromTelegram(telegramUser())).id;
    const firstQueued = await service.joinQueue(firstId);
    assert.equal(firstQueued.match, null);
    assert.equal(firstQueued.queue?.participantCount, 1);
    assert.ok(firstQueued.queue);
    assert.equal(new Date(firstQueued.queue.startsAt).getTime() - new Date(firstQueued.queue.createdAt).getTime(), 15_000);

    await pool.query("UPDATE arena_queue SET created_at = NOW() - INTERVAL '31 seconds' WHERE player_id = $1", [firstId]);
    const secondStarted = await service.joinQueue(secondId);
    assert.ok(secondStarted.match);
    assert.equal(secondStarted.queue, null);
    matchId = secondStarted.match.matchId;
    assert.equal(secondStarted.match.participants.filter(({ isBot }) => !isBot).length, 2);
    assert.equal(secondStarted.match.participants.filter(({ isBot }) => isBot).length, 4);
    assert.ok(secondStarted.match.participants.some(({ id }) => id === firstId));
    assert.ok(secondStarted.match.participants.some(({ id }) => id === secondId));

    const firstView = (await service.findActive(firstId)).arena;
    assert.ok(firstView);
    assert.equal(firstView.matchId, matchId);
    assert.equal(firstView.participants.filter(({ isBot }) => !isBot).length, 2);
  } finally {
    if (matchId) await pool.query("DELETE FROM arena_matches WHERE id = $1", [matchId]);
    if (firstId) await pool.query("DELETE FROM arena_queue WHERE player_id = $1", [firstId]);
    if (secondId) await pool.query("DELETE FROM arena_queue WHERE player_id = $1", [secondId]);
    if (firstId) await pool.query("DELETE FROM players WHERE id = $1", [firstId]);
    if (secondId) await pool.query("DELETE FROM players WHERE id = $1", [secondId]);
    await pool.end();
  }
});
