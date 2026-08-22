import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { backfillStarterCards } from "../inventory/starterCardGrant.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { DeckRepository } from "./deckRepository.js";
import { DeckValidationError } from "./deckRules.js";
import { backfillStarterDecks } from "./starterDeck.js";

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

test("new player receives one persistent nine-card starter deck", { skip: !databaseUrl }, async () => {
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
    assert.equal(Number(deckCount.rows[0]?.count), 1);
    assert.equal(firstDeck.cards.length, 9);
    assert.deepEqual(firstDeck.cards.map(({ slot }) => slot), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(firstDeck.totalPower, 108);
    assert.deepEqual(secondDeck, firstDeck);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("concurrent player bootstrap creates only one complete deck", { skip: !databaseUrl }, async () => {
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

test("starter deck backfill is idempotent", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const decks = new DeckRepository(pool);
  const user = createTelegramUser("backfill");
  const playerId = randomUUID();

  try {
    await pool.query(
      "INSERT INTO players (id, telegram_user_id, first_name) VALUES ($1, $2, $3)",
      [playerId, user.id, user.firstName],
    );
    await backfillStarterCards(pool);
    await backfillStarterDecks(pool);
    await backfillStarterDecks(pool);

    const deck = await decks.findByPlayerId(playerId);
    const deckCount = await pool.query<{ count: string }>(
      "SELECT count(*) FROM player_decks WHERE player_id = $1",
      [playerId],
    );
    assert.equal(Number(deckCount.rows[0]?.count), 1);
    assert.equal(deck.cards.length, 9);
    assert.equal(deck.totalPower, 108);
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("deck save enforces ownership and owned quantity", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const decks = new DeckRepository(pool);
  const user = createTelegramUser("validation");

  try {
    const player = await players.findOrCreateFromTelegram(user);
    const deck = await decks.findByPlayerId(player.id);
    const slots = deck.cards.map(({ cardId, slot }) => ({ cardId, slot }));
    const repeated = slots.map((entry, index) => index === 8 ? { ...entry, cardId: slots[0]!.cardId } : entry);
    await assert.rejects(
      decks.save(player.id, repeated),
      (error) => error instanceof DeckValidationError && error.code === "card_quantity_exceeded",
    );

    await pool.query("DELETE FROM player_cards WHERE player_id = $1 AND card_id = $2", [player.id, slots[8]!.cardId]);
    await assert.rejects(
      decks.save(player.id, slots),
      (error) => error instanceof DeckValidationError && error.code === "unowned_card",
    );
  } finally {
    await cleanupPlayers(pool, [user.id]);
    await pool.end();
  }
});

test("deck lookup and save remain scoped to the authenticated player id", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const decks = new DeckRepository(pool);
  const firstUser = createTelegramUser("owner");
  const secondUser = createTelegramUser("other");

  try {
    const first = await players.findOrCreateFromTelegram(firstUser);
    const second = await players.findOrCreateFromTelegram(secondUser);
    const firstBefore = await decks.findByPlayerId(first.id);
    const secondBefore = await decks.findByPlayerId(second.id);
    const reversedSlots = [...secondBefore.cards]
      .reverse()
      .map((card, index) => ({ slot: index + 1, cardId: card.cardId }));

    await decks.save(second.id, reversedSlots);
    const firstAfter = await decks.findByPlayerId(first.id);
    const secondAfter = await decks.findByPlayerId(second.id);

    assert.deepEqual(firstAfter, firstBefore);
    assert.deepEqual(secondAfter.cards.map(({ cardId }) => cardId), reversedSlots.map(({ cardId }) => cardId));
  } finally {
    await cleanupPlayers(pool, [firstUser.id, secondUser.id]);
    await pool.end();
  }
});
