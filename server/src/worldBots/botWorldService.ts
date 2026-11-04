import { randomInt, randomUUID } from "node:crypto";
import {
  applyAccountXp,
  calculateEquipmentSummary,
  getBasePowerForLevel,
  generateStandardBonusPower,
  STARTER_EQUIPMENT_DEFINITIONS,
  type IntegerRandomSource,
} from "@cardastika/game-core";
import { DUEL_LEAGUE_CONFIG, getLeagueByRating, type CardElement, type CardRarity, type DuelView, type EquipmentSlot, type GuildLanguage } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import type { DuelService } from "../duel/duelService.js";
import type { GuildService } from "../guild/guildService.js";
import type { GuildForumService } from "../guild/guildForumService.js";
import { WORLD_BOTS, WORLD_BOT_PHRASES, type WorldBotDefinition, type WorldBotPersonality } from "./botWorldConfig.js";

export type BotSessionWindow = "slot-1" | "slot-2" | "slot-3" | "slot-4" | "slot-5" | "slot-6" | "slot-7" | "slot-8" | "slot-9" | "slot-10" | "slot-11" | "slot-12";

const DECK_ELEMENTS: readonly CardElement[] = ["fire", "fire", "fire", "water", "water", "air", "air", "earth", "earth"];
const EQUIPMENT_SLOT_ORDER: readonly EquipmentSlot[] = ["weapon", "shield", "head", "cloak", "gloves", "boots", "amulet", "relic", "voodoo"];
const EQUIPMENT_RARITIES: readonly CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const SECTION_LABELS: Readonly<Record<GuildLanguage, { welcome: [string, string]; inner: [string, string] }>> = {
  uk: { welcome: ["Гостьова зала", "Новини та знайомство. Видно всім мандрівникам."], inner: ["Внутрішня зала", "Тактика, плани та розмови учасників."] },
  ru: { welcome: ["Гостевой зал", "Новости и знакомство. Видно всем путешественникам."], inner: ["Внутренний зал", "Тактика, планы и разговоры участников."] },
  en: { welcome: ["Welcome Hall", "News and introductions, open to every traveler."], inner: ["Inner Hall", "Tactics, plans, and member conversations."] },
  de: { welcome: ["Willkommenshalle", "Neuigkeiten und Vorstellungen, offen für alle Reisenden."], inner: ["Innere Halle", "Taktik, Pläne und Gespräche der Mitglieder."] },
  other: { welcome: ["Salle d’accueil", "Actualités et présentations, ouvertes aux voyageurs."], inner: ["Salle intérieure", "Tactiques, projets et conversations des membres."] },
};

interface WorldBotProfileRow {
  bot_key: string;
  guild_id: string | null;
  language: GuildLanguage;
  last_social_at: Date | string | null;
  personality: WorldBotPersonality;
  player_id: string;
}

interface WorldBotCardRow {
  element: CardElement;
  id: string;
}

interface WorldBotRunRow {
  duels_played: number;
  target_duels: number;
}

interface WorldBotResult {
  botKey: string;
  duelsPlayed: number;
  status: "skipped" | "complete" | "failed";
}

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function hashString(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function randomInteger(maximum: number) {
  return randomInt(Math.max(1, maximum));
}

function randomPick<T>(values: readonly T[]): T {
  const value = values[randomInteger(values.length)];
  if (value === undefined) throw new Error("Cannot choose from an empty bot activity pool");
  return value;
}

function equippedItemsFor(bot: WorldBotDefinition) {
  const equipped = Object.fromEntries(EQUIPMENT_SLOT_ORDER.map((slot) => [slot, null])) as Record<EquipmentSlot, string | null>;
  const inventory: string[] = [];
  for (const slot of EQUIPMENT_SLOT_ORDER.slice(0, bot.equipmentSlots)) {
    const definition = STARTER_EQUIPMENT_DEFINITIONS.find((item) => (
      item.isEnabled
      && item.slot === slot
      && item.rarity === bot.equipmentRarity
      && (item.element === null || item.element === bot.element)
    ));
    if (!definition) continue;
    equipped[slot] = definition.id;
    inventory.push(definition.id);
  }
  return { equipped, inventory };
}

function estimateBotDeckPower(bot: WorldBotDefinition) {
  const { equipped } = equippedItemsFor(bot);
  const equipmentSummary = calculateEquipmentSummary(
    STARTER_EQUIPMENT_DEFINITIONS.filter(({ id, slot }) => equipped[slot] === id),
  );
  const expectedCardPower = [-2, -1, 0, 1, 2].reduce((total, offset) => {
    const level = clamp(bot.deckLevel + offset, 1, 120);
    const basePower = getBasePowerForLevel(level);
    return total + basePower + Math.floor(Math.floor(basePower / 5) / 2);
  }, 0) / 5;

  return DECK_ELEMENTS.reduce((total, element) => (
    total + expectedCardPower + equipmentSummary.elementBonuses[element]
  ), 0);
}

function getBotProgressionDefinition(bot: WorldBotDefinition, level: number, deckLevel: number): WorldBotDefinition {
  const configuredRarityIndex = EQUIPMENT_RARITIES.indexOf(bot.equipmentRarity);
  const unlockedRarityIndex = level >= 20 ? 5 : level >= 14 ? 4 : level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0;
  const equipmentSlots = Math.min(bot.equipmentSlots, clamp(2 + Math.floor(Math.max(0, level - 1) / 3), 2, EQUIPMENT_SLOT_ORDER.length));
  return {
    ...bot,
    deckLevel: clamp(deckLevel, 1, 120),
    equipmentRarity: EQUIPMENT_RARITIES[Math.min(configuredRarityIndex, unlockedRarityIndex)]!,
    equipmentSlots,
    level,
  };
}

function getSeededDuelRecord(bot: WorldBotDefinition) {
  const league = DUEL_LEAGUE_CONFIG.leagues[bot.duelLeagueIndex];
  if (!league) throw new Error(`World bot ${bot.botKey} has an invalid duel league index`);
  const maxRating = league.maxRating ?? league.minRating + DUEL_LEAGUE_CONFIG.divisionRatingStep - 1;
  const targetRating = league.minRating + 25 + hashString(`${bot.botKey}:rating`) % 51;
  const targetWinRate = 0.62 + (bot.avatarIndex % 6) * 0.02;
  let best: { losses: number; rating: number; score: number; wins: number } | null = null;

  for (let duels = 10; duels <= 240; duels += 1) {
    for (let wins = 10; wins <= duels; wins += 1) {
      const losses = duels - wins;
      const rating = Math.max(0, wins * DUEL_LEAGUE_CONFIG.winRating + losses * DUEL_LEAGUE_CONFIG.lossRating);
      if (rating < league.minRating || rating > maxRating) continue;
      const winRate = wins / duels;
      if (winRate < 0.35 || winRate > 0.85) continue;
      const score = Math.abs(rating - targetRating) * 0.15
        + Math.abs(winRate - targetWinRate) * 100
        + duels * 0.002;
      if (!best || score < best.score) best = { losses, rating, score, wins };
    }
  }

  if (!best) throw new Error(`Could not create a realistic duel record for world bot ${bot.botKey}`);
  return best;
}

export class BotWorldService {
  constructor(
    private readonly pool: Pool,
    private readonly duels: Pick<DuelService, "action" | "findActive" | "search" | "start">,
    private readonly guilds: Pick<GuildService, "create" | "decideApplication" | "join" | "updateAnnouncement">,
    private readonly forum: Pick<GuildForumService, "createPost" | "createTopic">,
  ) {}

  async ensureWorld(limit = WORLD_BOTS.length) {
    let initialized = 0;
    for (const definition of WORLD_BOTS) {
      let profile = await this.findBotProfile(definition.botKey);
      if (profile?.guild_id) continue;
      if (initialized >= limit) continue;
      if (!profile) profile = await this.createBot(definition);
      initialized += 1;
      if (!profile.guild_id) {
        await this.ensureGuild(definition, profile.player_id);
        profile = await this.findBotProfile(definition.botKey);
      }
      if (!profile) continue;
      if (!profile?.guild_id) throw new Error(`World bot ${definition.botKey} has no guild`);
      if (definition.guild) {
        await this.localizeGuildSections(profile.guild_id, definition.language);
        await this.seedGuildWelcome(definition, profile);
      }
    }
    await this.ensureBotLeaguePlacements();
  }

  async runWindow(window: BotSessionWindow) {
    const now = new Date();
    const day = utcDateKey(now);
    await this.ensureWorld(2);
    const profiles = await this.pool.query<WorldBotProfileRow>(
      `SELECT bot_key, player_id, guild_id, language, personality, last_social_at
       FROM simulated_bot_profiles WHERE enabled = TRUE ORDER BY bot_key`,
    );
    const results: WorldBotResult[] = [];
    for (const profile of profiles.rows) {
      const definition = WORLD_BOTS.find(({ botKey }) => botKey === profile.bot_key);
      if (!definition || !this.isScheduled(definition, day, window)) {
        results.push({ botKey: profile.bot_key, duelsPlayed: 0, status: "skipped" });
        continue;
      }
      const run = await this.claimRun(profile.bot_key, day, window);
      if (!run) {
        results.push({ botKey: profile.bot_key, duelsPlayed: 0, status: "skipped" });
        continue;
      }
      try {
        let completed = run.duels_played;
        while (completed < run.target_duels) {
          await this.playDuel(profile.player_id, definition.personality);
          completed += 1;
          await this.pool.query(
            `UPDATE simulated_bot_runs SET duels_played = $4
             WHERE bot_key = $1 AND run_date = $2 AND session_window = $3`,
            [profile.bot_key, day, window, completed],
          );
        }
        await this.syncBotProgression(profile.player_id, definition);
        await this.handleGuildActivity(definition, profile);
        await this.pool.query(
          `UPDATE simulated_bot_profiles SET last_active_at = NOW(), updated_at = NOW()
           WHERE bot_key = $1`,
          [profile.bot_key],
        );
        await this.pool.query(
          `UPDATE simulated_bot_runs SET status = 'complete', completed_at = NOW()
           WHERE bot_key = $1 AND run_date = $2 AND session_window = $3`,
          [profile.bot_key, day, window],
        );
        results.push({ botKey: profile.bot_key, duelsPlayed: completed - run.duels_played, status: "complete" });
      } catch (error) {
        console.error(`World bot session failed for ${profile.bot_key}`, error);
        await this.pool.query(
          `UPDATE simulated_bot_runs SET status = 'failed'
           WHERE bot_key = $1 AND run_date = $2 AND session_window = $3`,
          [profile.bot_key, day, window],
        );
        results.push({ botKey: profile.bot_key, duelsPlayed: 0, status: "failed" });
      }
    }
    return {
      date: day,
      window,
      bots: results.length,
      sessions: results.filter(({ status }) => status === "complete").length,
      duels: results.reduce((total, result) => total + result.duelsPlayed, 0),
      failed: results.filter(({ status }) => status === "failed").length,
    };
  }

  private isScheduled(bot: WorldBotDefinition, day: string, window: BotSessionWindow) {
    const firstWindow = hashString(`${bot.botKey}:${day}`) % 12;
    const currentWindow = Number(window.slice("slot-".length)) - 1;
    if (currentWindow === firstWindow || currentWindow === (firstWindow + 6) % 12) return true;
    return bot.extraDailySession && currentWindow === (firstWindow + 1) % 12;
  }

  private async claimRun(botKey: string, day: string, window: BotSessionWindow): Promise<WorldBotRunRow | null> {
    const targetDuels = 1;
    await this.pool.query(
      `INSERT INTO simulated_bot_runs (bot_key, run_date, session_window, target_duels)
       VALUES ($1, $2, $3, $4) ON CONFLICT (bot_key, run_date, session_window) DO NOTHING`,
      [botKey, day, window, targetDuels],
    );
    const claimed = await this.pool.query<WorldBotRunRow>(
      `UPDATE simulated_bot_runs
       SET status = 'running', started_at = NOW()
       WHERE bot_key = $1 AND run_date = $2 AND session_window = $3
         AND status <> 'complete'
         AND (status <> 'running' OR started_at < NOW() - INTERVAL '5 minutes')
       RETURNING duels_played, target_duels`,
      [botKey, day, window],
    );
    return claimed.rows[0] ?? null;
  }

  private async createBot(bot: WorldBotDefinition): Promise<WorldBotProfileRow> {
    const client = await this.pool.connect();
    const playerId = randomUUID();
    const referralCode = playerId.replaceAll("-", "").slice(0, 12).toLowerCase();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cardastika-world-bot-seed'))");
      const existing = await client.query<WorldBotProfileRow>(
        `SELECT bot_key, player_id, guild_id, language, personality, last_social_at
         FROM simulated_bot_profiles WHERE bot_key = $1`,
        [bot.botKey],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return existing.rows[0];
      }
      const leagueSeed = this.getDuelLeagueSeed(bot);
      const seededBot = getBotProgressionDefinition(bot, leagueSeed.level, leagueSeed.deckLevel);
      await client.query(
        `INSERT INTO players (
           id, telegram_user_id, username, nickname, first_name, last_name, photo_url,
           level, account_xp, silver, gold, referral_code, tutorial_eligible, equipment, is_bot,
           duel_rating, duel_highest_league_index, duel_wins, duel_losses, rating
         ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, 50000, 0, $9, FALSE, $10::jsonb, TRUE, $11, $12, $13, $14, $11)`,
        [playerId, bot.username, bot.nickname, bot.firstName, bot.lastName, `bot-avatar:${String(bot.avatarIndex).padStart(2, "0")}`, leagueSeed.level, leagueSeed.accountXp, referralCode, JSON.stringify({ equipped: leagueSeed.equipped }), leagueSeed.rating, leagueSeed.leagueIndex, leagueSeed.wins, leagueSeed.losses],
      );
      await this.createBotDeck(client, playerId, seededBot);
      if (leagueSeed.inventory.length) {
        await client.query(
          `INSERT INTO player_equipment_inventory (player_id, item_id, quantity)
           SELECT $1, items.item_id, 1 FROM UNNEST($2::text[]) AS items(item_id)
           ON CONFLICT (player_id, item_id) DO NOTHING`,
          [playerId, leagueSeed.inventory],
        );
      }
      await client.query(
        `INSERT INTO simulated_bot_profiles (bot_key, player_id, language, personality, avatar_index, duel_league_seeded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [bot.botKey, playerId, bot.language, bot.personality, bot.avatarIndex],
      );
      await client.query("COMMIT");
      return {
        bot_key: bot.botKey,
        player_id: playerId,
        guild_id: null,
        language: bot.language,
        personality: bot.personality,
        last_social_at: null,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const existing = await this.findBotProfile(bot.botKey);
      if (existing) return existing;
      throw error;
    } finally {
      client.release();
    }
  }

  private async createBotDeck(client: PoolClient, playerId: string, bot: WorldBotDefinition) {
    const catalog = await client.query<WorldBotCardRow>(
      `SELECT id, element FROM cards
       WHERE limited = FALSE AND source = 'standard'
       ORDER BY element, id`,
    );
    const byElement = new Map<CardElement, WorldBotCardRow[]>();
    for (const card of catalog.rows) {
      const rows = byElement.get(card.element) ?? [];
      rows.push(card);
      byElement.set(card.element, rows);
    }
    const deckId = randomUUID();
    await client.query("INSERT INTO player_decks (id, player_id) VALUES ($1, $2)", [deckId, playerId]);
    const usedByElement = new Map<CardElement, Set<string>>();
    const instances: Array<{ id: string; cardId: string; level: number; bonusPower: number }> = [];
    const deckSlots: Array<{ slot: number; instanceId: string }> = [];
    const discoveredCards = new Set<string>();
    for (const [index, element] of DECK_ELEMENTS.entries()) {
      const pool = byElement.get(element) ?? [];
      if (!pool.length) throw new Error(`The card catalog has no standard ${element} cards for world bots`);
      const used = usedByElement.get(element) ?? new Set<string>();
      let candidates = pool.filter(({ id }) => !used.has(id));
      if (!candidates.length) candidates = pool;
      const card = candidates[randomInteger(candidates.length)]!;
      used.add(card.id);
      usedByElement.set(element, used);
      const level = clamp(bot.deckLevel + randomInteger(5) - 2, 1, 120);
      const basePower = getBasePowerForLevel(level);
      const bonusPower = generateStandardBonusPower(basePower, { nextInt: (maximum) => randomInteger(maximum) } satisfies IntegerRandomSource);
      const instanceId = randomUUID();
      instances.push({ id: instanceId, cardId: card.id, level, bonusPower });
      deckSlots.push({ slot: index + 1, instanceId });
      discoveredCards.add(card.id);
    }
    await client.query(
      `INSERT INTO player_card_instances (
         id, player_id, card_id, level, bonus_power, level_progress_elements, stored_elements
       ) SELECT instance_id, $2::uuid, card_id, card_level, bonus_power, 0, 0
         FROM UNNEST($1::uuid[], $3::text[], $4::int[], $5::int[])
         AS cards(instance_id, card_id, card_level, bonus_power)`,
      [instances.map(({ id }) => id), playerId, instances.map(({ cardId }) => cardId), instances.map(({ level }) => level), instances.map(({ bonusPower }) => bonusPower)],
    );
    await client.query(
      `INSERT INTO deck_slots (deck_id, slot, card_instance_id)
       SELECT $1::uuid, slot, instance_id
       FROM UNNEST($2::smallint[], $3::uuid[]) AS slots(slot, instance_id)`,
      [deckId, deckSlots.map(({ slot }) => slot), deckSlots.map(({ instanceId }) => instanceId)],
    );
    await client.query(
      `INSERT INTO player_card_discoveries (player_id, card_id)
       SELECT $1::uuid, discovered.card_id FROM UNNEST($2::text[]) AS discovered(card_id)
       ON CONFLICT (player_id, card_id) DO NOTHING`,
      [playerId, [...discoveredCards]],
    );
  }

  private async findBotProfile(botKey: string) {
    const result = await this.pool.query<WorldBotProfileRow>(
      `SELECT bot_key, player_id, guild_id, language, personality, last_social_at
       FROM simulated_bot_profiles WHERE bot_key = $1`,
      [botKey],
    );
    return result.rows[0] ?? null;
  }

  private getDuelLeagueSeed(bot: WorldBotDefinition) {
    const record = getSeededDuelRecord(bot);
    let level = 1;
    let deckLevel = 6;
    let accountProgress = applyAccountXp({ level: 1, xp: 0, gainedXp: 0 });
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const progressionBot = getBotProgressionDefinition(bot, level, deckLevel);
      const expectedDeckPower = estimateBotDeckPower(progressionBot);
      const estimatedXp = Math.max(
        (record.wins + record.losses) * 35,
        Math.round(expectedDeckPower * (record.wins * 0.55 + record.losses * 0.35)),
      );
      accountProgress = applyAccountXp({ level: 1, xp: 0, gainedXp: estimatedXp });
      const nextDeckLevel = clamp(accountProgress.newLevel + 5, 1, 30);
      if (accountProgress.newLevel === level && nextDeckLevel === deckLevel) break;
      level = accountProgress.newLevel;
      deckLevel = nextDeckLevel;
    }
    const seededBot = getBotProgressionDefinition(bot, level, deckLevel);
    const { equipped, inventory } = equippedItemsFor(seededBot);
    const cardLevels = Array.from({ length: 9 }, (_, index) => {
      const slot = index + 1;
      const cardLevel = clamp(deckLevel + (slot % 5) - 2, 1, 120);
      const basePower = getBasePowerForLevel(cardLevel);
      return { slot, level: cardLevel, bonusPower: Math.floor(basePower / 10) };
    });
    return {
      accountXp: accountProgress.remainingXp,
      cardLevels,
      deckLevel,
      equipped,
      inventory,
      leagueIndex: getLeagueByRating(record.rating).index,
      level,
      losses: record.losses,
      rating: record.rating,
      wins: record.wins,
    };
  }

  private async ensureBotLeaguePlacements() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cardastika-world-bot-leagues'))");
      const seeds = WORLD_BOTS.map((bot) => {
        const progression = this.getDuelLeagueSeed(bot);
        return {
          bot_key: bot.botKey,
          rating: progression.rating,
          wins: progression.wins,
          losses: progression.losses,
          account_xp: progression.accountXp,
          level: progression.level,
          deck_level: progression.deckLevel,
          league_index: progression.leagueIndex,
          equipped: progression.equipped,
          inventory: progression.inventory,
          card_levels: progression.cardLevels,
        };
      });
      await client.query(
        `UPDATE players AS player
         SET duel_rating = CASE WHEN profile.duel_league_seeded_at IS NULL THEN seed.rating ELSE player.duel_rating END,
             duel_highest_league_index = CASE WHEN profile.duel_league_seeded_at IS NULL
               THEN seed.league_index ELSE GREATEST(player.duel_highest_league_index, seed.league_index) END,
             duel_wins = CASE WHEN profile.duel_league_seeded_at IS NULL THEN seed.wins ELSE GREATEST(player.duel_wins, seed.wins) END,
             duel_losses = CASE WHEN profile.duel_league_seeded_at IS NULL THEN seed.losses ELSE GREATEST(player.duel_losses, seed.losses) END,
             duel_win_streak = CASE WHEN profile.duel_league_seeded_at IS NULL THEN 0 ELSE player.duel_win_streak END,
             level = CASE WHEN profile.duel_league_seeded_at IS NULL THEN seed.level ELSE GREATEST(player.level, seed.level) END,
             account_xp = CASE WHEN profile.duel_league_seeded_at IS NULL THEN seed.account_xp ELSE GREATEST(player.account_xp, seed.account_xp) END,
             equipment = CASE WHEN profile.duel_league_seeded_at IS NULL
               THEN jsonb_build_object('equipped', seed.equipped) ELSE player.equipment END,
             rating = CASE WHEN profile.duel_league_seeded_at IS NULL THEN seed.rating ELSE player.rating END,
             updated_at = NOW()
         FROM simulated_bot_profiles AS profile
         JOIN jsonb_to_recordset($1::jsonb) AS seed(
           bot_key text, rating integer, wins integer, losses integer,
           account_xp bigint, level integer, deck_level integer,
           league_index integer, equipped jsonb, inventory jsonb, card_levels jsonb
         ) ON seed.bot_key = profile.bot_key
         WHERE player.id = profile.player_id
           AND (
             profile.duel_league_seeded_at IS NULL
             OR player.duel_highest_league_index < seed.league_index
             OR player.duel_wins < seed.wins
             OR player.duel_losses < seed.losses
             OR player.level < seed.level
             OR player.account_xp < seed.account_xp
           )`,
        [JSON.stringify(seeds)],
      );
      await client.query(
        `UPDATE player_card_instances AS instance
         SET level = card.level,
             bonus_power = card.bonus_power,
             level_progress_elements = 0,
             stored_elements = 0
         FROM simulated_bot_profiles AS profile
         JOIN player_decks AS deck ON deck.player_id = profile.player_id
         JOIN deck_slots AS slot ON slot.deck_id = deck.id
         JOIN jsonb_to_recordset($1::jsonb) AS seed(bot_key text, card_levels jsonb)
           ON seed.bot_key = profile.bot_key
         CROSS JOIN LATERAL jsonb_to_recordset(seed.card_levels) AS card(slot integer, level integer, bonus_power integer)
         WHERE instance.player_id = profile.player_id
           AND instance.id = slot.card_instance_id
           AND slot.slot = card.slot
           AND profile.duel_league_seeded_at IS NULL`,
        [JSON.stringify(seeds)],
      );
      await client.query(
        `INSERT INTO player_equipment_inventory (player_id, item_id, quantity)
         SELECT profile.player_id, item.item_id, 1
         FROM jsonb_to_recordset($1::jsonb) AS seed(bot_key text, inventory jsonb)
         JOIN simulated_bot_profiles AS profile ON profile.bot_key = seed.bot_key
         CROSS JOIN LATERAL jsonb_array_elements_text(seed.inventory) AS item(item_id)
         ON CONFLICT (player_id, item_id) DO NOTHING`,
        [JSON.stringify(seeds)],
      );
      await client.query(
        "UPDATE simulated_bot_profiles SET duel_league_seeded_at = NOW() WHERE duel_league_seeded_at IS NULL",
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async syncBotProgression(playerId: string, bot: WorldBotDefinition) {
    const player = await this.pool.query<{ level: number }>("SELECT level FROM players WHERE id = $1", [playerId]);
    if (!player.rows[0]) return;
    const level = player.rows[0].level;
    const progressionBot = getBotProgressionDefinition(bot, level, clamp(level + 5, 1, 30));
    const { equipped, inventory } = equippedItemsFor(progressionBot);
    const cardLevel = progressionBot.deckLevel;
    const cardBonusPower = Math.floor(getBasePowerForLevel(cardLevel) / 10);
    await this.pool.query(
      `UPDATE players
       SET equipment = jsonb_set(COALESCE(equipment, '{}'::jsonb), '{equipped}', $2::jsonb, TRUE),
           updated_at = NOW()
       WHERE id = $1`,
      [playerId, JSON.stringify(equipped)],
    );
    await this.pool.query(
      `UPDATE player_card_instances AS instance
       SET level = GREATEST(instance.level, $2),
           bonus_power = GREATEST(instance.bonus_power, $3)
       FROM deck_slots AS slot
       JOIN player_decks AS deck ON deck.id = slot.deck_id
       WHERE deck.player_id = $1
         AND instance.player_id = $1
         AND instance.id = slot.card_instance_id`,
      [playerId, cardLevel, cardBonusPower],
    );
    if (inventory.length) {
      await this.pool.query(
        `INSERT INTO player_equipment_inventory (player_id, item_id, quantity)
         SELECT $1, item_id, 1 FROM UNNEST($2::text[]) AS items(item_id)
         ON CONFLICT (player_id, item_id) DO NOTHING`,
        [playerId, inventory],
      );
    }
  }

  private async ensureGuild(bot: WorldBotDefinition, playerId: string) {
    const membership = await this.pool.query<{ guild_id: string }>(
      "SELECT guild_id FROM guild_members WHERE player_id = $1",
      [playerId],
    );
    if (membership.rows[0]) {
      await this.pool.query("UPDATE simulated_bot_profiles SET guild_id = $2 WHERE bot_key = $1", [bot.botKey, membership.rows[0].guild_id]);
      return;
    }
    if (!bot.guild) {
      const leader = bot.joinGuildBotKey ? await this.findBotProfile(bot.joinGuildBotKey) : null;
      if (!leader?.guild_id) throw new Error(`World bot ${bot.botKey} cannot find its guild leader`);
      await this.guilds.join(playerId, leader.guild_id);
      await this.pool.query(
        "UPDATE simulated_bot_profiles SET guild_id = $2, updated_at = NOW() WHERE bot_key = $1",
        [bot.botKey, leader.guild_id],
      );
      return;
    }
    const guild = await this.guilds.create(playerId, {
      description: bot.guild.description,
      emblemId: bot.guild.emblemId,
      language: bot.guild.language,
      minPlayerLevel: 10,
      name: bot.guild.name,
      recruitmentMode: bot.guild.recruitmentMode,
      themeElement: bot.guild.themeElement,
    });
    await this.pool.query(
      "UPDATE simulated_bot_profiles SET guild_id = $2, updated_at = NOW() WHERE bot_key = $1",
      [bot.botKey, guild.guild.id],
    );
  }

  private async localizeGuildSections(guildId: string, language: GuildLanguage) {
    const labels = SECTION_LABELS[language];
    await this.pool.query(
      `UPDATE guild_forum_sections SET title = $3, description = $4
       WHERE guild_id = $1 AND slug = $2`,
      [guildId, "welcome", labels.welcome[0], labels.welcome[1]],
    );
    await this.pool.query(
      `UPDATE guild_forum_sections SET title = $3, description = $4
       WHERE guild_id = $1 AND slug = $2`,
      [guildId, "inner", labels.inner[0], labels.inner[1]],
    );
  }

  private async seedGuildWelcome(bot: WorldBotDefinition, profile: WorldBotProfileRow) {
    if (!profile.guild_id) return;
    const section = await this.pool.query<{ id: string }>(
      "SELECT id FROM guild_forum_sections WHERE guild_id = $1 AND slug = 'welcome' LIMIT 1",
      [profile.guild_id],
    );
    if (!section.rows[0]) return;
    const topicCount = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM guild_forum_topics WHERE section_id = $1",
      [section.rows[0].id],
    );
    if (Number(topicCount.rows[0]?.count ?? 0) === 0) {
      const phrases = WORLD_BOT_PHRASES[bot.language];
      await this.forum.createTopic(
        profile.player_id,
        profile.guild_id,
        section.rows[0].id,
        randomPick(phrases.topic),
        phrases.welcome.replace("{name}", bot.nickname),
      );
      await this.pool.query(
        "UPDATE simulated_bot_profiles SET last_social_at = NOW() WHERE bot_key = $1",
        [bot.botKey],
      );
    }
    const announcement = await this.pool.query<{ id: string }>(
      "SELECT id FROM guild_announcements WHERE guild_id = $1",
      [profile.guild_id],
    );
    if (!announcement.rows[0]) {
      await this.guilds.updateAnnouncement(profile.player_id, profile.guild_id, randomPick(WORLD_BOT_PHRASES[bot.language].announcement));
    }
  }

  private async handleGuildActivity(bot: WorldBotDefinition, profile: WorldBotProfileRow) {
    if (!profile.guild_id) return;
    const pending = await this.pool.query<{ id: string }>(
      `SELECT id FROM guild_applications
       WHERE guild_id = $1 AND status = 'pending' AND expires_at > NOW()
       ORDER BY created_at LIMIT 1`,
      [profile.guild_id],
    );
    if (bot.guild && pending.rows[0] && randomInteger(4) === 0) {
      try {
        await this.guilds.decideApplication(profile.player_id, profile.guild_id, pending.rows[0].id, "accept");
      } catch (error) {
        console.warn(`World bot ${bot.botKey} could not process a guild application`, error);
      }
    }
    const lastSocialAt = profile.last_social_at ? new Date(profile.last_social_at).getTime() : 0;
    const socialCooldownHours = 24 + (hashString(`${bot.botKey}:social`) % 25);
    if (lastSocialAt && Date.now() - lastSocialAt < socialCooldownHours * 60 * 60 * 1000) return;
    const phrases = WORLD_BOT_PHRASES[bot.language];
    const choice = randomInteger(4);
    if (choice === 0 && bot.guild) {
      await this.guilds.updateAnnouncement(profile.player_id, profile.guild_id, randomPick(phrases.announcement));
    } else {
      const recentHumanTopic = await this.pool.query<{ id: string }>(
        `SELECT t.id FROM guild_forum_topics t
         JOIN guild_forum_sections s ON s.id = t.section_id
         JOIN guild_members gm ON gm.guild_id = s.guild_id AND gm.player_id = t.author_id
         WHERE s.guild_id = $1 AND s.slug = 'welcome' AND t.locked = FALSE
           AND t.author_id <> $2
         ORDER BY t.last_post_at DESC LIMIT 1`,
        [profile.guild_id, profile.player_id],
      );
      if (recentHumanTopic.rows[0] && randomInteger(3) !== 0) {
        await this.forum.createPost(profile.player_id, profile.guild_id, recentHumanTopic.rows[0].id, randomPick(phrases.reply));
      } else {
        const section = await this.pool.query<{ id: string }>(
          "SELECT id FROM guild_forum_sections WHERE guild_id = $1 AND slug = 'welcome' LIMIT 1",
          [profile.guild_id],
        );
        if (section.rows[0]) {
          await this.forum.createTopic(
            profile.player_id,
            profile.guild_id,
            section.rows[0].id,
            randomPick(phrases.topic),
            randomPick(phrases.post),
          );
        }
      }
    }
    await this.pool.query(
      "UPDATE simulated_bot_profiles SET last_social_at = NOW(), updated_at = NOW() WHERE bot_key = $1",
      [bot.botKey],
    );
  }

  private async playDuel(playerId: string, personality: WorldBotPersonality) {
    let duel = await this.duels.findActive(playerId);
    if (!duel) {
      const search = await this.duels.search(playerId);
      duel = await this.duels.start(playerId, search.searchId);
    }
    let steps = 0;
    while (duel.status === "active" && steps < 80) {
      const slotIndex = this.chooseSlot(duel, personality);
      duel = await this.duels.action(playerId, duel.duelId, { expectedVersion: duel.version, slotIndex });
      steps += 1;
    }
    if (duel.status === "active") throw new Error("Bot duel exceeded the 80-exchange session limit");
  }

  private chooseSlot(duel: DuelView, personality: WorldBotPersonality): 0 | 1 | 2 {
    if (personality === "wanderer" && randomInteger(4) === 0) return randomInteger(3) as 0 | 1 | 2;
    const scores = duel.pairMultipliers.map((multiplier, slotIndex) => {
      const ownPower = duel.playerActiveCards[slotIndex]!.finalPower;
      const enemyPower = duel.enemyActiveCards[slotIndex]!.finalPower;
      const roll = randomInteger(18);
      if (personality === "rusher") return multiplier * 100 + ownPower * 0.02 + roll;
      if (personality === "guardian") return multiplier * 60 - enemyPower * 0.02 + roll;
      if (personality === "collector") return multiplier * 70 + (duel.playerActiveCards[slotIndex]!.rarity === "legendary" ? 20 : 0) + roll;
      return multiplier * 100 + ownPower * 0.03 - enemyPower * 0.02 + roll;
    });
    const bestScore = Math.max(...scores);
    const bestSlots = scores.flatMap((score, index) => score >= bestScore - 10 ? [index as 0 | 1 | 2] : []);
    return randomPick(bestSlots);
  }
}
