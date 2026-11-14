import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool, type PoolClient } from "pg";
import { NotificationService, type DeliveryResult, type NotificationSender } from "./notificationService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
const BIG_BUDGET = 100_000;

class FakeSender implements NotificationSender {
  readonly sent: Array<{ chatId: string; text: string }> = [];
  readonly blockedChats = new Set<string>();
  async send(chatId: string, text: string): Promise<DeliveryResult> {
    if (this.blockedChats.has(chatId)) return "blocked";
    this.sent.push({ chatId, text });
    return "sent";
  }
  to(chatId: string) {
    return this.sent.filter((message) => message.chatId === chatId).map((message) => message.text);
  }
}

let telegramSequence = 0;
async function createPlayer(client: PoolClient, columns: Record<string, unknown> = {}) {
  telegramSequence += 1;
  const chatId = String(9_000_000_000_000 + (Date.now() % 1_000_000_000) * 100 + telegramSequence);
  const names = ["telegram_user_id", "first_name", ...Object.keys(columns)];
  const values = [chatId, "Notify test", ...Object.values(columns)];
  const result = await client.query<{ id: string }>(
    `INSERT INTO players (id, ${names.join(", ")}) VALUES (gen_random_uuid(), ${names.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`,
    values,
  );
  return { id: result.rows[0]!.id, chatId };
}

/** Each test runs in a transaction that is rolled back, so the local database keeps no test players or markers. */
async function inTransaction(run: (client: PoolClient) => Promise<void>) {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await run(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

test("an expired duel break is announced once per break and respects the switch", { skip: !databaseUrl }, async () => {
  await inTransaction(async (client) => {
    const sender = new FakeSender();
    const service = new NotificationService(client, sender, BIG_BUDGET);
    const now = new Date();
    const refill = new Date(now.getTime() - 5 * 60_000);
    const ready = await createPlayer(client, { duel_remaining: 0, duel_refill_at: refill, last_seen_at: new Date(refill.getTime() - 60_000) });
    const muted = await createPlayer(client, { duel_remaining: 0, duel_refill_at: refill });
    const stillWaiting = await createPlayer(client, { duel_remaining: 0, duel_refill_at: new Date(now.getTime() + 60_000) });
    const sawIt = await createPlayer(client, { duel_remaining: 0, duel_refill_at: refill, last_seen_at: now });
    // Set in SQL, so the value has microseconds that a JS Date cannot hold.
    const precise = await createPlayer(client);
    await client.query("UPDATE players SET duel_remaining = 0, duel_refill_at = $2::timestamptz - INTERVAL '61.234567 seconds' WHERE id = $1", [precise.id, now]);
    await service.updateSettings(muted.id, { preferences: { duelReady: false } });

    const report = await service.sweep(now);
    assert.equal(report.ran, true);
    assert.equal(sender.to(ready.chatId).length, 1);
    assert.equal(sender.to(precise.chatId).length, 1);
    assert.deepEqual([sender.to(muted.chatId), sender.to(stillWaiting.chatId), sender.to(sawIt.chatId)], [[], [], []]);

    await service.sweep(new Date(now.getTime() + 60_000));
    assert.equal(sender.to(ready.chatId).length, 1, "the same break is not announced twice");
    assert.equal(sender.to(precise.chatId).length, 1, "microsecond timestamps dedupe too");

    const nextRefill = new Date(now.getTime() + 2 * 60_000);
    await client.query("UPDATE players SET duel_refill_at = $2 WHERE id = $1", [ready.id, nextRefill]);
    await service.sweep(new Date(nextRefill.getTime() + 60_000));
    assert.equal(sender.to(ready.chatId).length, 2, "a new break is announced again");
  });
});

test("unread mail and guild chat notify once per window; a blocked bot stops delivery", { skip: !databaseUrl }, async () => {
  await inTransaction(async (client) => {
    const sender = new FakeSender();
    const service = new NotificationService(client, sender, BIG_BUDGET);
    const now = new Date();
    const away = new Date(now.getTime() - 60 * 60_000);
    const reader = await createPlayer(client, { last_seen_at: away });
    const author = await createPlayer(client, { last_seen_at: now });
    const blocked = await createPlayer(client, { last_seen_at: away });

    await client.query(
      "INSERT INTO player_mail (player_id, subject, body, created_at) VALUES ($1, 's', 'b', $2), ($1, 's', 'b', $2), ($3, 's', 'b', $2)",
      [reader.id, new Date(now.getTime() - 10 * 60_000), blocked.id],
    );
    const guildId = randomUUID();
    await client.query("INSERT INTO guilds (id, name, name_key, created_by) VALUES ($1, 'Дуби', $2, $3)", [guildId, `notify-${guildId}`, author.id]);
    await client.query(
      "INSERT INTO guild_members (guild_id, player_id, role, joined_at) VALUES ($1, $2, 'leader', $4), ($1, $3, 'member', $4)",
      [guildId, author.id, reader.id, new Date(now.getTime() - 2 * 60 * 60_000)],
    );
    await client.query(
      "INSERT INTO guild_raid_chat_messages (guild_id, channel, player_id, author, body, created_at) VALUES ($1, 'witches', $2, 'Ведмідь', 'Збір!', $3)",
      [guildId, author.id, new Date(now.getTime() - 5 * 60_000)],
    );
    sender.blockedChats.add(blocked.chatId);

    const report = await service.sweep(now);
    const readerMessages = sender.to(reader.chatId);
    assert.equal(readerMessages.length, 2);
    assert.match(readerMessages[0]!, /2/u, "two unread letters are counted in one message");
    assert.match(readerMessages[1]!, /Ведмідь.*Дуби/u);
    assert.deepEqual(sender.to(author.chatId), [], "the author is not notified about their own message");
    assert.ok(report.blocked >= 1);
    assert.equal((await service.getSettings(blocked.id)).telegramBlocked, true);

    await client.query("INSERT INTO player_mail (player_id, subject, body, created_at) VALUES ($1, 's', 'b', $2)", [reader.id, new Date(now.getTime() + 60_000)]);
    await service.sweep(new Date(now.getTime() + 2 * 60_000));
    assert.equal(sender.to(reader.chatId).length, 2, "new mail within 30 minutes waits");
    await service.sweep(new Date(now.getTime() + 45 * 60_000));
    assert.equal(sender.to(reader.chatId).length, 3, "after the window the new letter is announced");

    sender.blockedChats.delete(blocked.chatId);
    await service.sweep(new Date(now.getTime() + 50 * 60_000));
    assert.deepEqual(sender.to(blocked.chatId), [], "a recorded refusal is not retried");
    assert.equal((await service.updateSettings(blocked.id, {})).telegramBlocked, false, "saving settings clears the refusal");
  });
});

test("inactive players get one win-back reminder per absence and the newest announcement once", { skip: !databaseUrl }, async () => {
  await inTransaction(async (client) => {
    const sender = new FakeSender();
    const service = new NotificationService(client, sender, BIG_BUDGET);
    const now = new Date();
    const sleeper = await createPlayer(client, { last_seen_at: new Date(now.getTime() - 4 * 24 * 60 * 60_000) });
    const english = await createPlayer(client, { last_seen_at: now });
    await service.updateSettings(english.id, { locale: "en", preferences: { winback: false } });
    await client.query("INSERT INTO notification_announcements (body_uk, body_en, created_at) VALUES ('Оновлення!', 'Update!', $1)", [new Date(now.getTime() - 60_000)]);

    await service.sweep(now);
    assert.equal(sender.to(sleeper.chatId).length, 2);
    assert.ok(sender.to(sleeper.chatId).includes("Оновлення!"));
    assert.deepEqual(sender.to(english.chatId), ["Update!"]);

    await service.sweep(new Date(now.getTime() + 60_000));
    assert.equal(sender.to(sleeper.chatId).length, 2, "no repeats while the player stays away");
  });
});

test("settings default to on and reject unknown values", { skip: !databaseUrl }, async () => {
  await inTransaction(async (client) => {
    const service = new NotificationService(client, new FakeSender(), BIG_BUDGET);
    const player = await createPlayer(client);
    const settings = await service.getSettings(player.id);
    assert.deepEqual(settings.preferences, { duelReady: true, mail: true, guild: true, announcements: true, winback: true });
    assert.equal(settings.telegramLinked, true);
    const updated = await service.updateSettings(player.id, { preferences: { guild: false } });
    assert.equal(updated.preferences.guild, false);
    assert.equal(updated.preferences.mail, true);
    await assert.rejects(service.updateSettings(player.id, { locale: "fr" as never }));
    await assert.rejects(service.updateSettings(player.id, { preferences: { mail: "yes" as never } }));
  });
});
