import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { recalculateAutomaticDeckForPlayer } from "../decks/automaticDeckService.js";
import { GuildDragonRaidDomainError, GuildDragonRaidService } from "./dragonRaidService.js";
import { GuildService } from "./guildService.js";
import { MailService } from "../mail/mailService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function telegramUser() {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence + 500n),
    username: `dragons_test_${sequence}`,
    firstName: "Dragons test",
    lastName: null,
    photoUrl: null,
  } satisfies ValidatedTelegramUser;
}

async function setup(pool: Pool, count: number, roles: string[]) {
  const players = new PlayerRepository(pool);
  const testPlayers = await Promise.all(Array.from({ length: count }, () => players.findOrCreateFromTelegram(telegramUser())));
  const guildId = randomUUID();
  await pool.query("INSERT INTO guilds (id, name, name_key, created_by, level) VALUES ($1, 'Dragons', $2, $3, 5)", [guildId, `dragons_${guildId}`, testPlayers[0]!.id]);
  await pool.query("INSERT INTO guild_treasuries (guild_id, gold, silver) VALUES ($1, 5000, 10000000) ON CONFLICT (guild_id) DO UPDATE SET gold = 5000, silver = 10000000", [guildId]);
  for (const [index, player] of testPlayers.entries()) {
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, $3)", [guildId, player.id, roles[index] ?? "member"]);
    await pool.query("UPDATE player_card_instances SET level = 60 WHERE player_id = $1", [player.id]);
    await recalculateAutomaticDeckForPlayer(pool, player.id);
  }
  return { guildId, testPlayers };
}

test("eight lairs; only one enrollment at a time; neophytes cannot start", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { guildId, testPlayers } = await setup(pool, 2, ["member", "newbie"]);
  try {
    const dragons = new GuildDragonRaidService(pool);
    const list = await dragons.listLairs(guildId, testPlayers[0]!.id);
    assert.equal(list.lairs.length, 8);
    assert.deepEqual(list.lairs.map((lair) => lair.health), [300_000, 300_000, 300_000, 300_000, 500_000, 500_000, 500_000, 500_000]);
    assert.ok(list.lairs.every((lair) => lair.lairLevel === 1 && lair.respawnHours === 164));
    assert.equal(list.canUpgrade, false);

    await dragons.enroll(testPlayers[0]!.id, guildId, "fire");
    await assert.rejects(dragons.enroll(testPlayers[0]!.id, guildId, "black"), (error: unknown) => error instanceof GuildDragonRaidDomainError && error.code === "raid_other_enrollment");
    const view = await dragons.enroll(testPlayers[1]!.id, guildId, "fire");
    assert.equal(view.enrollment.canStart, false, "«Учасник» and «Новачок» cannot open a dragon raid");
    await assert.rejects(dragons.start(testPlayers[0]!.id, guildId, "fire"), (error: unknown) => error instanceof GuildDragonRaidDomainError && error.code === "raid_not_leader");
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});

test("victory: slayer points, the top total gets the dragon card and keeps half, everyone waits for the respawn", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { guildId, testPlayers } = await setup(pool, 2, ["leader", "member"]);
  const [leader, member] = testPlayers as [typeof testPlayers[number], typeof testPlayers[number]];
  try {
    const dragons = new GuildDragonRaidService(pool, () => 0.5, Date.now, new GuildService(pool));
    const xpBefore = await pool.query<{ id: string; level: number; account_xp: string }>("SELECT id, level, account_xp FROM players WHERE id = ANY($1::uuid[])", [[leader.id, member.id]]);
    await dragons.enroll(leader.id, guildId, "fire");
    await dragons.enroll(member.id, guildId, "fire");
    let view = await dragons.start(leader.id, guildId, "fire");
    assert.equal(view.lair.status, "active");
    view = await dragons.startBattle(leader.id, guildId, "fire");
    const memberView = await dragons.startBattle(member.id, guildId, "fire");
    assert.equal(view.battle?.dragonActiveCards.length, 3);
    assert.ok(view.battle!.dragonActiveCards.every((card) => card.finalPower >= 2700 && card.finalPower <= 3300 && card.level === 59));

    // Reference example: 400 000 points before, the member already dealt 250 000.
    await pool.query("INSERT INTO guild_dragon_slayer_points (guild_id, player_id, points) VALUES ($1, $2, 400000)", [guildId, leader.id]);
    const raidId = (await pool.query<{ id: string }>("SELECT id FROM guild_dragon_raids WHERE guild_id = $1 AND lair_code = 'fire'", [guildId])).rows[0]!.id;
    await pool.query("UPDATE guild_dragon_raid_participants SET damage_total = CASE player_id WHEN $2 THEN 200000 ELSE 250000 END WHERE raid_id = $1", [raidId, leader.id]);
    await pool.query("UPDATE guild_dragon_raids SET current_health = 1 WHERE id = $1", [raidId]);

    view = await dragons.action(leader.id, guildId, "fire", view.battle!.battleId, { expectedVersion: view.battle!.version, slotIndex: 0 });
    assert.equal(view.lair.status, "open");
    assert.equal(view.lair.currentHealth, 300_000);
    assert.equal(view.lastResult?.outcome, "won");
    assert.equal(view.lastResult?.winner?.playerId, leader.id);
    assert.equal(view.lastResult?.winner?.card.level, 59);
    assert.equal(view.lair.defeatedCount, 1);
    assert.ok(view.lair.viewerAvailableAt, "the dragon respawns for the winner");

    const points = await pool.query<{ player_id: string; points: string }>("SELECT player_id, points FROM guild_dragon_slayer_points WHERE guild_id = $1", [guildId]);
    const byPlayer = new Map(points.rows.map((row) => [row.player_id, Number(row.points)]));
    assert.ok(byPlayer.get(leader.id)! >= 300_000 && byPlayer.get(leader.id)! < 310_000);
    assert.equal(byPlayer.get(member.id), 250_000);
    await assert.rejects(dragons.enroll(member.id, guildId, "fire"), (error: unknown) => error instanceof GuildDragonRaidDomainError && error.code === "raid_respawning");
    assert.ok(memberView.battle);

    const mail = await pool.query<{ card_id: string; card_level: number }>("SELECT card_id, card_level FROM player_mail WHERE id = $1", [view.lastResult!.winner!.mailId]);
    assert.deepEqual(mail.rows[0], { card_id: "fire_dragon", card_level: 59 });
    // Victory XP: the damage dealt (reference), and the same XP goes to the guild.
    const xpAfter = await pool.query<{ id: string; level: number; account_xp: string }>("SELECT id, level, account_xp FROM players WHERE id = ANY($1::uuid[])", [[leader.id, member.id]]);
    const before = new Map(xpBefore.rows.map((row) => [row.id, row]));
    for (const row of xpAfter.rows) {
      const old = before.get(row.id)!;
      assert.ok(row.level > old.level || Number(row.account_xp) > Number(old.account_xp), "every participant gains XP");
    }
    assert.equal(view.lastResult?.participants.find((entry) => entry.playerId === member.id)?.xp, 250_000);
    const guildXp = await pool.query<{ count: string }>("SELECT COUNT(*) FROM guild_xp_contributions WHERE guild_id = $1 AND activity_type = 'dragon_raid'", [guildId]);
    assert.equal(Number(guildXp.rows[0]?.count), 2);
    const hunts = await pool.query<{ count: string }>("SELECT COUNT(*) FROM player_campaign_events WHERE player_id = ANY($1::uuid[]) AND event_type = 'DRAGON_RAID_WON'", [[leader.id, member.id]]);
    assert.equal(Number(hunts.rows[0]?.count), 2);

    // Leaving the guild clears the slayer points earned there.
    await new GuildService(pool).leave(member.id, guildId);
    const left = await pool.query("SELECT 1 FROM guild_dragon_slayer_points WHERE guild_id = $1 AND player_id = $2", [guildId, member.id]);
    assert.equal(left.rows.length, 0);
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});

test("breath is split between the living; when everyone falls the raid is lost without respawn", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { guildId, testPlayers } = await setup(pool, 2, ["leader", "officer"]);
  let now = Date.now();
  try {
    const dragons = new GuildDragonRaidService(pool, () => 0.5, () => now);
    await dragons.enroll(testPlayers[0]!.id, guildId, "black");
    await dragons.enroll(testPlayers[1]!.id, guildId, "black");
    await dragons.start(testPlayers[0]!.id, guildId, "black");
    await dragons.startBattle(testPlayers[0]!.id, guildId, "black");
    const second = await dragons.startBattle(testPlayers[1]!.id, guildId, "black");
    const startHp = second.battle!.playerHp;
    const raidId = (await pool.query<{ id: string }>("SELECT id FROM guild_dragon_raids WHERE guild_id = $1 AND lair_code = 'black'", [guildId])).rows[0]!.id;
    await pool.query("UPDATE guild_dragon_raids SET last_breath_at = to_timestamp($2 / 1000.0) WHERE id = $1", [raidId, now]);

    now += 30_000;
    let view = await dragons.getRaid(guildId, "black", testPlayers[1]!.id);
    assert.equal(view.battle!.playerHp, startHp - 10_000, "rare breath 20 000 split between two");
    assert.equal(view.battle!.battleLog[0]?.kind, "breath");

    await pool.query("UPDATE guild_dragon_raid_battles SET player_hp = 1 WHERE raid_id = $1", [raidId]);
    now += 30_000;
    view = await dragons.getRaid(guildId, "black", testPlayers[0]!.id);
    assert.equal(view.lair.status, "open");
    assert.equal(view.lastResult?.outcome, "lost");
    assert.equal(view.lair.viewerAvailableAt, null, "after a defeat the dragon can be attacked again at once");
    assert.equal(view.participants.length, 0);
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});

test("lair upgrades: leader or officer, treasury pays, never above the guild level", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { guildId, testPlayers } = await setup(pool, 2, ["leader", "veteran"]);
  try {
    const dragons = new GuildDragonRaidService(pool);
    await assert.rejects(dragons.upgradeLair(testPlayers[1]!.id, guildId, "sea"), (error: unknown) => error instanceof GuildDragonRaidDomainError && error.code === "lair_upgrade_forbidden");
    for (let level = 2; level <= 5; level += 1) await dragons.upgradeLair(testPlayers[0]!.id, guildId, "sea");
    const list = await dragons.listLairs(guildId, testPlayers[0]!.id);
    const sea = list.lairs.find((lair) => lair.code === "sea")!;
    assert.equal(sea.lairLevel, 5);
    assert.equal(sea.respawnHours, 4 * 24 + 20);
    assert.deepEqual(list.treasury, { gold: 3000, silver: 1_000_000 });
    assert.equal(sea.nextUpgrade?.allowed, false, "guild level 5 caps the lair");
    await assert.rejects(dragons.upgradeLair(testPlayers[0]!.id, guildId, "sea"), (error: unknown) => error instanceof GuildDragonRaidDomainError && error.code === "lair_upgrade_unavailable");
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});

test("the dragon card mail is claimable for an ancient and the Leviathan lair; an idle signee can leave an active raid", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { guildId, testPlayers } = await setup(pool, 2, ["leader", "member"]);
  const [leader, idle] = testPlayers as [typeof testPlayers[number], typeof testPlayers[number]];
  try {
    const dragons = new GuildDragonRaidService(pool, () => 0.5);
    const mail = new MailService(pool);
    for (const lair of ["fire", "leviathan"]) {
      await pool.query("DELETE FROM player_dragon_respawns WHERE player_id = $1", [leader.id]);
      await dragons.enroll(leader.id, guildId, lair);
      if (lair === "fire") await dragons.enroll(idle.id, guildId, lair);
      await dragons.start(leader.id, guildId, lair);
      if (lair === "fire") {
        // A signee who never started a battle may leave; the raid goes on.
        const left = await dragons.leave(idle.id, guildId, lair);
        assert.equal(left.lair.status, "active");
        assert.equal(left.enrollment.enrolled, false);
      }
      let view = await dragons.startBattle(leader.id, guildId, lair);
      const raidId = (await pool.query<{ id: string }>("SELECT id FROM guild_dragon_raids WHERE guild_id = $1 AND lair_code = $2", [guildId, lair])).rows[0]!.id;
      await pool.query("UPDATE guild_dragon_raids SET current_health = 1 WHERE id = $1", [raidId]);
      view = await dragons.action(leader.id, guildId, lair, view.battle!.battleId, { expectedVersion: view.battle!.version, slotIndex: 0 });
      assert.equal(view.battle?.status, "won", "the finished battle stays visible for the last strike");
      assert.equal(view.lair.status, "open");
      const winner = view.lastResult!.winner!;
      const claim = await mail.claim(leader.id, winner.mailId!);
      assert.equal(claim.claimed, true);
      const card = await pool.query<{ level: number; bonus_power: number }>(
        "SELECT level, bonus_power FROM player_card_instances WHERE player_id = $1 AND card_id = $2 ORDER BY created_at DESC LIMIT 1",
        [leader.id, winner.card.cardId],
      );
      assert.equal(card.rows[0]?.level, 59);
      assert.ok(card.rows[0]!.bonus_power >= 0 && card.rows[0]!.bonus_power <= 536);
    }
    const profile = await new GuildService(pool).getProfile(leader.id, guildId);
    assert.ok(profile.guild.id === guildId);
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});

test("the dragon hunter title (1000 dragons) gives +10% to cards and HP in raids", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const { guildId, testPlayers } = await setup(pool, 2, ["leader", "officer"]);
  const [hunter, plain] = testPlayers as [typeof testPlayers[number], typeof testPlayers[number]];
  try {
    // Same deck for both players, so only the title can make a difference.
    await pool.query("UPDATE player_card_instances SET level = 60, bonus_power = 0 WHERE player_id = ANY($1::uuid[])", [[hunter.id, plain.id]]);
    await recalculateAutomaticDeckForPlayer(pool, hunter.id);
    await recalculateAutomaticDeckForPlayer(pool, plain.id);
    await pool.query(
      "INSERT INTO player_campaign_events (player_id, event_type, payload) SELECT $1, 'DRAGON_RAID_WON', '{}'::jsonb FROM generate_series(1, 1000)",
      [hunter.id],
    );
    const dragons = new GuildDragonRaidService(pool, () => 0.5);
    await dragons.enroll(hunter.id, guildId, "fire");
    await dragons.enroll(plain.id, guildId, "fire");
    await dragons.start(hunter.id, guildId, "fire");
    const hunterView = await dragons.startBattle(hunter.id, guildId, "fire");
    const plainView = await dragons.startBattle(plain.id, guildId, "fire");
    const hunterHp = hunterView.battle!.playerMaxHp;
    const plainHp = plainView.battle!.playerMaxHp;
    assert.ok(Math.abs(hunterHp - Math.round(plainHp * 1.1)) <= 2, `hunter HP ${hunterHp} vs plain ${plainHp}`);
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});
