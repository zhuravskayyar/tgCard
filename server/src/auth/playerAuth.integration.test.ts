import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import type { VerifiedIdentity } from "./identity.js";
import { SessionRepository } from "./sessionRepository.js";
import type { ValidatedTelegramUser } from "./telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function telegramUser(label: string): ValidatedTelegramUser {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: `tg_${label.replace(/[^a-z0-9]/gi, "_")}`,
    firstName: `Telegram ${label}`,
    lastName: null,
    photoUrl: null,
  };
}

function googleIdentity(id: string): VerifiedIdentity {
  return {
    provider: "google",
    providerUserId: id,
    email: `${id}@example.com`,
    firstName: `Google ${id}`,
    lastName: null,
    photoUrl: null,
  };
}

async function deletePlayers(pool: Pool, ids: string[]) {
  if (ids.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
}

test("an existing Telegram player gains an identity without changing player data", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = telegramUser("migration");
  const playerId = randomUUID();
  try {
    await pool.query(
      "INSERT INTO players (id, telegram_user_id, first_name, level, silver, gold) VALUES ($1, $2, $3, 4, 2345, 7)",
      [playerId, user.id, user.firstName],
    );
    const player = await players.findOrCreateFromTelegram(user);
    assert.equal(player.id, playerId);
    assert.equal(player.level, 4);
    assert.equal(player.silver, 2345);
    assert.equal(player.gold, 7);
    const identity = await pool.query("SELECT provider, provider_user_id FROM auth_identities WHERE player_id = $1", [playerId]);
    assert.deepEqual(identity.rows, [{ provider: "telegram", provider_user_id: user.id }]);
  } finally {
    await deletePlayers(pool, [playerId]);
    await pool.end();
  }
});

test("auth migration preserves an existing player's cards, currency, deck, level, and rating", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = telegramUser("migration-state");
  let playerId: string | undefined;
  try {
    const initial = await players.findOrCreateFromTelegram(user);
    playerId = initial.id;
    await pool.query(
      "UPDATE players SET level = 8, silver = 4321, gold = 19, rating = 2718 WHERE id = $1",
      [playerId],
    );
    await pool.query("DELETE FROM auth_identities WHERE player_id = $1 AND provider = 'telegram'", [playerId]);

    async function snapshot() {
      const player = await pool.query(
        "SELECT level, silver, gold, rating FROM players WHERE id = $1",
        [playerId],
      );
      const cards = await pool.query(
        "SELECT card_id, level, bonus_power FROM player_card_instances WHERE player_id = $1 ORDER BY card_id, id",
        [playerId],
      );
      const deck = await pool.query(
        `
          SELECT deck_slots.slot, deck_slots.card_instance_id
          FROM player_decks
          INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
          WHERE player_decks.player_id = $1
          ORDER BY deck_slots.slot
        `,
        [playerId],
      );
      return { cards: cards.rows, deck: deck.rows, player: player.rows };
    }

    const before = await snapshot();
    const migrated = await players.findOrCreateFromTelegram(user);
    const after = await snapshot();

    assert.equal(migrated.id, playerId);
    assert.deepEqual(after, before);
    assert.deepEqual(await pool.query("SELECT provider, provider_user_id FROM auth_identities WHERE player_id = $1", [playerId]).then(({ rows }) => rows), [
      { provider: "telegram", provider_user_id: user.id },
    ]);
  } finally {
    if (playerId) await deletePlayers(pool, [playerId]);
    await pool.end();
  }
});

test("new and repeated Telegram login resolve to one player", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const user = telegramUser("repeat");
  try {
    const first = await players.findOrCreateFromTelegram(user);
    const second = await players.findOrCreateFromTelegram(user);
    assert.equal(first.id, second.id);
    assert.equal(Number((await pool.query("SELECT count(*) FROM players WHERE telegram_user_id = $1", [user.id])).rows[0].count), 1);
    assert.equal(Number((await pool.query("SELECT count(*) FROM auth_identities WHERE provider = 'telegram' AND provider_user_id = $1", [user.id])).rows[0].count), 1);
    await deletePlayers(pool, [first.id]);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [user.id]);
    await pool.end();
  }
});

test("new and repeated Google login resolve to one player", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const identity = googleIdentity(`google-${Date.now()}-${sequence}`);
  let playerId: string | undefined;
  try {
    const first = await players.findOrCreateFromIdentity(identity);
    playerId = first.id;
    const second = await players.findOrCreateFromIdentity(identity);
    assert.equal(first.id, second.id);
    assert.equal(Number((await pool.query("SELECT count(*) FROM auth_identities WHERE provider = 'google' AND provider_user_id = $1", [identity.providerUserId])).rows[0].count), 1);
  } finally {
    await deletePlayers(pool, playerId ? [playerId] : []);
    await pool.end();
  }
});

test("concurrent Google login cannot create duplicate players", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const identity = googleIdentity(`google-concurrent-${Date.now()}-${sequence}`);
  let playerIds: string[] = [];
  try {
    const [left, right] = await Promise.all([
      players.findOrCreateFromIdentity(identity),
      players.findOrCreateFromIdentity(identity),
    ]);
    assert.equal(left.id, right.id);
    playerIds = [left.id];
    assert.equal(Number((await pool.query("SELECT count(*) FROM players WHERE id = $1", [left.id])).rows[0].count), 1);
  } finally {
    await deletePlayers(pool, playerIds);
    await pool.query("DELETE FROM auth_identities WHERE provider_user_id = $1", [identity.providerUserId]);
    await pool.end();
  }
});

test("Google can be linked to a Telegram player and both identities resolve to one player", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const telegram = telegramUser("link");
  const identity = googleIdentity(`link-${Date.now()}-${sequence}`);
  try {
    const player = await players.findOrCreateFromTelegram(telegram);
    const identities = await players.linkIdentity(player.id, identity);
    assert.deepEqual(identities.map(({ provider }) => provider).sort(), ["google", "telegram"]);
    const googleLogin = await players.findOrCreateFromIdentity(identity);
    assert.equal(googleLogin.id, player.id);
    await deletePlayers(pool, [player.id]);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [telegram.id]);
    await pool.end();
  }
});

test("an identity cannot be linked to another player and rating remains player-owned", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const firstUser = telegramUser("owner");
  const secondUser = telegramUser("other");
  const identity = googleIdentity(`conflict-${Date.now()}-${sequence}`);
  try {
    const first = await players.findOrCreateFromTelegram(firstUser);
    const second = await players.findOrCreateFromTelegram(secondUser);
    await players.linkIdentity(first.id, identity);
    await assert.rejects(players.linkIdentity(second.id, identity), /already linked to another/);
    await pool.query("UPDATE players SET rating = 2841 WHERE id = $1", [first.id]);
    assert.equal((await players.findSummaryById(first.id)).rating, 2841);
    await deletePlayers(pool, [first.id, second.id]);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = ANY($1::bigint[])", [[firstUser.id, secondUser.id]]);
    await pool.end();
  }
});

test("a Cardastika session is created, reused and revoked independently of provider tokens", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const sessions = new SessionRepository(pool);
  const user = telegramUser("session");
  try {
    const player = await players.findOrCreateFromTelegram(user);
    const session = await sessions.create(player.id, "telegram");
    assert.deepEqual(await sessions.findActive(session.token), { playerId: player.id, provider: "telegram" });
    await sessions.revoke(session.token);
    assert.equal(await sessions.findActive(session.token), null);
    await deletePlayers(pool, [player.id]);
  } finally {
    await pool.query("DELETE FROM players WHERE telegram_user_id = $1", [user.id]);
    await pool.end();
  }
});
