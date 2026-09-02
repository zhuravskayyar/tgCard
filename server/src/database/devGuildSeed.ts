import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { DEV_ACCOUNT_IDS } from "../dev/devAuthRoute.js";
import { grantStarterCards } from "../inventory/starterCardGrant.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";

if (process.env.NODE_ENV === "production" || process.env.CARDASTIKA_DEV_AUTH !== "true") {
  throw new Error("Dev guild seed is disabled unless CARDASTIKA_DEV_AUTH=true and NODE_ENV is not production");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required to run the dev guild seed");

const pool = new Pool({ connectionString: databaseUrl });
const guildId = "00000000-0000-4000-8000-000000000010";
const players = [
  [DEV_ACCOUNT_IDS.player_regular, "dev_regular", "Регулярний", 12, 20_000, "devregular1"],
  [DEV_ACCOUNT_IDS.guild_leader, "dev_leader", "Лідер", 30, 50_000, "devleader01"],
  [DEV_ACCOUNT_IDS.guild_officer, "dev_officer", "Офіцер", 25, 20_000, "devofficer1"],
  [DEV_ACCOUNT_IDS.guild_veteran, "dev_veteran", "Ветеран", 20, 20_000, "devveteran1"],
  [DEV_ACCOUNT_IDS.guild_member, "dev_member", "Учасник", 15, 20_000, "devmember01"],
  [DEV_ACCOUNT_IDS.guild_newbie, "dev_newbie", "Новачок", 10, 20_000, "devnewbie01"],
  [DEV_ACCOUNT_IDS.player_locked, "dev_locked", "До десятого", 9, 20_000, "devlocked1"],
] as const;

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM guilds WHERE id = $1 OR created_by = ANY($2::uuid[])", [guildId, players.map(([id]) => id)]);
    await client.query("DELETE FROM players WHERE id = ANY($1::uuid[])", [players.map(([id]) => id)]);
    for (const [id, username, firstName, level, silver, referralCode] of players) {
      await client.query(
        `
          INSERT INTO players (id, telegram_user_id, username, first_name, level, silver, referral_code)
          VALUES ($1, NULL, $2, $3, $4, $5, $6)
        `,
        [id, username, firstName, level, silver, referralCode],
      );
      await grantStarterCards(client, id);
      await recalculateAutomaticDeck(client, id);
    }
    await client.query(
      `
        INSERT INTO guilds (id, name, name_key, description, emblem_id, language, recruitment_mode, min_player_level, created_by)
        VALUES ($1, 'Вартові', 'вартові', 'Локальна гільдія для перевірки всіх MVP-ролей Cardastika.', 'shield-1', 'uk', 'open', 10, $2)
      `,
      [guildId, DEV_ACCOUNT_IDS.guild_leader],
    );
    for (const [playerId, role] of [
      [DEV_ACCOUNT_IDS.guild_leader, "leader"],
      [DEV_ACCOUNT_IDS.guild_officer, "officer"],
      [DEV_ACCOUNT_IDS.guild_veteran, "veteran"],
      [DEV_ACCOUNT_IDS.guild_member, "member"],
      [DEV_ACCOUNT_IDS.guild_newbie, "newbie"],
    ] as const) {
      await client.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, $3)", [guildId, playerId, role]);
    }
    const leaderId = DEV_ACCOUNT_IDS.guild_leader;
    await client.query(
      `UPDATE guilds
       SET active_guild_card_instance_id = (
         SELECT id FROM player_card_instances
         WHERE player_id = $2
         ORDER BY created_at ASC, id ASC
         LIMIT 1
       )
       WHERE id = $1`,
      [guildId, leaderId],
    );
    await client.query("INSERT INTO guild_treasuries (guild_id) VALUES ($1)", [guildId]);
    await client.query(
      `INSERT INTO guild_cards (
         id, guild_id, source_player_card_instance_id, selected_by_player_id,
         card_id, level, bonus_power, level_progress_elements, stored_elements
       )
       SELECT pci.id, g.id, pci.id, $2, pci.card_id, pci.level, pci.bonus_power,
         pci.level_progress_elements, pci.stored_elements
       FROM guilds g
       INNER JOIN player_card_instances pci ON pci.id = g.active_guild_card_instance_id
       WHERE g.id = $1`,
      [guildId, leaderId],
    );
    await client.query(
      `INSERT INTO guild_forum_sections (id, guild_id, slug, title, description, visibility, sort_order)
       VALUES ('00000000-0000-4000-8000-000000000101', $1, 'welcome', 'Гостьова зала', 'Новини та знайомство. Видно всім мандрівникам.', 'public', 10),
              ('00000000-0000-4000-8000-000000000102', $1, 'inner', 'Внутрішня зала', 'Тактика, плани та розмови учасників.', 'private', 20)`,
      [guildId],
    );
    await client.query(
      `INSERT INTO guild_announcements (id, guild_id, author_id, body)
       VALUES ('00000000-0000-4000-8000-000000000103', $1, $2, 'Цього тижня збираємо 1 800 XP разом. Після дуелі залишайся ще на один забіг — маленькі внески складаються у велику силу.')`,
      [guildId, leaderId],
    );
    const activityRows = [
      ["00000000-0000-4000-8000-000000000111", DEV_ACCOUNT_IDS.guild_leader, "duel_win", "dev-duel-1", 18],
      ["00000000-0000-4000-8000-000000000112", DEV_ACCOUNT_IDS.guild_officer, "campaign_win", "dev-campaign-1", 8],
      ["00000000-0000-4000-8000-000000000113", DEV_ACCOUNT_IDS.guild_member, "dungeon_complete", "dev-dungeon-1", 12],
      ["00000000-0000-4000-8000-000000000114", DEV_ACCOUNT_IDS.guild_veteran, "duel_win", "dev-duel-2", 18],
    ] as const;
    for (const [id, playerId, activityType, sourceId, xp] of activityRows) {
      await client.query(
        `INSERT INTO guild_xp_contributions (id, guild_id, player_id, activity_type, source_id, xp)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, guildId, playerId, activityType, sourceId, xp],
      );
      await client.query("UPDATE guild_members SET contributed_xp = contributed_xp + $3 WHERE guild_id = $1 AND player_id = $2", [guildId, playerId, xp]);
      await client.query(
        `INSERT INTO guild_activity_log (id, guild_id, event_type, actor_id, activity_type, amount, detail)
         VALUES ($1, $2, 'xp_contributed', $3, $4, $5, $6)`,
        [randomUUID(), guildId, playerId, activityType, xp, `+${xp} XP до спільного прогресу`],
      );
    }
    await client.query("UPDATE guilds SET experience = 56, updated_at = NOW() WHERE id = $1", [guildId]);
    await client.query(
      `INSERT INTO guild_activity_log (id, guild_id, event_type, actor_id, target_id, detail)
       VALUES ('00000000-0000-4000-8000-000000000121', $1, 'guild_created', $2, $2, 'Гільдію створено'),
              ('00000000-0000-4000-8000-000000000122', $1, 'announcement_updated', $2, NULL, 'Оголошення оновлено'),
              ('00000000-0000-4000-8000-000000000123', $1, 'member_joined', $2, $2, 'Засновник відкрив залу')`,
      [guildId, leaderId],
    );
    await client.query(
      `INSERT INTO guild_forum_topics (id, section_id, author_id, title)
       VALUES ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000101', $1, 'Вітаємо у Варті Світового Дерева'),
              ('00000000-0000-4000-8000-000000000132', '00000000-0000-4000-8000-000000000102', $1, 'План розвитку на цей тиждень')`,
      [leaderId],
    );
    await client.query(
      `INSERT INTO guild_forum_posts (id, topic_id, author_id, body)
       VALUES ('00000000-0000-4000-8000-000000000141', '00000000-0000-4000-8000-000000000131', $1, 'Раді бачити нових магів. Пишіть, що хочете прокачати разом.'),
              ('00000000-0000-4000-8000-000000000142', '00000000-0000-4000-8000-000000000132', $1, 'Ціль проста: пройти місію тижня, а потім відкривати бойові модулі.')`,
      [leaderId],
    );
    await client.query("COMMIT");
    console.log(`Dev guild accounts seeded: ${players.length}; guild ${guildId}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
