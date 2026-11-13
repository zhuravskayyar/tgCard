import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { STARTER_CARDS } from "../inventory/starterCards.js";
import { GuildAltarDomainError, GuildAltarService } from "./altarService.js";
import { GuildRaidDomainError, GuildRaidService } from "./guildRaidService.js";
import { RaidCardService, RaidCardUnavailableError } from "./raidCardService.js";
import { recalculateAutomaticDeckForPlayer } from "../decks/automaticDeckService.js";
import { MailService } from "../mail/mailService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;
const WITCH_CARDS = ["sorceress_air", "sorceress_earth", "sorceress_fire", "sorceress_water"];

function telegramUser() {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: `witches_test_${sequence}`,
    firstName: "Witches test",
    lastName: null,
    photoUrl: null,
  } satisfies ValidatedTelegramUser;
}

async function createGuild(pool: Pool, ownerId: string, level: number) {
  const guildId = randomUUID();
  await pool.query("INSERT INTO guilds (id, name, name_key, created_by, level) VALUES ($1, 'Raid test', $2, $3, $4)", [guildId, `raid_test_${guildId}`, ownerId, level]);
  await pool.query("INSERT INTO guild_treasuries (guild_id) VALUES ($1) ON CONFLICT DO NOTHING", [guildId]);
  return guildId;
}

test("witch bosses come from «Чотири чаклунки»; raids and the altar open at guild level 34", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram(telegramUser());
  const lowGuild = await createGuild(pool, player.id, 33);
  const guildId = await createGuild(pool, player.id, 34);
  try {
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'leader')", [lowGuild, player.id]);
    const raids = new GuildRaidService(pool);
    const locked = await raids.getActiveRaid(lowGuild, player.id);
    assert.equal(locked.unlocked, false);
    assert.equal(locked.unlockLevel, 34);
    await assert.rejects(raids.enroll(player.id, lowGuild), (error: unknown) => error instanceof GuildRaidDomainError && error.code === "raid_locked");
    await pool.query("DELETE FROM guild_members WHERE guild_id = $1", [lowGuild]);

    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'leader')", [guildId, player.id]);
    await pool.query("UPDATE players SET gold = 100000, silver = 1000000 WHERE id = $1", [player.id]);
    const raid = await raids.getActiveRaid(guildId, player.id);
    assert.equal(raid.unlocked, true);
    assert.equal(raid.level, 1);
    assert.equal(raid.bosses.length, 2);
    assert.ok(raid.bosses.every(({ cardId, health }) => health === 450_000 && WITCH_CARDS.includes(cardId)));
    assert.notEqual(raid.bosses[0]!.cardId, raid.bosses[1]!.cardId);

    const altar = new GuildAltarService(pool);
    await assert.rejects(altar.purchase(player.id, guildId, "gold"), (error: unknown) => error instanceof GuildAltarDomainError && error.code === "altar_empty");
    // Last week the guild beat level-7 witches: potions give +7% (gold, 14) and +3.5% (silver, 7000).
    await pool.query(
      `INSERT INTO guild_witch_raid_results (id, raid_id, raid_level, week_key, participant_count, total_damage)
       VALUES ($1, $2, 7, (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date, 1, 1)`,
      [randomUUID(), raid.id],
    );
    const gold = await altar.purchase(player.id, guildId, "gold");
    assert.equal(gold.altar.currentLevel, 7);
    assert.equal(gold.totalIncrease, 7);
    assert.deepEqual(gold.updatedBalance, { gold: 100000 - 14, silver: 1000000 });
    await assert.rejects(altar.purchase(player.id, guildId, "gold"), (error: unknown) => error instanceof GuildAltarDomainError && error.code === "altar_already_bought");
    const silver = await altar.purchase(player.id, guildId, "silver");
    assert.equal(silver.totalIncrease, 3.5);
    assert.equal(silver.altar.active?.hpPct, 10.5);

    const cards = new RaidCardService(pool);
    const reward = await cards.grantCard(player.id, STARTER_CARDS[0]!.id, 10);
    assert.equal(reward.reward.cardId, STARTER_CARDS[0]!.id);
    await assert.rejects(cards.grantCard(player.id, "witches_01", 10), RaidCardUnavailableError);
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = ANY($1::uuid[])", [[guildId, lowGuild]]);
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("a witch battle: fixed unique card power, shared heals, card swap for 10 gold", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const raids = new GuildRaidService(pool, () => 0.999999);
  const player = await players.findOrCreateFromTelegram(telegramUser());
  const guildId = await createGuild(pool, player.id, 34);

  try {
    // The raid leader is the highest-ranked enrolled player, not only the guild leader.
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'officer')", [guildId, player.id]);
    await pool.query("UPDATE player_card_instances SET level = 60 WHERE player_id = $1", [player.id]);
    await pool.query("UPDATE players SET gold = 25 WHERE id = $1", [player.id]);
    await recalculateAutomaticDeckForPlayer(pool, player.id);

    let view = await raids.enroll(player.id, guildId);
    assert.equal(view.enrollment.canStart, true);
    view = await raids.startRaid(player.id, guildId);
    view = await raids.startBattle(player.id, guildId);
    const battle = view.battle!;
    const deckRows = await pool.query<{ witch_deck: Array<{ finalPower: number; source?: string }> }>(
      "SELECT witch_deck FROM guild_witch_raid_bosses WHERE raid_id = $1 ORDER BY slot",
      [view.id],
    );
    for (const row of deckRows.rows) {
      assert.equal(row.witch_deck.length, 10);
      assert.equal(row.witch_deck[9]?.source, "guild");
      assert.equal(row.witch_deck[9]?.finalPower, 7500);
      assert.ok(Math.abs(row.witch_deck.reduce((sum, card) => sum + card.finalPower, 0) - 45_000) <= 500);
    }

    const swapped = await raids.swapCards(player.id, guildId, battle.battleId, { expectedVersion: battle.version });
    assert.equal(swapped.battle?.cardChanges, 1);
    assert.equal((await pool.query<{ gold: string }>("SELECT gold FROM players WHERE id = $1", [player.id])).rows[0]?.gold, "15");

    // Witch 1 drops below 75%: she heals up to witch 2 once for the whole raid.
    await pool.query("UPDATE guild_witch_raid_bosses SET current_health = CASE slot WHEN 1 THEN 337600 ELSE 400000 END WHERE raid_id = $1", [view.id]);
    view = await raids.action(player.id, guildId, battle.battleId, { bossSlot: 1, expectedVersion: swapped.battle!.version, slotIndex: 0 });
    assert.equal(view.bosses[0]!.currentHealth, 400_000);
    const thresholds = await pool.query<{ heal_thresholds: string[] }>("SELECT heal_thresholds FROM guild_witch_raids WHERE id = $1", [view.id]);
    assert.deepEqual(thresholds.rows[0]?.heal_thresholds, ["1:0.75"]);
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("a defeated pair gives one random participant the treasure; digging blocks battles and pays into the mail", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const raids = new GuildRaidService(pool, () => 0.999999);
  const mail = new MailService(pool);
  const testPlayers = await Promise.all(Array.from({ length: 3 }, () => players.findOrCreateFromTelegram(telegramUser())));
  const playerIds = testPlayers.map((player) => player.id);
  const guildId = await createGuild(pool, testPlayers[0]!.id, 34);

  try {
    for (const [index, player] of testPlayers.entries()) {
      await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, $3)", [guildId, player.id, index === 0 ? "leader" : "member"]);
      await pool.query("UPDATE player_card_instances SET level = 60 WHERE player_id = $1", [player.id]);
      await recalculateAutomaticDeckForPlayer(pool, player.id);
    }
    let view = await raids.getActiveRaid(guildId, testPlayers[0]!.id);
    for (const player of testPlayers) view = await raids.enroll(player.id, guildId);
    view = await raids.startRaid(testPlayers[0]!.id, guildId);
    view = await raids.startBattle(testPlayers[0]!.id, guildId);
    await pool.query("UPDATE guild_witch_raid_bosses SET current_health = 5 WHERE raid_id = $1", [view.id]);
    const battle = view.battle!;
    view = await raids.action(testPlayers[0]!.id, guildId, battle.battleId, { bossSlot: 1, expectedVersion: battle.version, slotIndex: 0 });
    view = await raids.action(testPlayers[0]!.id, guildId, battle.battleId, { bossSlot: 2, expectedVersion: view.battle!.version, slotIndex: 0 });

    assert.equal(view.status, "open");
    assert.equal(view.level, 2);
    assert.equal(view.lastResult?.participantCount, 3);
    assert.ok(view.lastResult?.participants.every((participant) => !participant.reward));
    // random() → 0.999999 picks the last participant in the damage table.
    const lucky = view.lastResult!.treasurePlayer!;
    assert.equal(lucky.playerId, view.lastResult!.participants[2]!.playerId);

    const offer = (await raids.getActiveRaid(guildId, lucky.playerId)).treasure!;
    assert.equal(offer.status, "offered");
    assert.equal(offer.level, 1);
    assert.equal(offer.digMinutes, 60);
    const digging = await raids.treasureDecision(lucky.playerId, guildId, offer.id, true);
    assert.equal(digging.treasure?.status, "digging");
    await assert.rejects(raids.enroll(lucky.playerId, guildId), (error: unknown) => error instanceof GuildRaidDomainError && error.code === "raid_treasure_digging");

    await pool.query("UPDATE guild_witch_treasures SET dig_ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [offer.id]);
    const done = (await raids.getActiveRaid(guildId, lucky.playerId)).treasure!;
    assert.equal(done.status, "claimed");
    assert.equal(done.reward?.kind, "card");
    assert.ok(done.mailId);
    const message = await pool.query<{ card_level: number; card_bonus_power: number; card_id: string }>("SELECT card_level, card_bonus_power, card_id FROM player_mail WHERE id = $1", [done.mailId]);
    assert.deepEqual({ level: message.rows[0]?.card_level, bonus: message.rows[0]?.card_bonus_power }, { level: 81, bonus: 1820 });
    assert.ok(WITCH_CARDS.includes(message.rows[0]!.card_id));
    await mail.claim(lucky.playerId, done.mailId!);
    const card = await pool.query<{ level: number; bonus_power: number }>(
      "SELECT level, bonus_power FROM player_card_instances WHERE player_id = $1 AND card_id = $2 ORDER BY created_at DESC LIMIT 1",
      [lucky.playerId, message.rows[0]!.card_id],
    );
    assert.deepEqual(card.rows[0], { level: 81, bonus_power: 1820 });
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await pool.end();
  }
});

test("a fall is final for the attempt; when everyone falls the level restarts at full health", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const raids = new GuildRaidService(pool, () => 0.999999);
  const testPlayers = await Promise.all([telegramUser(), telegramUser()].map((user) => players.findOrCreateFromTelegram(user)));
  const guildId = await createGuild(pool, testPlayers[0]!.id, 34);
  try {
    for (const [index, player] of testPlayers.entries()) {
      await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, $3)", [guildId, player.id, index === 0 ? "leader" : "member"]);
      await pool.query("UPDATE player_card_instances SET level = 60 WHERE player_id = $1", [player.id]);
      await recalculateAutomaticDeckForPlayer(pool, player.id);
    }
    await raids.enroll(testPlayers[0]!.id, guildId);
    await raids.enroll(testPlayers[1]!.id, guildId);
    await raids.startRaid(testPlayers[0]!.id, guildId);
    let first = await raids.startBattle(testPlayers[0]!.id, guildId);
    const second = await raids.startBattle(testPlayers[1]!.id, guildId);
    await pool.query("UPDATE guild_witch_raid_bosses SET current_health = 300000 WHERE raid_id = $1", [first.id]);

    // The first player falls: no personal retry while the other one still fights.
    await pool.query("UPDATE guild_witch_raid_battles SET player_hp = 1 WHERE id = $1", [first.battle!.battleId]);
    first = await raids.action(testPlayers[0]!.id, guildId, first.battle!.battleId, { bossSlot: 1, expectedVersion: first.battle!.version, slotIndex: 0 });
    assert.equal(first.battle?.status, "lost");
    assert.equal(first.status, "active");
    await assert.rejects(raids.startBattle(testPlayers[0]!.id, guildId), (error: unknown) => error instanceof GuildRaidDomainError && error.code === "raid_battle_finished");

    // The second one falls too: the attempt is lost and the same level restarts.
    await pool.query("UPDATE guild_witch_raid_battles SET player_hp = 1 WHERE id = $1", [second.battle!.battleId]);
    const lost = await raids.action(testPlayers[1]!.id, guildId, second.battle!.battleId, { bossSlot: 1, expectedVersion: second.battle!.version, slotIndex: 0 });
    assert.equal(lost.status, "open");
    assert.equal(lost.level, 1);
    assert.ok(lost.bosses.every((boss) => boss.currentHealth === boss.health));
    assert.equal(lost.enrollment.participantCount, 2);
    assert.ok(lost.damageLeaderboard.every((row) => row.damage === 0));
    const decks = await pool.query<{ count: number }>("SELECT jsonb_array_length(witch_deck) AS count FROM guild_witch_raid_bosses WHERE raid_id = $1", [lost.id]);
    assert.ok(decks.rows.every((row) => row.count === 0), "witch decks are dealt anew for the next attempt");
    const reopened = await raids.startRaid(testPlayers[0]!.id, guildId);
    assert.equal(reopened.status, "active");
    const again = await raids.startBattle(testPlayers[0]!.id, guildId);
    assert.equal(again.battle?.status, "active");
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});
