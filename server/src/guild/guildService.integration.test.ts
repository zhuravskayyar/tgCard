import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { GUILD_CONFIG } from "@cardastika/shared";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { grantStarterCards } from "../inventory/starterCardGrant.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import { GuildDomainError, GuildService } from "./guildService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

function telegramUser(label: string) {
  sequence += 1n;
  return {
    id: String(BigInt(Date.now()) * 1_000_000n + BigInt(process.pid) * 100n + sequence),
    username: `guild_${label}_${sequence}`,
    firstName: `Guild ${label}`,
    lastName: null,
    photoUrl: null,
  } satisfies ValidatedTelegramUser;
}

test("guild PostgreSQL flow enforces XP idempotency, role boundaries and cooldowns", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const guilds = new GuildService(pool);
  const playerIds: string[] = [];
  let guildId: string | null = null;
  try {
    for (const label of ["leader", "member", "veteran", "applicant"]) {
      const player = await players.findOrCreateFromTelegram(telegramUser(label));
      playerIds.push(player.id);
    }
    await pool.query("UPDATE players SET level = 20, silver = 50000 WHERE id = $1", [playerIds[0]]);
    await pool.query("UPDATE players SET level = 12 WHERE id = ANY($1::uuid[])", [playerIds.slice(1)]);

    const created = await guilds.create(playerIds[0]!, { name: `Тест ${randomUUID().slice(0, 5)}` });
    guildId = created.guild.id;
    assert.equal(created.viewer.member?.role, "leader");
    assert.equal(Number((await pool.query("SELECT silver FROM players WHERE id = $1", [playerIds[0]])).rows[0]?.silver), 40000);

    await guilds.join(playerIds[1]!, guildId);
    const activityClient = await pool.connect();
    try {
      await activityClient.query("BEGIN");
      assert.equal(await guilds.recordActivity(activityClient, playerIds[1]!, "duel_win", "guild-test-0"), 10);
      assert.equal(await guilds.recordActivity(activityClient, playerIds[1]!, "duel_win", "guild-test-0"), 0);
      for (let index = 1; index < 30; index += 1) {
        assert.equal(await guilds.recordActivity(activityClient, playerIds[1]!, "duel_win", `guild-test-${index}`), 10);
      }
      assert.equal(await guilds.recordActivity(activityClient, playerIds[1]!, "duel_loss", "guild-test-cap"), 0);
      await activityClient.query("COMMIT");
    } finally {
      activityClient.release();
    }
    assert.equal((await guilds.getProfile(playerIds[0]!, guildId)).guild.experience, 300);

    await guilds.changeRole(playerIds[0]!, guildId, playerIds[1]!, "officer");
    await guilds.join(playerIds[2]!, guildId);
    await guilds.changeRole(playerIds[0]!, guildId, playerIds[2]!, "veteran");
    await assert.rejects(
      () => guilds.kick(playerIds[1]!, guildId!, playerIds[2]!),
      (error: unknown) => error instanceof GuildDomainError && error.code === "guild_permission_denied",
    );
    await guilds.kick(playerIds[0]!, guildId, playerIds[2]!);
    await assert.rejects(
      () => guilds.join(playerIds[2]!, guildId!),
      (error: unknown) => error instanceof GuildDomainError && error.code === "guild_cooldown",
    );

    await guilds.updateSettings(playerIds[0]!, guildId, { recruitmentMode: "application" });
    const application = await guilds.apply(playerIds[3]!, guildId, "Готовий допомагати ордену");
    assert.equal((await guilds.getProfile(playerIds[0]!, guildId)).applications.length, 1);
    await guilds.decideApplication(playerIds[0]!, guildId, application.viewer.activeApplication!.id, "reject");
    await assert.rejects(
      () => guilds.apply(playerIds[3]!, guildId!, "Повторна заявка"),
      (error: unknown) => error instanceof GuildDomainError && error.code === "guild_cooldown",
    );
  } finally {
    if (guildId) await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    if (playerIds.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await pool.end();
  }
});

test("guild lifecycle: unlock, membership, application states, permissions, transfer and dissolve", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const guilds = new GuildService(pool);
  const ids: string[] = [];
  const guildIds: string[] = [];
  const rejects = (action: () => Promise<unknown>, code: string) => assert.rejects(action, (error: unknown) => error instanceof GuildDomainError && error.code === code);
  try {
    for (const name of ["lifecycle_leader", "applicant", "officer", "locked"]) {
      ids.push((await players.findOrCreateFromTelegram(telegramUser(name))).id);
    }
    const [leader, applicant, officer, locked] = ids as [string, string, string, string];
    await pool.query("UPDATE players SET level = 20, silver = 50000 WHERE id = ANY($1::uuid[])", [ids]);
    await pool.query("UPDATE players SET level = 9 WHERE id = $1", [locked]);
    await rejects(() => guilds.create(locked, { name: "Закрито" }), "guild_unlock_level");
    const created = await guilds.create(leader, { name: `Сцен ${randomUUID().slice(0, 5)}`, recruitmentMode: "application", themeElement: "water" });
    const id = created.guild.id;
    guildIds.push(id);
    assert.equal(created.guild.themeElement, "water");
    assert.equal(created.guild.experience, 0);
    assert.equal((await guilds.mine(leader)).guild?.guild.id, id);
    assert.equal((await guilds.mine(applicant)).guild, null);
    await rejects(() => guilds.apply(locked, id, ""), "guild_unlock_level");
    await rejects(() => guilds.create(leader, { name: "Другий" }), "already_in_guild");

    const pending = await guilds.apply(applicant, id, "Готовий долучитися");
    assert.equal(pending.viewer.member, null, "application must not be interpreted as membership");
    let mine = await guilds.mine(applicant);
    assert.equal(mine.guild, null);
    assert.equal(mine.activeApplication?.id, pending.viewer.activeApplication?.id);
    await rejects(() => guilds.apply(applicant, id, ""), "active_application_exists");
    await rejects(() => guilds.decideApplication(applicant, id, mine.activeApplication!.id, "accept"), "guild_permission_denied");
    await guilds.withdrawApplication(applicant, mine.activeApplication!.id);
    assert.equal((await guilds.mine(applicant)).activeApplication, null);
    assert.equal((await guilds.mine(applicant)).lastApplication, null);

    await guilds.apply(applicant, id, "");
    await pool.query("UPDATE guild_applications SET expires_at = NOW() - INTERVAL '1 second' WHERE player_id = $1 AND status = 'pending'", [applicant]);
    mine = await guilds.mine(applicant);
    assert.equal(mine.activeApplication, null);
    assert.equal(mine.lastApplication?.status, "expired");
    assert.equal(mine.lastApplication?.guildId, id);

    await guilds.apply(applicant, id, "");
    assert.equal((await guilds.mine(applicant)).lastApplication, null, "a new pending request must supersede expired history");
    const rejectionId = (await guilds.mine(applicant)).activeApplication!.id;
    await guilds.decideApplication(leader, id, rejectionId, "reject");
    mine = await guilds.mine(applicant);
    assert.equal(mine.lastApplication?.status, "rejected");
    assert.equal(mine.lastApplication?.guildName, created.guild.name);
    assert.ok(Date.parse(mine.lastApplication!.retryAt!) > Date.now());
    await assert.rejects(() => guilds.apply(applicant, id, ""), (error: unknown) => error instanceof GuildDomainError && error.code === "guild_cooldown" && Boolean(error.retryAt && Date.parse(error.retryAt) > Date.now()));
    await pool.query("UPDATE guild_cooldowns SET available_at = NOW() - INTERVAL '1 second' WHERE player_id = $1", [applicant]);
    await guilds.apply(applicant, id, "");
    await guilds.decideApplication(leader, id, (await guilds.mine(applicant)).activeApplication!.id, "accept");
    mine = await guilds.mine(applicant);
    assert.equal(mine.guild?.viewer.member?.role, "newbie");
    assert.equal(mine.activeApplication, null);
    assert.equal(mine.lastApplication, null);
    await guilds.changeRole(leader, id, applicant, "member");
    assert.equal((await guilds.mine(applicant)).guild?.viewer.member?.role, "member");
    await guilds.changeRole(leader, id, applicant, "veteran");
    assert.equal((await guilds.mine(applicant)).guild?.viewer.member?.role, "veteran");
    await guilds.updateSettings(leader, id, { recruitmentMode: "open" });
    await guilds.join(officer, id);
    await guilds.changeRole(leader, id, officer, "officer");
    const officerView = await guilds.getProfile(officer, id);
    assert.ok(officerView.viewer.permissions.includes("manage_applications"));
    assert.equal(officerView.viewer.permissions.includes("manage_settings"), false);
    await rejects(() => guilds.updateSettings(officer, id, { description: "Denied" }), "guild_permission_denied");
    await rejects(() => guilds.changeRole(officer, id, applicant, "officer"), "guild_permission_denied");
    await guilds.changeRole(officer, id, applicant, "member");
    await rejects(() => guilds.leave(leader, id), "leader_transfer_required");
    await rejects(() => guilds.dissolve(leader, id), "guild_not_empty");
    await guilds.transferLeadership(leader, id, officer);
    assert.equal((await guilds.mine(officer)).guild?.viewer.member?.role, "leader");
    await guilds.leave(leader, id);
    await guilds.leave(applicant, id);
    await rejects(() => guilds.leave(officer, id), "leader_must_dissolve");
    await guilds.dissolve(officer, id);
    assert.equal((await guilds.mine(officer)).guild, null);
    await rejects(() => guilds.getProfile(officer, id), "guild_not_found");
  } finally {
    if (guildIds.length) await pool.query("DELETE FROM guilds WHERE id = ANY($1::uuid[])", [guildIds]);
    if (ids.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});

test("guild directory and entry: empty, full, closed, minimum level and existing membership", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const guilds = new GuildService(pool);
  const ids: string[] = [];
  const guildIds: string[] = [];
  const rejects = (action: () => Promise<unknown>, code: string) => assert.rejects(action, (error: unknown) => error instanceof GuildDomainError && error.code === code);
  try {
    for (let index = 0; index < GUILD_CONFIG.maxMembersByLevel[0]! + 2; index++) ids.push((await players.findOrCreateFromTelegram(telegramUser(`capacity_${index}`))).id);
    await pool.query("UPDATE players SET level = 20, silver = 50000 WHERE id = ANY($1::uuid[])", [ids]);
    const leader = ids[0]!;
    const guest = ids.at(-1)!;
    const outsider = ids.at(-2)!;
    const name = `Міст ${randomUUID().slice(0, 5)}`;
    const created = await guilds.create(leader, { name });
    const id = created.guild.id;
    guildIds.push(id);
    assert.equal((await guilds.list({ name: randomUUID() })).entries.length, 0);
    await guilds.updateSettings(leader, id, { recruitmentMode: "closed" });
    await rejects(() => guilds.join(guest, id), "guild_not_open");
    await rejects(() => guilds.apply(guest, id, ""), "guild_closed");
    await guilds.updateSettings(leader, id, { recruitmentMode: "open", minPlayerLevel: 21 });
    await rejects(() => guilds.join(guest, id), "guild_min_level");
    await guilds.updateSettings(leader, id, { minPlayerLevel: 10 });
    const other = await guilds.create(outsider, { name: `Інш ${randomUUID().slice(0, 5)}` });
    guildIds.push(other.guild.id);
    await rejects(() => guilds.join(outsider, id), "already_in_guild");
    assert.equal((await guilds.getProfile(outsider, id)).viewer.member, null);
    assert.equal((await guilds.mine(outsider)).guild?.guild.id, other.guild.id);
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) SELECT $1, unnest($2::uuid[]), 'newbie'", [id, ids.slice(1, -2)]);
    assert.equal((await guilds.getProfile(guest, id)).guild.isFull, true);
    assert.equal((await guilds.list({ name, hasSpace: true })).entries.length, 0);
    await rejects(() => guilds.join(guest, id), "guild_full");
    await guilds.updateSettings(leader, id, { recruitmentMode: "application" });
    await rejects(() => guilds.apply(guest, id, ""), "guild_full");
  } finally {
    if (guildIds.length) await pool.query("DELETE FROM guilds WHERE id = ANY($1::uuid[])", [guildIds]);
    if (ids.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});

test("Guild Card is leader-owned, visible to members, isolated from the nine-card deck and cleared on transfer", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const guilds = new GuildService(pool);
  const ids: string[] = [];
  let guildId: string | null = null;
  try {
    for (const name of ["card_leader", "card_member", "card_outsider"]) {
      ids.push((await players.findOrCreateFromTelegram(telegramUser(name))).id);
    }
    const [leader, member, outsider] = ids as [string, string, string];
    await pool.query("UPDATE players SET level = 20, silver = 50000 WHERE id = ANY($1::uuid[])", [ids]);
    const cardClient = await pool.connect();
    try {
      await cardClient.query("BEGIN");
      await grantStarterCards(cardClient, leader);
      await grantStarterCards(cardClient, member);
      await grantStarterCards(cardClient, outsider);
      await recalculateAutomaticDeck(cardClient, leader);
      await recalculateAutomaticDeck(cardClient, member);
      await recalculateAutomaticDeck(cardClient, outsider);
      await cardClient.query("COMMIT");
    } finally {
      cardClient.release();
    }

    const created = await guilds.create(leader, { name: `Карт ${randomUUID().slice(0, 5)}` });
    guildId = created.guild.id;
    await guilds.join(member, guildId);
    const leaderCard = (await pool.query<{ id: string }>(
      "SELECT id FROM player_card_instances WHERE player_id = $1 ORDER BY created_at, id LIMIT 1",
      [leader],
    )).rows[0]?.id;
    const memberCard = (await pool.query<{ id: string }>(
      "SELECT id FROM player_card_instances WHERE player_id = $1 ORDER BY created_at, id LIMIT 1",
      [member],
    )).rows[0]?.id;
    assert.ok(leaderCard);
    assert.ok(memberCard);
    assert.equal((await guilds.getProfile(leader, guildId)).guildCard.active, null);
    assert.ok((await guilds.getGuildCardCandidates(leader, guildId)).cards.length >= 9);
    const selected = await guilds.setGuildCard(leader, guildId, leaderCard);
    assert.equal(selected.guildCard.active?.instanceId, leaderCard);
    assert.equal((await guilds.getProfile(member, guildId)).guildCard.active?.instanceId, leaderCard);
    // Re-selecting the same card after the leader upgraded it refreshes the guild copy...
    const selectedLevel = selected.guildCard.active!.level;
    await pool.query("UPDATE player_card_instances SET level = $2 WHERE id = $1", [leaderCard, selectedLevel + 2]);
    assert.equal((await guilds.setGuildCard(leader, guildId, leaderCard)).guildCard.active?.level, selectedLevel + 2);
    // ...but never rolls back progress the guild added on top of it.
    await pool.query("UPDATE guild_cards SET level = $2 WHERE guild_id = $1", [guildId, selectedLevel + 4]);
    assert.equal((await guilds.setGuildCard(leader, guildId, leaderCard)).guildCard.active?.level, selectedLevel + 4);
    await assert.rejects(
      () => guilds.setGuildCard(member, guildId!, memberCard),
      (error: unknown) => error instanceof GuildDomainError && error.code === "guild_permission_denied",
    );
    await assert.rejects(
      () => guilds.setGuildCard(leader, guildId!, memberCard),
      (error: unknown) => error instanceof GuildDomainError && error.code === "guild_card_not_owned",
    );
    assert.equal(Number((await pool.query("SELECT COUNT(*) AS count FROM deck_slots JOIN player_decks ON player_decks.id = deck_slots.deck_id WHERE player_decks.player_id = $1", [leader])).rows[0]?.count), 9);
    await guilds.transferLeadership(leader, guildId, member);
    const afterTransfer = await guilds.getProfile(member, guildId);
    assert.equal(afterTransfer.guildCard.active, null);
    assert.equal(afterTransfer.guildCard.canManage, true);
    await assert.rejects(
      () => guilds.setGuildCard(outsider, guildId!, leaderCard),
      (error: unknown) => error instanceof GuildDomainError && error.code === "guild_permission_denied",
    );
  } finally {
    if (guildId) await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    if (ids.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});

test("leaders raise the Guild Card with treasury gold and a gold level gifts every member a magic source", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const { getUpgradeProgress } = await import("@cardastika/game-core");
  const { GuildTreasuryDomainError } = await import("./treasuryService.js");
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const guilds = new GuildService(pool);
  const ids: string[] = [];
  let guildId: string | null = null;
  const SOURCES = ["el_air", "el_earth", "el_fire", "el_water"];
  try {
    for (const name of ["lvl_leader", "lvl_member"]) ids.push((await players.findOrCreateFromTelegram(telegramUser(name))).id);
    const [leader, member] = ids as [string, string];
    await pool.query("UPDATE players SET level = 20, silver = 50000 WHERE id = ANY($1::uuid[])", [ids]);
    const cardClient = await pool.connect();
    try {
      await cardClient.query("BEGIN");
      for (const id of ids) {
        await grantStarterCards(cardClient, id);
        await recalculateAutomaticDeck(cardClient, id);
      }
      await cardClient.query("COMMIT");
    } finally {
      cardClient.release();
    }
    guildId = (await guilds.create(leader, { name: `Рів ${randomUUID().slice(0, 5)}` })).guild.id;
    await guilds.join(member, guildId);
    const leaderCard = (await guilds.getGuildCardCandidates(leader, guildId)).cards[0]!.instanceId;
    await guilds.setGuildCard(leader, guildId, leaderCard);
    // Level 9 with a full level: the next level, 10, is a gold level paid partly from the treasury.
    await pool.query(
      "UPDATE guild_cards SET level = 9, level_progress_elements = $2, stored_elements = 0 WHERE guild_id = $1",
      [guildId, getUpgradeProgress(0, 9).requiredElements],
    );
    await pool.query(
      "INSERT INTO guild_treasuries (guild_id, gold) VALUES ($1, 1000000) ON CONFLICT (guild_id) DO UPDATE SET gold = 1000000",
      [guildId],
    );

    const before = (await guilds.getProfile(member, guildId)).guildCard;
    assert.equal(before.canLevelUp, false);
    assert.equal(before.progression?.targetLevel, 10);
    assert.equal(before.progression?.isGoldLevel, true);
    assert.equal(before.progression?.availability, "ready");
    const price = before.progression!.requiredGold!;
    assert.ok(price > 0);
    await assert.rejects(
      () => guilds.levelUpGuildCard(member, guildId!),
      (error: unknown) => error instanceof GuildTreasuryDomainError && error.code === "guild_card_level_forbidden",
    );
    assert.equal((await guilds.getProfile(leader, guildId)).guildCard.canLevelUp, true);

    const raised = await guilds.levelUpGuildCard(leader, guildId);
    assert.equal(raised.guildCard.active?.level, 10);
    assert.equal(raised.treasury.balance.gold, 1000000 - price);
    for (const id of ids) {
      const sources = await pool.query<{ level: number }>(
        "SELECT level FROM player_card_instances WHERE player_id = $1 AND card_id = ANY($2::text[])",
        [id, SOURCES],
      );
      assert.deepEqual(sources.rows.map(({ level }) => level), [10], "every member gets one source of the new level");
    }
    const journal = await pool.query<{ amount: number }>(
      "SELECT amount FROM guild_activity_log WHERE guild_id = $1 AND event_type = 'guild_card_upgraded'",
      [guildId],
    );
    assert.deepEqual(journal.rows.map(({ amount }) => Number(amount)), [10]);

    // An empty treasury cannot pay the next (ordinary) level, and nobody gets a source.
    await pool.query("UPDATE guild_treasuries SET gold = 0 WHERE guild_id = $1", [guildId]);
    await assert.rejects(
      () => guilds.levelUpGuildCard(leader, guildId!),
      (error: unknown) => error instanceof GuildTreasuryDomainError && error.code === "guild_card_insufficient_treasury_gold",
    );
    const total = await pool.query("SELECT 1 FROM player_card_instances WHERE player_id = ANY($1::uuid[]) AND card_id = ANY($2::text[])", [ids, SOURCES]);
    assert.equal(total.rows.length, 2);
  } finally {
    if (guildId) await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    if (ids.length) await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});
