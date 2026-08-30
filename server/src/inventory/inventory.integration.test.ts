import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { backfillStarterCards } from "./starterCardGrant.js";
import { STARTER_CARDS, STARTER_CARD_COUNT } from "./starterCards.js";
import { InventoryRepository } from "./inventoryRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function createTelegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;

  return {
    id: String(BigInt(Date.now()) * 1_000n + telegramSequence),
    username: null,
    firstName: `Inventory test ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

async function cleanupPlayers(pool: Pool, telegramUserIds: string[]) {
  await pool.query(
    "DELETE FROM players WHERE telegram_user_id = ANY($1::bigint[])",
    [telegramUserIds],
  );
}

test("new player receives nine starters and a second login does not duplicate them", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("repeat");

  try {
    const firstPlayer = await players.findOrCreateFromTelegram(user);
    const firstInventory = await inventory.findByPlayerId(firstPlayer.id);
    assert.equal(firstInventory.length, STARTER_CARD_COUNT);
    assert.ok(firstInventory.every(({ level, basePower, bonusPower, finalPower, rarity }) => (
      level === 1 && basePower === 10 && bonusPower === 2 && finalPower === 12 && rarity === "common"
    )));
    assert.deepEqual(
      firstInventory.map(({ displayName }) => displayName),
      STARTER_CARDS.map(({ displayName }) => displayName),
    );
    assert.ok(firstInventory.every((card) => card.artKey === null));

    const secondPlayer = await players.findOrCreateFromTelegram(user);
    const secondInventory = await inventory.findByPlayerId(secondPlayer.id);
    assert.equal(secondPlayer.id, firstPlayer.id);
    assert.equal(secondInventory.length, STARTER_CARD_COUNT);
    assert.equal(new Set(secondInventory.map(({ instanceId }) => instanceId)).size, STARTER_CARD_COUNT);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("a consumed starter is not re-granted on the next authenticated request", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("consumed starter");

  try {
    const player = await players.findOrCreateFromTelegram(user);
    const starter = (await pool.query<{ id: string }>(
      `SELECT player_card_instances.id
       FROM player_card_instances
       INNER JOIN cards ON cards.id = player_card_instances.card_id
       WHERE player_card_instances.player_id = $1 AND cards.code = 'starter_01'`,
      [player.id],
    )).rows[0];
    assert.ok(starter);

    await pool.query("DELETE FROM deck_slots WHERE card_instance_id = $1", [starter.id]);
    await pool.query("DELETE FROM player_card_instances WHERE id = $1", [starter.id]);

    await players.findOrCreateFromTelegram(user);
    const afterLogin = await inventory.findByPlayerId(player.id);
    assert.equal(afterLogin.length, STARTER_CARD_COUNT - 1);
    assert.ok(!afterLogin.some(({ instanceId }) => instanceId === starter.id));
    assert.equal(
      Number((await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM player_card_instances
         INNER JOIN cards ON cards.id = player_card_instances.card_id
         WHERE player_card_instances.player_id = $1 AND cards.code = 'starter_01'`,
        [player.id],
      )).rows[0]?.count),
      0,
    );
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("concurrent bootstrap requests cannot duplicate starter ownership", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("concurrent");

  try {
    const [left, right] = await Promise.all([
      players.findOrCreateFromTelegram(user),
      players.findOrCreateFromTelegram(user),
    ]);
    const cards = await inventory.findByPlayerId(left.id);
    const playerCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM players WHERE telegram_user_id = $1",
      [user.id],
    );

    assert.equal(left.id, right.id);
    assert.equal(Number(playerCount.rows[0]?.count), 1);
    assert.equal(cards.length, STARTER_CARD_COUNT);
    assert.equal(new Set(cards.map(({ instanceId }) => instanceId)).size, STARTER_CARD_COUNT);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("starter backfill is idempotent", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl });
  const inventory = new InventoryRepository(pool);
  const user = createTelegramUser("backfill");
  const playerId = randomUUID();

  try {
    await pool.query(
      `
        INSERT INTO players (id, telegram_user_id, first_name, level, silver, gold)
        VALUES ($1, $2, $3, 1, 1500, 0)
      `,
      [playerId, user.id, user.firstName],
    );

    await backfillStarterCards(pool);
    await backfillStarterCards(pool);
    const cards = await inventory.findByPlayerId(playerId);

    assert.equal(cards.length, STARTER_CARD_COUNT);
    assert.equal(new Set(cards.map(({ instanceId }) => instanceId)).size, STARTER_CARD_COUNT);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("inventory lookup returns only the requested player's ownership", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const inventory = new InventoryRepository(pool);
  const firstUser = createTelegramUser("owner");
  const secondUser = createTelegramUser("other");

  try {
    const firstPlayer = await players.findOrCreateFromTelegram(firstUser);
    const secondPlayer = await players.findOrCreateFromTelegram(secondUser);
    const duplicateInstanceId = randomUUID();
    await pool.query(
      `
        INSERT INTO player_card_instances (id, player_id, card_id, level, bonus_power)
        VALUES ($1, $2, $3, 2, 7)
      `,
      [duplicateInstanceId, secondPlayer.id, STARTER_CARDS[0]!.id],
    );

    const firstCards = await inventory.findByPlayerId(firstPlayer.id);
    const secondCards = await inventory.findByPlayerId(secondPlayer.id);

    assert.equal(firstCards.length, STARTER_CARD_COUNT);
    assert.equal(firstCards.length, STARTER_CARD_COUNT);
    assert.equal(secondCards.length, STARTER_CARD_COUNT + 1);
    const duplicateDefinitions = secondCards.filter(({ cardId }) => cardId === STARTER_CARDS[0]!.id);
    assert.equal(duplicateDefinitions.length, 2);
    assert.equal(new Set(duplicateDefinitions.map(({ instanceId }) => instanceId)).size, 2);
    assert.ok(duplicateDefinitions.some(({ instanceId, level, bonusPower, finalPower }) => (
      instanceId === duplicateInstanceId && level === 2 && bonusPower === 7 && finalPower === 27
    )));
  } finally {
    await cleanupPlayers(pool, [firstUser.id, secondUser.id]);
    await pool.end();
  }
});
