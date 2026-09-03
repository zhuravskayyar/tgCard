import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import type { ValidatedTelegramUser } from "../auth/telegramInitData.js";
import { PlayerRepository } from "../users/playerRepository.js";
import { hasCompletedCollection, recordCardDiscovery } from "../collections/discoveryService.js";
import { COLLECTION_CARDS } from "../collections/collectionCatalog.js";
import { GuildAltarService } from "./altarService.js";
import { GuildRaidDomainError, GuildRaidService } from "./guildRaidService.js";
import { RaidCardService } from "./raidCardService.js";
import { recalculateAutomaticDeckForPlayer } from "../decks/automaticDeckService.js";
import { MailService } from "../mail/mailService.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
let sequence = 0n;

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

test("Witches collection gates the gold altar bonus and raid rewards stay isolated", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const altar = new GuildAltarService(pool);
  const guildRaids = new GuildRaidService(pool);
  const raids = new RaidCardService(pool);
  const player = await players.findOrCreateFromTelegram(telegramUser());
  const guildId = randomUUID();
  const witchCards = COLLECTION_CARDS.filter(({ collectionId }) => collectionId === "collection_witches");
  assert.equal(witchCards.length, 4);

  try {
    await pool.query(
      `INSERT INTO guilds (id, name, name_key, created_by) VALUES ($1, $2, $3, $4)`,
      [guildId, "Рейд тест", `witches_test_${guildId}`, player.id],
    );
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'leader')", [guildId, player.id]);
    await pool.query("UPDATE players SET altar_level = 10, gold = 100000, silver = 100000 WHERE id = $1", [player.id]);

    const raid = await guildRaids.getActiveRaid(guildId);
    assert.equal(raid.level, 1);
    assert.equal(raid.status, "open");
    assert.equal(raid.bosses.length, 2);
    assert.ok(raid.bosses.every((boss) => boss.health === 450_000));
    assert.equal(new Set(raid.bosses.map((boss) => boss.cardId)).size, 2);
    assert.ok(raid.bosses.every((boss) => witchCards.some((card) => card.id === boss.cardId)));
    const sameRaid = await guildRaids.getActiveRaid(guildId);
    assert.equal(sameRaid.id, raid.id, "a guild must keep one persisted raid");
    assert.deepEqual(sameRaid.bosses.map((boss) => boss.cardId), raid.bosses.map((boss) => boss.cardId));

    let result = await altar.purchase(player.id, guildId, "gold");
    assert.deepEqual(
      { previousLevel: result.previousLevel, baseIncrease: result.baseIncrease, collectionBonus: result.collectionBonus, newLevel: result.newLevel, totalIncrease: result.totalIncrease },
      { previousLevel: 10, baseIncrease: 1, collectionBonus: 0, newLevel: 11, totalIncrease: 1 },
      "ordinary gold altar upgrades must remain unchanged",
    );

    const discoveryClient = await pool.connect();
    try {
      for (const card of witchCards.slice(0, 3)) await recordCardDiscovery(discoveryClient, player.id, card.id);
    } finally {
      discoveryClient.release();
    }
    assert.equal(await hasCompletedCollection(pool, player.id, "collection_witches"), false);

    await pool.query("UPDATE players SET altar_level = 10, gold = 100000 WHERE id = $1", [player.id]);
    result = await altar.purchase(player.id, guildId, "gold");
    assert.equal(result.collectionBonus, 0, "3/4 cards must not activate the bonus");
    assert.equal(result.newLevel, 11);

    const raidReward = await raids.grantCard(player.id, witchCards[3]!.id, 10);
    assert.equal(raidReward.reward.cardId, witchCards[3]!.id);
    assert.equal(raidReward.reward.collectionId, "collection_witches");
    assert.equal(raidReward.newDiscovery, true);
    assert.equal(raidReward.collectionCompleted?.id, "collection_witches");
    assert.equal(await hasCompletedCollection(pool, player.id, "collection_witches"), true);

    const duplicate = await raids.grantCard(player.id, witchCards[3]!.id, 10);
    assert.equal(duplicate.newDiscovery, false, "duplicate raid cards must keep discovery idempotent");
    assert.equal((await pool.query("SELECT COUNT(*) FROM player_card_instances WHERE player_id = $1 AND card_id = $2", [player.id, witchCards[3]!.id])).rows[0]?.count, "2");

    await pool.query("UPDATE players SET altar_level = 10, gold = 100000 WHERE id = $1", [player.id]);
    result = await altar.purchase(player.id, guildId, "gold");
    assert.deepEqual(
      { baseIncrease: result.baseIncrease, collectionBonus: result.collectionBonus, newLevel: result.newLevel, totalIncrease: result.totalIncrease },
      { baseIncrease: 1, collectionBonus: 2, newLevel: 13, totalIncrease: 3 },
      "a complete Witch collection adds exactly two levels to gold purchases",
    );

    await pool.query("UPDATE players SET altar_level = 10, silver = 100000 WHERE id = $1", [player.id]);
    result = await altar.purchase(player.id, guildId, "silver");
    assert.equal(result.collectionBonus, 0, "the Witch bonus must not apply to silver purchases");
    assert.equal(result.newLevel, 11);

    const sourceCounts = await pool.query<{ raid_not_in_shop: string; raid_shop_eligible: string }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE cards.source = 'raid' AND cards.id IN (SELECT card_id FROM shop_card_pools)) AS raid_not_in_shop,
          COUNT(*) FILTER (WHERE cards.source = 'raid' AND cards.shop_eligible = TRUE) AS raid_shop_eligible
        FROM cards
      `,
    );
    assert.equal(sourceCounts.rows[0]?.raid_not_in_shop, "0");
    assert.equal(sourceCounts.rows[0]?.raid_shop_eligible, "0");
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("a guild raid runs one realtime turn against the selected witch", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const raids = new GuildRaidService(pool, () => 0.999999);
  const player = await players.findOrCreateFromTelegram(telegramUser());
  const guildId = randomUUID();

  try {
    await pool.query(
      `INSERT INTO guilds (id, name, name_key, created_by) VALUES ($1, $2, $3, $4)`,
      [guildId, "Бій тест", `witches_battle_${guildId}`, player.id],
    );
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'leader')", [guildId, player.id]);
    await pool.query("UPDATE player_card_instances SET level = 60 WHERE player_id = $1", [player.id]);
    await recalculateAutomaticDeckForPlayer(pool, player.id);

    let view = await raids.getActiveRaid(guildId, player.id);
    assert.equal(view.enrollment.enrolled, false);
    view = await raids.enroll(player.id, guildId);
    assert.equal(view.enrollment.enrolled, true);
    assert.equal(view.enrollment.participantCount, 1);
    view = await raids.startRaid(player.id, guildId);
    assert.equal(view.status, "active");
    view = await raids.startBattle(player.id, guildId);
    assert.equal(view.battle?.status, "active");
    assert.equal(view.battle?.playerActiveCards.length, 3);
    assert.equal(view.battle?.witchActiveCards[0].length, 3);

    const battle = view.battle!;
    const next = await raids.action(player.id, guildId, battle.battleId, {
      bossSlot: 1,
      expectedVersion: battle.version,
      slotIndex: 0,
    });
    assert.equal(next.battle?.status, "active");
    assert.equal(next.battle?.turnNumber, 1);
    assert.ok((next.battle?.playerHp ?? 0) < (next.battle?.playerMaxHp ?? 0));
    assert.ok(next.bosses[0]!.currentHealth < next.bosses[0]!.health);
    assert.equal((await pool.query<{ count: number }>(
      "SELECT jsonb_array_length(witch_deck) AS count FROM guild_witch_raid_bosses WHERE raid_id = $1 ORDER BY slot LIMIT 1",
      [next.id],
    )).rows[0]?.count, 10);
    const deckRows = await pool.query<{ witch_deck: Array<{ finalPower: number; source?: string }> }>(
      "SELECT witch_deck FROM guild_witch_raid_bosses WHERE raid_id = $1 ORDER BY slot",
      [next.id],
    );
    assert.equal(deckRows.rows.length, 2);
    for (const row of deckRows.rows) {
      assert.equal(row.witch_deck.length, 10);
      assert.ok(Math.abs(row.witch_deck.reduce((sum, card) => sum + card.finalPower, 0) - 45_000) <= 500);
      assert.equal(row.witch_deck[9]?.source, "guild");
    }

    await pool.query("UPDATE guild_witch_raid_bosses SET current_health = 5 WHERE raid_id = $1", [next.id]);
    const firstFinish = await raids.action(player.id, guildId, next.battle!.battleId, {
      bossSlot: 1,
      expectedVersion: next.battle!.version,
      slotIndex: 0,
    });
    const reset = await raids.action(player.id, guildId, next.battle!.battleId, {
      bossSlot: 2,
      expectedVersion: firstFinish.battle!.version,
      slotIndex: 0,
    });
    assert.equal(reset.status, "open");
    assert.equal(reset.level, 2);
    assert.equal(reset.battle?.status, "won");
    assert.ok(reset.bosses.every((boss) => boss.currentHealth === boss.health));
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = $1", [player.id]);
    await pool.end();
  }
});

test("a fatal hit cannot revive a witch while another participant finishes the raid", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const raids = new GuildRaidService(pool, () => 0.999999);
  const testPlayers = await Promise.all([telegramUser(), telegramUser()].map((user) => players.findOrCreateFromTelegram(user)));
  const guildId = randomUUID();

  try {
    await pool.query(
      `INSERT INTO guilds (id, name, name_key, created_by) VALUES ($1, $2, $3, $4)`,
      [guildId, "Два мага", `witches_two_players_${guildId}`, testPlayers[0]!.id],
    );
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'leader'), ($1, $3, 'member')", [guildId, testPlayers[0]!.id, testPlayers[1]!.id]);
    for (const player of testPlayers) {
      await pool.query("UPDATE player_card_instances SET level = 60 WHERE player_id = $1", [player.id]);
      await recalculateAutomaticDeckForPlayer(pool, player.id);
    }

    await raids.enroll(testPlayers[0]!.id, guildId);
    await raids.enroll(testPlayers[1]!.id, guildId);
    await raids.startRaid(testPlayers[0]!.id, guildId);
    let firstView = await raids.startBattle(testPlayers[0]!.id, guildId);
    const secondView = await raids.startBattle(testPlayers[1]!.id, guildId);
    assert.equal(firstView.battle?.status, "active");
    assert.equal(secondView.battle?.status, "active");

    await pool.query(
      "UPDATE guild_witch_raid_bosses SET current_health = CASE slot WHEN 1 THEN 400000 ELSE 5 END WHERE raid_id = $1",
      [firstView.id],
    );
    const boostedCard = { ...firstView.battle!.playerActiveCards[0]!, basePower: 1_000_000, finalPower: 1_000_000 };
    await pool.query(
      "UPDATE guild_witch_raid_battles SET player_active_slots = jsonb_set(player_active_slots, '{0}', $2::jsonb) WHERE id = $1",
      [firstView.battle!.battleId, JSON.stringify(boostedCard)],
    );

    firstView = await raids.action(testPlayers[0]!.id, guildId, firstView.battle!.battleId, {
      bossSlot: 1,
      expectedVersion: firstView.battle!.version,
      slotIndex: 0,
    });
    assert.equal(firstView.bosses[0]!.currentHealth, 0);
    assert.equal(firstView.battle?.status, "active");

    await assert.rejects(
      () => raids.action(testPlayers[1]!.id, guildId, secondView.battle!.battleId, {
        bossSlot: 1,
        expectedVersion: secondView.battle!.version,
        slotIndex: 0,
      }),
      (error: unknown) => error instanceof GuildRaidDomainError && error.code === "raid_target_defeated",
    );

    const finished = await raids.action(testPlayers[1]!.id, guildId, secondView.battle!.battleId, {
      bossSlot: 2,
      expectedVersion: secondView.battle!.version,
      slotIndex: 0,
    });
    assert.equal(finished.status, "open");
    assert.equal(finished.lastResult?.level, 1);
    assert.ok(finished.lastResult);
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [testPlayers.map((player) => player.id)]);
    await pool.end();
  }
});

test("a ten-player raid records damage and pays cards or equal currency by placement", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl });
  const players = new PlayerRepository(pool);
  const raids = new GuildRaidService(pool, () => 0.999999);
  const mail = new MailService(pool);
  const testPlayers = await Promise.all(Array.from({ length: 10 }, () => players.findOrCreateFromTelegram(telegramUser())));
  const playerIds = testPlayers.map((player) => player.id);
  const guildId = randomUUID();
  const damageByPlayer = [100_000, 90_000, 80_000, 70_000, 60_000, 50_000, 40_000, 30_000, 20_000, 10_000];

  try {
    await pool.query(
      `INSERT INTO guilds (id, name, name_key, created_by) VALUES ($1, $2, $3, $4)`,
      [guildId, "Нагороди", `witches_rewards_${guildId}`, testPlayers[0]!.id],
    );
    for (const [index, player] of testPlayers.entries()) {
      await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, $3)", [guildId, player.id, index === 0 ? "leader" : "member"]);
      await pool.query("UPDATE player_card_instances SET level = 60 WHERE player_id = $1", [player.id]);
      await recalculateAutomaticDeckForPlayer(pool, player.id);
    }

    let view = await raids.getActiveRaid(guildId, testPlayers[0]!.id);
    for (const player of testPlayers) {
      view = await raids.enroll(player.id, guildId);
    }
    view = await raids.startRaid(testPlayers[0]!.id, guildId);
    view = await raids.startBattle(testPlayers[0]!.id, guildId);
    await pool.query(
      "UPDATE guild_witch_raid_participants SET damage_total = $3 WHERE raid_id = $1 AND player_id = $2",
      [view.id, testPlayers[0]!.id, damageByPlayer[0]],
    );
    for (let index = 1; index < playerIds.length; index += 1) {
      await pool.query(
        "UPDATE guild_witch_raid_participants SET damage_total = $3 WHERE raid_id = $1 AND player_id = $2",
        [view.id, playerIds[index], damageByPlayer[index]],
      );
    }
    await pool.query("UPDATE guild_witch_raid_bosses SET current_health = 5 WHERE raid_id = $1", [view.id]);

    const battle = view.battle!;
    view = await raids.action(testPlayers[0]!.id, guildId, battle.battleId, {
      bossSlot: 1,
      expectedVersion: battle.version,
      slotIndex: 0,
    });
    const secondTurn = view.battle!;
    view = await raids.action(testPlayers[0]!.id, guildId, secondTurn.battleId, {
      bossSlot: 2,
      expectedVersion: secondTurn.version,
      slotIndex: 0,
    });

    assert.equal(view.status, "open");
    assert.equal(view.lastResult?.participantCount, 10);
    const firstTurnDamage = view.lastResult!.totalDamage - damageByPlayer.reduce((sum, damage) => sum + damage, 0);
    assert.deepEqual(view.lastResult?.participants.map((participant) => participant.damage), [100_000 + firstTurnDamage, 90_000, 80_000, 70_000, 60_000, 50_000, 40_000, 30_000, 20_000, 10_000]);
    assert.ok(view.lastResult?.participants.slice(0, 3).every((participant) => participant.reward.card));
    assert.ok(view.lastResult?.participants.slice(3).every((participant) => participant.reward.gold === 50 && participant.reward.silver === 50_000));
    assert.ok(view.lastResult?.participants.every((participant) => participant.reward.mailId));
    assert.equal(view.lastResult?.totalDamage, 550_000 + firstTurnDamage);

    const balances = await pool.query<{ id: string; gold: string; silver: string }>(
      "SELECT id, gold, silver FROM players WHERE id = ANY($1::uuid[]) ORDER BY array_position($1::uuid[], id)",
      [playerIds],
    );
    assert.deepEqual(balances.rows.slice(0, 3).map(({ gold, silver }) => ({ gold, silver })), [
      { gold: "0", silver: "1500" },
      { gold: "0", silver: "1500" },
      { gold: "0", silver: "1500" },
    ]);
    assert.deepEqual(balances.rows.map(({ gold, silver }) => ({ gold, silver })), Array.from({ length: 10 }, () => ({ gold: "0", silver: "1500" })));

    const raidMail = await pool.query<{ id: string; player_id: string; card_id: string | null; silver: string; gold: string; claimed_at: string | null }>(
      "SELECT id, player_id, card_id, silver, gold, claimed_at FROM player_mail WHERE subject = 'Нагорода за рейд' AND player_id = ANY($1::uuid[]) ORDER BY player_id, id",
      [playerIds],
    );
    assert.equal(raidMail.rows.length, 10);
    assert.equal(raidMail.rows.filter((message) => message.card_id !== null).length, 3);
    assert.ok(raidMail.rows.every((message) => message.claimed_at === null));

    const topReward = view.lastResult!.participants[0]!.reward;
    const topCardId = topReward.card!.cardId;
    const cardsBeforeClaim = await pool.query<{ count: string }>(
      "SELECT COUNT(*) FROM player_card_instances WHERE player_id = $1 AND card_id = $2",
      [testPlayers[0]!.id, topCardId],
    );
    await mail.claim(testPlayers[0]!.id, topReward.mailId!);
    const cardsAfterClaim = await pool.query<{ count: string }>(
      "SELECT COUNT(*) FROM player_card_instances WHERE player_id = $1 AND card_id = $2",
      [testPlayers[0]!.id, topCardId],
    );
    assert.equal(Number(cardsAfterClaim.rows[0]?.count) - Number(cardsBeforeClaim.rows[0]?.count), 1);
    assert.equal(
      Number((await pool.query(
        `SELECT COUNT(*) FROM deck_slots
         INNER JOIN player_decks ON player_decks.id = deck_slots.deck_id
         INNER JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
         WHERE player_decks.player_id = $1 AND player_card_instances.card_id = $2`,
        [testPlayers[0]!.id, topCardId],
      )).rows[0]?.count),
      1,
      "claiming a raid card recalculates the automatic deck in the same transaction",
    );

    const currencyReward = view.lastResult!.participants[3]!.reward;
    const currencyClaim = await mail.claim(testPlayers[3]!.id, currencyReward.mailId!);
    assert.deepEqual(currencyClaim.updatedBalance, { gold: 50, silver: 51_500 });
  } finally {
    await pool.query("DELETE FROM guilds WHERE id = $1", [guildId]);
    await pool.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [playerIds]);
    await pool.end();
  }
});
