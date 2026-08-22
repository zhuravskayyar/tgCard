import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { countDeckElements } from "@cardastika/game-core";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { PlayerRepository } from "../users/playerRepository.js";
import {
  recalculateAutomaticDeck,
  recalculateAutomaticDeckForPlayer,
} from "./automaticDeckService.js";
import { DeckMissingError, DeckRepository } from "./deckRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let telegramSequence = 0n;

function createTelegramUser(label: string): ValidatedTelegramUser {
  telegramSequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + telegramSequence),
    username: null,
    firstName: `Deck test ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

async function cleanupPlayers(pool: Pool, telegramUserIds: string[]) {
  await pool.query("DELETE FROM players WHERE telegram_user_id = ANY($1::bigint[])", [telegramUserIds]);
}

test("bootstrap keeps one automatic balanced 108-power starter deck without changing economy", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const decks = new DeckRepository(pool);
  const user = createTelegramUser("repeat");

  try {
    const firstPlayer = await players.findOrCreateFromTelegram(user);
    const firstDeck = await decks.findByPlayerId(firstPlayer.id);
    const secondPlayer = await players.findOrCreateFromTelegram(user);
    const secondDeck = await decks.findByPlayerId(secondPlayer.id);
    const deckCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_decks WHERE player_id = $1",
      [firstPlayer.id],
    );

    assert.equal(firstPlayer.id, secondPlayer.id);
    assert.equal(firstPlayer.silver, 1_500);
    assert.equal(firstPlayer.gold, 0);
    assert.equal(secondPlayer.silver, firstPlayer.silver);
    assert.equal(secondPlayer.gold, firstPlayer.gold);
    assert.equal(Number(deckCount.rows[0]?.count), 1);
    assert.equal(firstDeck.cards.length, 9);
    assert.equal(firstDeck.totalPower, 108);
    assert.deepEqual(countDeckElements(firstDeck.cards), { fire: 3, water: 2, air: 2, earth: 2 });
    assert.deepEqual(firstDeck.cards.map(({ code }) => code), STARTER_CARDS.map(({ code }) => code));
    assert.deepEqual(secondDeck, firstDeck);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("concurrent bootstrap creates only one complete automatic deck", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const decks = new DeckRepository(pool);
  const user = createTelegramUser("concurrent");

  try {
    const [left, right] = await Promise.all([
      players.findOrCreateFromTelegram(user),
      players.findOrCreateFromTelegram(user),
    ]);
    const deck = await decks.findByPlayerId(left.id);
    const deckCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_decks WHERE player_id = $1",
      [left.id],
    );

    assert.equal(left.id, right.id);
    assert.equal(Number(deckCount.rows[0]?.count), 1);
    assert.equal(deck.cards.length, 9);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("inventory transaction replaces a weaker card and skips an unchanged deck write", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const decks = new DeckRepository(pool);
  const user = createTelegramUser("stronger-card");
  const bonusCardId = `test_${randomUUID()}`;
  const bonusCardCode = `test-${randomUUID()}`;

  try {
    const player = await players.findOrCreateFromTelegram(user);
    const before = await decks.findByPlayerId(player.id);
    const client = await pool.connect();
    let updatedResult;
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO cards (id, code, display_name, element, rarity, power)
          VALUES ($1, $2, 'Test fire card', 'fire', 'common', 50)
        `,
        [bonusCardId, bonusCardCode],
      );
      await client.query(
        "INSERT INTO player_cards (player_id, card_id, quantity) VALUES ($1, $2, 1)",
        [player.id, bonusCardId],
      );
      updatedResult = await recalculateAutomaticDeck(client, player.id);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const after = await decks.findByPlayerId(player.id);
    const updatedAtBeforeUnchangedCheck = await pool.query<{ updated_at: Date }>(
      "SELECT updated_at FROM player_decks WHERE player_id = $1",
      [player.id],
    );
    const unchangedResult = await recalculateAutomaticDeckForPlayer(pool, player.id);
    const updatedAtAfterUnchangedCheck = await pool.query<{ updated_at: Date }>(
      "SELECT updated_at FROM player_decks WHERE player_id = $1",
      [player.id],
    );

    assert.equal(updatedResult.status, "updated");
    assert.equal(after.totalPower, before.totalPower + 38);
    assert.ok(after.cards.some(({ cardId }) => cardId === bonusCardId));
    assert.deepEqual(countDeckElements(after.cards), { fire: 3, water: 2, air: 2, earth: 2 });
    assert.equal(unchangedResult.status, "unchanged");
    assert.deepEqual(updatedAtAfterUnchangedCheck.rows[0], updatedAtBeforeUnchangedCheck.rows[0]);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.query("DELETE FROM cards WHERE id = $1", [bonusCardId]);
    await pool.end();
  }
});

test("insufficient inventory returns structured state and never creates an invalid deck", {
  skip: !databaseUrl,
}, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const playerId = randomUUID();
  const user = createTelegramUser("insufficient");

  try {
    await pool.query(
      "INSERT INTO players (id, telegram_user_id, first_name) VALUES ($1, $2, $3)",
      [playerId, user.id, user.firstName],
    );
    const result = await recalculateAutomaticDeckForPlayer(pool, playerId);
    const deckCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_decks WHERE player_id = $1",
      [playerId],
    );

    assert.deepEqual(result, {
      status: "insufficient_valid_cards",
      preservedCurrentDeck: false,
    });
    assert.equal(Number(deckCount.rows[0]?.count), 0);
    await assert.rejects(
      new DeckRepository(pool).findByPlayerId(playerId),
      (error) => error instanceof DeckMissingError,
    );
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});
