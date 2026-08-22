import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { backfillStarterCards } from "./starterCardGrant.js";
import { STARTER_CARD_COUNT } from "./starterCards.js";
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
    assert.equal(firstInventory.reduce((total, card) => total + card.quantity, 0), STARTER_CARD_COUNT);

    const secondPlayer = await players.findOrCreateFromTelegram(user);
    const secondInventory = await inventory.findByPlayerId(secondPlayer.id);
    assert.equal(secondPlayer.id, firstPlayer.id);
    assert.equal(secondInventory.length, STARTER_CARD_COUNT);
    assert.equal(secondInventory.reduce((total, card) => total + card.quantity, 0), STARTER_CARD_COUNT);
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
    assert.equal(cards.reduce((total, card) => total + card.quantity, 0), STARTER_CARD_COUNT);
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
    assert.equal(cards.reduce((total, card) => total + card.quantity, 0), STARTER_CARD_COUNT);
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
    await pool.query(
      `
        UPDATE player_cards
        SET quantity = 2
        WHERE player_id = $1
          AND card_id = (SELECT id FROM cards ORDER BY code LIMIT 1)
      `,
      [secondPlayer.id],
    );

    const firstCards = await inventory.findByPlayerId(firstPlayer.id);
    const secondCards = await inventory.findByPlayerId(secondPlayer.id);

    assert.equal(firstCards.length, STARTER_CARD_COUNT);
    assert.equal(firstCards.reduce((total, card) => total + card.quantity, 0), STARTER_CARD_COUNT);
    assert.equal(secondCards.reduce((total, card) => total + card.quantity, 0), STARTER_CARD_COUNT + 1);
  } finally {
    await cleanupPlayers(pool, [firstUser.id, secondUser.id]);
    await pool.end();
  }
});
