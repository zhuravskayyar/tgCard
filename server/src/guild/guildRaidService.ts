import { randomUUID } from "node:crypto";
import {
  calculateDuelDamage,
  cycleCardPoolSlot,
  cycleCardPoolSlotWithGuildCard,
  getBasePowerForLevel,
  getElementMultiplier,
  getRarityForLevel,
  getWitchHealth,
  getWitchTreasureDigMinutes,
  getWitchUniqueCardPower,
  initializeCyclicCardPool,
  RAID_CARD_SWAP_GOLD,
  rollWitchTreasure,
  WITCH_BATTLE_LOG_SIZE,
  WITCH_COLLECTION_CODE,
  WITCH_CURSE_DAMAGE_PCT,
  WITCH_CURSE_INTERVAL_MS,
  WITCH_HEAL_THRESHOLDS,
  WITCH_RAID_MAX_LEVEL,
  WITCH_RAID_MIN_GUILD_LEVEL,
  WITCH_TREASURE_CARD_LEVEL_OFFSET,
  type CyclicCardPool,
  type RandomSource,
} from "@cardastika/game-core";
import type {
  CardElement,
  DuelBattleModifiers,
  DuelCardSnapshot,
  DuelSideSnapshot,
  GuildRaidActionRequest,
  GuildRaidBattleLogEntry,
  GuildRaidBattleStatus,
  GuildRaidBattleView,
  GuildRaidDamageParticipantView,
  GuildRaidEnrollmentView,
  GuildRaidResultView,
  GuildRaidSwapRequest,
  GuildRaidView,
  GuildWitchTreasureView,
  PlayerMailCardReward,
} from "@cardastika/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { hasCompletedCollection } from "../collections/discoveryService.js";
import { DuelDeckInvalidError, loadDuelParticipant, toGuildDuelCard } from "../duel/duelService.js";
import { applyDragonHunterTitle, hasDragonHunterTitle } from "./dragonHunterTitle.js";

const WITCH_RAID_LEVEL = 1;
const MAX_WITCH_RAID_LEVEL = WITCH_RAID_MAX_LEVEL;
const MAX_BATTLE_LOG_ENTRIES = WITCH_BATTLE_LOG_SIZE;
const CURSE_INTERVAL_MS = WITCH_CURSE_INTERVAL_MS;
const CURSE_DAMAGE_PCT = WITCH_CURSE_DAMAGE_PCT;
const PEACEFUL_DWARVES_COLLECTION_ID = "collection_dwarves_peace";
const WAR_DWARVES_COLLECTION_ID = "collection_dwarves_war";
/** «Гноми на війні» raise card power and player HP by 10% in witch raids. */
const WAR_DWARVES_PCT = 10;
const HEAL_THRESHOLDS = WITCH_HEAL_THRESHOLDS;
const WITCH_COLLECTION_ID = `collection_${WITCH_COLLECTION_CODE}`;
const WITCH_DECK_SIZE = 10;
const WITCH_NORMAL_CARD_COUNT = 9;
const WITCH_DECK_VARIATION = 500;

type BossSlot = 1 | 2;
type ActiveCards = [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
type WitchActiveCards = [ActiveCards, ActiveCards];
type WitchReserveQueues = [DuelCardSnapshot[], DuelCardSnapshot[]];
type TransactionClient = Pick<PoolClient, "query">;

interface RaidRow extends QueryResultRow {
  guild_id: string;
  heal_thresholds?: string[];
  id: string;
  level: number;
  status: "open" | "active";
  started_at: string | Date | null;
  updated_at: string | Date;
  week_key: string | Date;
}

interface RaidBossRow extends QueryResultRow {
  art_key: string | null;
  card_id: string;
  code: string;
  current_health: number | string;
  display_name: string | null;
  element: CardElement;
  max_health: number | string;
  slot: BossSlot;
  witch_deck: unknown;
}

interface RaidParticipantRow extends QueryResultRow {
  contributed_xp: number | string;
  damage_total: number | string;
  duel_rating: number | string;
  display_name?: string;
  joined_at: string | Date;
  last_activity_at: string | Date;
  photo_url?: string | null;
  player_id: string;
  role: "leader" | "officer" | "veteran" | "member" | "newbie";
  status: "enrolled" | "active" | "defeated" | "finished";
}

interface RaidBattleRow extends QueryResultRow {
  battle_log: GuildRaidBattleLogEntry[];
  card_changes: number;
  finished_at: string | Date | null;
  heal_thresholds: string[];
  id: string;
  last_curse_at: string | Date;
  player_active_slots: unknown;
  player_hp: number | string;
  player_max_hp: number | string;
  player_reserve_queue: unknown;
  player_snapshot: DuelSideSnapshot;
  player_guild_card: DuelCardSnapshot | null;
  raid_id: string;
  raid_level: number;
  status: GuildRaidBattleStatus;
  target_boss_slot: BossSlot;
  turn_number: number;
  version: number;
  witch_active_slots: unknown;
  witch_unique_cards: unknown;
  witch_reserve_queues: unknown;
}

interface WitchTemplateRow extends QueryResultRow {
  art_key: string | null;
  code: string;
  display_name: string | null;
  element: CardElement;
  id: string;
}

interface RaidRewardCardRow extends QueryResultRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  description: string;
  display_name: string | null;
  element: CardElement;
  id: string;
  limited: boolean;
  min_rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
  shop_eligible: boolean;
}

interface RaidResultRow extends QueryResultRow {
  treasure_player_id: string | null;
  treasure_player_name: string | null;
  completed_at: string | Date;
  id: string;
  participant_count: number | string;
  raid_level: number;
  total_damage: number | string;
}

interface RaidResultParticipantRow extends QueryResultRow {
  damage: number | string;
  display_name: string;
  duel_rating: number | string;
  joined_at: string | Date;
  photo_url: string | null;
  placement: number;
  player_id: string;
  reward: unknown;
}

export class GuildRaidDomainError extends Error {
  constructor(
    public readonly code:
      | "guild_not_found"
      | "raid_unavailable"
      | "raid_invalid"
      | "raid_not_member"
      | "raid_not_open"
      | "raid_not_enrolled"
      | "raid_not_leader"
      | "raid_not_active"
      | "raid_battle_not_found"
      | "raid_state_conflict"
      | "raid_target_defeated"
      | "raid_deck_invalid"
      | "raid_locked"
      | "raid_treasure_digging"
      | "raid_treasure_unavailable"
      | "raid_insufficient_gold"
      | "raid_battle_finished",
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "GuildRaidDomainError";
  }
}

export class GuildRaidPersistenceError extends Error {
  constructor(options: ErrorOptions) {
    super("Guild raid data is unavailable", options);
    this.name = "GuildRaidPersistenceError";
  }
}

function toSafeInteger(value: number | string, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function toDateString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function storedWeekKey(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function weekKey(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function levelHealth(level: number) {
  return getWitchHealth(Math.max(1, Math.min(MAX_WITCH_RAID_LEVEL, level)));
}

function nextRaidLevel(level: number) {
  return Math.min(MAX_WITCH_RAID_LEVEL, Math.max(WITCH_RAID_LEVEL, level + 1));
}

function raidLevelCardRarity(level: number) {
  return getRarityForLevel(Math.min(120, 80 + level));
}

function zeroModifiers(): DuelBattleModifiers {
  return {
    battleDamagePct: 0,
    battleHpPct: 0,
    deckPowerPct: 0,
    elementDamagePct: { fire: 0, water: 0, air: 0, earth: 0 },
    experienceRewardPct: 0,
    silverRewardPct: 0,
  };
}

function activeCards(value: unknown, field: string): ActiveCards {
  if (!Array.isArray(value) || value.length !== 3 || value.some((card) => !card || typeof card !== "object")) {
    throw new GuildRaidDomainError("raid_invalid", `Invalid ${field} in raid battle`);
  }
  return [value[0] as DuelCardSnapshot, value[1] as DuelCardSnapshot, value[2] as DuelCardSnapshot];
}

function cardList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((card) => !card || typeof card !== "object")) {
    throw new GuildRaidDomainError("raid_invalid", `Invalid ${field} in raid battle`);
  }
  return value as DuelCardSnapshot[];
}

function witchActiveCards(value: unknown): WitchActiveCards {
  if (!Array.isArray(value) || value.length !== 2) throw new GuildRaidDomainError("raid_invalid", "Raid witch cards are invalid");
  return [activeCards(value[0], "first witch cards"), activeCards(value[1], "second witch cards")];
}

function witchReserveQueues(value: unknown): WitchReserveQueues {
  if (!Array.isArray(value) || value.length !== 2) throw new GuildRaidDomainError("raid_invalid", "Raid witch queues are invalid");
  return [cardList(value[0], "first witch queue"), cardList(value[1], "second witch queue")];
}

function parseWitchUniqueCards(value: unknown): [DuelCardSnapshot | null, DuelCardSnapshot | null] {
  if (!Array.isArray(value) || value.length !== 2 || value.some((card) => card !== null && (!card || typeof card !== "object"))) {
    throw new GuildRaidDomainError("raid_invalid", "Raid witch unique cards are invalid");
  }
  return [value[0] as DuelCardSnapshot | null, value[1] as DuelCardSnapshot | null];
}

function assertBossSlot(value: number): asserts value is BossSlot {
  if (value !== 1 && value !== 2) throw new GuildRaidDomainError("raid_invalid", "Raid boss slot is invalid", 400);
}

function assertCardSlot(value: number): asserts value is 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) throw new GuildRaidDomainError("raid_invalid", "Raid card slot is invalid", 400);
}

function randomIndex(length: number, random: RandomSource) {
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("Raid random source must return a value in [0, 1)");
  return Math.floor(roll * length);
}

function randomInteger(min: number, max: number, random: RandomSource) {
  return min + Math.floor(randomIndex(max - min + 1, random));
}

/** The unique witch card has the reference's fixed power per level; the nine others share the rest. */
function witchDeckPowers(maxHealth: number, raidLevel: number, random: RandomSource) {
  const targetTotal = Math.max(
    WITCH_DECK_SIZE,
    Math.round(maxHealth / WITCH_DECK_SIZE) + randomInteger(-WITCH_DECK_VARIATION, WITCH_DECK_VARIATION, random),
  );
  const uniquePower = getWitchUniqueCardPower(raidLevel);
  const normalTotal = Math.max(WITCH_NORMAL_CARD_COUNT, targetTotal - uniquePower);
  const normalPower = Math.floor(normalTotal / WITCH_NORMAL_CARD_COUNT);
  const remainder = normalTotal - normalPower * WITCH_NORMAL_CARD_COUNT;
  return {
    normal: Array.from({ length: WITCH_NORMAL_CARD_COUNT }, (_, index) => normalPower + (index < remainder ? 1 : 0)),
    total: targetTotal,
    unique: uniquePower,
  };
}

function createNormalWitchCard(row: WitchTemplateRow, raidId: string, bossSlot: BossSlot, deckSlot: number, power: number, raidLevel: number): DuelCardSnapshot {
  const level = Math.min(120, 80 + raidLevel);
  return {
    artKey: row.art_key,
    basePower: power,
    bonusPower: 0,
    cardId: row.id,
    code: row.code,
    displayName: row.display_name,
    element: row.element,
    finalPower: power,
    instanceId: `${raidId}:witch:${bossSlot}:normal:${deckSlot}`,
    level,
    limited: false,
    rarity: raidLevelCardRarity(raidLevel),
  };
}

function createUniqueWitchCard(boss: RaidBossRow, raidId: string, raidLevel: number, power: number): DuelCardSnapshot {
  const cardLevel = Math.min(120, 80 + raidLevel);
  return {
    artKey: boss.art_key ?? boss.code,
    basePower: power,
    bonusPower: 0,
    cardId: boss.card_id,
    code: boss.code,
    displayName: boss.display_name ?? boss.code,
    element: boss.element,
    finalPower: power,
    instanceId: `${raidId}:witch:${boss.slot}:unique:${raidLevel}`,
    level: cardLevel,
    limited: false,
    rarity: raidLevelCardRarity(raidLevel),
    source: "guild",
  };
}

function toBattleView(row: RaidBattleRow): GuildRaidBattleView {
  const playerActiveSlots = activeCards(row.player_active_slots, "player cards");
  const witches = witchActiveCards(row.witch_active_slots);
  return {
    battleId: row.id,
    battleLog: [...row.battle_log].reverse(),
    cardChanges: toSafeInteger(row.card_changes, "card changes"),
    raidLevel: row.raid_level,
    playerActiveCards: playerActiveSlots,
    playerHp: toSafeInteger(row.player_hp, "player HP"),
    playerMaxHp: toSafeInteger(row.player_max_hp, "player max HP"),
    status: row.status,
    targetBossSlot: row.target_boss_slot,
    turnNumber: toSafeInteger(row.turn_number, "raid turn"),
    version: toSafeInteger(row.version, "raid battle version"),
  witchActiveCards: witches,
  };
}

const RAID_BATTLE_COLUMNS = `
  id, raid_id, raid_level, status, version, player_snapshot,
  player_hp, player_max_hp, player_active_slots, player_reserve_queue,
  witch_active_slots, witch_reserve_queues, target_boss_slot,
  witch_unique_cards, player_guild_card,
  battle_log, turn_number, card_changes, heal_thresholds, last_curse_at,
  finished_at`;

export class GuildRaidService {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly random: RandomSource = Math.random,
  ) {}

  private async loadRaid(client: TransactionClient, guildId: string) {
    const result = await client.query<RaidRow>(
      "SELECT id, guild_id, level, status, week_key, started_at, updated_at, heal_thresholds FROM guild_witch_raids WHERE guild_id = $1 FOR UPDATE",
      [guildId],
    );
    return result.rows[0] ?? null;
  }

  private async selectBossCards(client: TransactionClient, excludedCardIds: readonly string[] = []) {
    const result = await client.query<RaidBossRow>(
      `SELECT id AS card_id, code, display_name, art_key, element,
          1 AS slot, 450000 AS max_health, 450000 AS current_health, '[]'::jsonb AS witch_deck
       FROM cards
       WHERE collection_id = $1
       ORDER BY (id = ANY($2::text[])), random()
       LIMIT 2`,
      [WITCH_COLLECTION_ID, excludedCardIds],
    );
    if (result.rows.length !== 2 || result.rows[0]?.card_id === result.rows[1]?.card_id) {
      throw new GuildRaidDomainError("raid_unavailable", "Two Witch raid bosses are not available", 503);
    }
    return result.rows.map((boss, index) => ({ ...boss, slot: (index + 1) as BossSlot }));
  }

  private async createRaid(client: TransactionClient, guildId: string) {
    const bosses = await this.selectBossCards(client);
    const raidId = randomUUID();
    const currentWeek = await this.databaseWeekKey(client);
    await client.query(
      "INSERT INTO guild_witch_raids (id, guild_id, level, status, week_key) VALUES ($1, $2, $3, 'open', $4::date)",
      [raidId, guildId, WITCH_RAID_LEVEL, currentWeek],
    );
    for (const boss of bosses) {
      await client.query(
        `INSERT INTO guild_witch_raid_bosses (raid_id, slot, card_id, max_health, current_health)
         VALUES ($1, $2, $3, $4, $4)`,
        [raidId, boss.slot, boss.card_id, levelHealth(WITCH_RAID_LEVEL)],
      );
    }
    const raid = await this.loadRaid(client, guildId);
    if (!raid) throw new GuildRaidDomainError("raid_invalid", "Guild raid was not created", 503);
    return raid;
  }

  private async resetForNewWeek(client: TransactionClient, raid: RaidRow) {
    const currentBosses = await this.loadBosses(client, raid.id, true);
    const bosses = await this.selectBossCards(client, currentBosses.map((boss) => boss.card_id));
    const currentWeek = await this.databaseWeekKey(client);
    await client.query("DELETE FROM guild_witch_raid_battles WHERE raid_id = $1", [raid.id]);
    await client.query("DELETE FROM guild_witch_raid_participants WHERE raid_id = $1", [raid.id]);
    await client.query(
      `UPDATE guild_witch_raids
       SET level = 1, status = 'open', week_key = $2::date, started_at = NULL, heal_thresholds = '[]'::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [raid.id, currentWeek],
    );
    for (const boss of bosses) {
      await client.query(
        `UPDATE guild_witch_raid_bosses
         SET card_id = $3, max_health = $4, current_health = $4, witch_deck = '[]'::jsonb
         WHERE raid_id = $1 AND slot = $2`,
        [raid.id, boss.slot, boss.card_id, levelHealth(1)],
      );
    }
    const next = await client.query<RaidRow>(
      "SELECT id, guild_id, level, status, week_key, started_at, updated_at, heal_thresholds FROM guild_witch_raids WHERE id = $1 FOR UPDATE",
      [raid.id],
    );
    if (!next.rows[0]) throw new GuildRaidDomainError("raid_invalid", "Guild raid reset failed", 503);
    return next.rows[0];
  }

  private async ensureRaid(client: TransactionClient, guildId: string) {
    let raid = await this.loadRaid(client, guildId);
    if (!raid) raid = await this.createRaid(client, guildId);
    const currentWeek = await this.databaseWeekKey(client);
    if (currentWeek !== storedWeekKey(raid.week_key)) raid = await this.resetForNewWeek(client, raid);
    else await this.replaceForeignBosses(client, raid);
    return raid;
  }

  /**
   * Raids created before the bosses came from «Чотири чаклунки» kept random starter cards.
   * An open raid swaps such bosses for witches at once; a running fight is left alone.
   */
  private async replaceForeignBosses(client: TransactionClient, raid: RaidRow) {
    if (raid.status !== "open") return;
    const foreign = await client.query(
      `SELECT 1 FROM guild_witch_raid_bosses bosses INNER JOIN cards ON cards.id = bosses.card_id
       WHERE bosses.raid_id = $1 AND cards.collection_id IS DISTINCT FROM $2 LIMIT 1`,
      [raid.id, WITCH_COLLECTION_ID],
    );
    if (!foreign.rows.length) return;
    const bosses = await this.selectBossCards(client);
    await client.query("DELETE FROM guild_witch_raid_battles WHERE raid_id = $1 AND status = 'active'", [raid.id]);
    for (const boss of bosses) {
      await client.query(
        `UPDATE guild_witch_raid_bosses
         SET card_id = $3, max_health = $4, current_health = $4, witch_deck = '[]'::jsonb
         WHERE raid_id = $1 AND slot = $2`,
        [raid.id, boss.slot, boss.card_id, levelHealth(raid.level)],
      );
    }
  }

  private async databaseWeekKey(client: TransactionClient) {
    const result = await client.query<{ week_key: string }>("SELECT date_trunc('week', CURRENT_DATE)::date::text AS week_key");
    const value = result.rows[0]?.week_key;
    if (!value) throw new GuildRaidDomainError("raid_invalid", "Current raid week is unavailable", 503);
    return value;
  }

  private async loadBosses(client: TransactionClient, raidId: string, lock = false) {
    const result = await client.query<RaidBossRow>(
      `SELECT raid_bosses.slot, cards.id AS card_id, cards.code, cards.display_name,
          cards.art_key, cards.element, raid_bosses.max_health,
          raid_bosses.current_health, raid_bosses.witch_deck
       FROM guild_witch_raid_bosses raid_bosses
       INNER JOIN cards ON cards.id = raid_bosses.card_id
       WHERE raid_bosses.raid_id = $1
       ORDER BY raid_bosses.slot
       ${lock ? "FOR UPDATE OF raid_bosses" : ""}`,
      [raidId],
    );
    if (result.rows.length !== 2) throw new GuildRaidDomainError("raid_invalid", "Guild raid must have two Witch bosses", 503);
    return result.rows;
  }

  private async expireInactiveParticipants(client: TransactionClient, raidId: string) {
    await client.query(
      `DELETE FROM guild_witch_raid_participants
       WHERE raid_id = $1 AND last_activity_at < NOW() - INTERVAL '15 minutes'`,
      [raidId],
    );
  }

  private async loadLeader(client: TransactionClient, raidId: string, guildId: string) {
    const result = await client.query<RaidParticipantRow>(
      `SELECT participants.player_id, participants.status, participants.joined_at,
          participants.last_activity_at, members.role, members.contributed_xp
       FROM guild_witch_raid_participants participants
       INNER JOIN guild_members members
         ON members.guild_id = $2 AND members.player_id = participants.player_id
       WHERE participants.raid_id = $1 AND participants.status IN ('enrolled', 'active')
       ORDER BY CASE members.role
          WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 WHEN 'veteran' THEN 2
          WHEN 'member' THEN 3 ELSE 4 END,
          members.contributed_xp DESC, participants.joined_at ASC, participants.player_id ASC
       LIMIT 1`,
      [raidId, guildId],
    );
    return result.rows[0] ?? null;
  }

  private async loadParticipant(client: TransactionClient, raidId: string, guildId: string, playerId: string, lock = false) {
    const result = await client.query<RaidParticipantRow>(
      `SELECT participants.player_id, participants.status, participants.joined_at,
          participants.damage_total,
          participants.last_activity_at, members.role, members.contributed_xp
       FROM guild_witch_raid_participants participants
       INNER JOIN guild_members members ON members.guild_id = $2 AND members.player_id = participants.player_id
       WHERE participants.raid_id = $1 AND participants.player_id = $3
       ${lock ? "FOR UPDATE OF participants" : ""}`,
      [raidId, guildId, playerId],
    );
    return result.rows[0] ?? null;
  }

  private async loadBattle(client: TransactionClient, raidId: string, playerId: string, lock = false) {
    const result = await client.query<RaidBattleRow>(
      `SELECT ${RAID_BATTLE_COLUMNS}
       FROM guild_witch_raid_battles
       WHERE raid_id = $1 AND player_id = $2
       ORDER BY created_at DESC
       LIMIT 1${lock ? " FOR UPDATE" : ""}`,
      [raidId, playerId],
    );
    return result.rows[0] ?? null;
  }

  private async ensureWitchDecks(client: TransactionClient, raid: RaidRow, bosses: RaidBossRow[]) {
    const stored = bosses.map((boss) => cardList(boss.witch_deck, `witch ${boss.slot} deck`));
    if (stored.every((deck, index) => isBalancedWitchDeck(deck, bosses[index]!))) {
      return stored as [DuelCardSnapshot[], DuelCardSnapshot[]];
    }
    const templates = await client.query<WitchTemplateRow>(
      `SELECT id, code, display_name, art_key, element
       FROM cards WHERE source = 'standard' AND limited = FALSE ORDER BY id`,
    );
    if (!templates.rows.length) throw new GuildRaidDomainError("raid_unavailable", "Standard witch cards are not available", 503);
    const decks = bosses.map((boss) => {
      const powers = witchDeckPowers(toSafeInteger(boss.max_health, "witch max HP"), raid.level, this.random);
      const normalCards = Array.from({ length: WITCH_NORMAL_CARD_COUNT }, (_, index) => createNormalWitchCard(
        templates.rows[randomIndex(templates.rows.length, this.random)]!, raid.id, boss.slot, index, powers.normal[index]!, raid.level,
      ));
      return [...normalCards, createUniqueWitchCard(boss, raid.id, raid.level, powers.unique)];
    }) as [DuelCardSnapshot[], DuelCardSnapshot[]];
    for (const [index, deck] of decks.entries()) {
      await client.query("UPDATE guild_witch_raid_bosses SET witch_deck = $3 WHERE raid_id = $1 AND slot = $2", [raid.id, index + 1, JSON.stringify(deck)]);
    }
    return decks;
  }

  private async selectTreasureCard(client: TransactionClient) {
    const result = await client.query<RaidRewardCardRow>(
      `SELECT id, code, display_name, art_key, element, collection_id,
          description, limited, min_rarity, shop_eligible
       FROM cards
       WHERE collection_id = $1
       ORDER BY random()
       LIMIT 1`,
      [WITCH_COLLECTION_ID],
    );
    const card = result.rows[0];
    if (!card) throw new GuildRaidDomainError("raid_unavailable", "Witch treasure cards are not available", 503);
    return card;
  }

  /**
   * Victory over a pair: the full damage table is kept and one random participant gets the
   * treasure offer (reference: «Пещера сокровищ», here «Відьмин скарб»).
   */
  private async createRaidResult(client: TransactionClient, raid: RaidRow) {
    const participantsResult = await client.query<RaidParticipantRow>(
      `SELECT participants.player_id, participants.joined_at, participants.damage_total,
          players.first_name, players.username, players.photo_url, players.duel_rating,
          COALESCE(NULLIF(BTRIM(players.username), ''), NULLIF(BTRIM(players.first_name), ''), 'Гравець') AS display_name
       FROM guild_witch_raid_participants participants
       INNER JOIN players ON players.id = participants.player_id
       WHERE participants.raid_id = $1
       ORDER BY participants.damage_total DESC, participants.joined_at ASC, participants.player_id ASC`,
      [raid.id],
    );
    if (!participantsResult.rows.length) throw new GuildRaidDomainError("raid_invalid", "Raid has no participants");

    const participants = participantsResult.rows;
    const resultId = randomUUID();
    const totalDamage = participants.reduce((total, participant) => {
      const next = total + toSafeInteger(participant.damage_total, "raid participant damage");
      if (!Number.isSafeInteger(next)) throw new Error("Raid total damage exceeds safe integer limits");
      return next;
    }, 0);
    const lucky = participants[randomIndex(participants.length, this.random)]!;
    await client.query(
      `INSERT INTO guild_witch_raid_results
         (id, raid_id, raid_level, week_key, participant_count, total_damage, treasure_player_id, treasure_player_name)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)`,
      [resultId, raid.id, raid.level, storedWeekKey(raid.week_key), participants.length, totalDamage, lucky.player_id, lucky.display_name ?? "Гравець"],
    );
    for (const [index, participant] of participants.entries()) {
      await client.query(
        `INSERT INTO guild_witch_raid_result_participants
           (result_id, player_id, display_name, photo_url, joined_at, placement, damage, duel_rating, reward)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'null'::jsonb)`,
        [resultId, participant.player_id, participant.display_name ?? "Гравець", participant.photo_url ?? null, participant.joined_at, index + 1,
          toSafeInteger(participant.damage_total, "raid participant damage"), toSafeInteger(participant.duel_rating, "duel rating")],
      );
    }
    await client.query(
      `INSERT INTO guild_witch_treasures (id, guild_id, result_id, player_id, week_key, level, status)
       VALUES ($1, $2, $3, $4, $5::date, $6, 'offered')`,
      [randomUUID(), raid.guild_id, resultId, lucky.player_id, storedWeekKey(raid.week_key), raid.level],
    );
    await client.query(
      `INSERT INTO guild_activity_log (id, guild_id, event_type, actor_id, target_id, activity_type, amount, detail)
       VALUES ($1, $2, 'witch_raid_won', NULL, $3, NULL, $4, $5)`,
      [randomUUID(), raid.guild_id, lucky.player_id, raid.level, `Відьом ${raid.level} рівня переможено; скарб шукає ${lucky.display_name ?? "Гравець"}`],
    );
  }

  private async loadLatestRaidResult(client: TransactionClient, raid: RaidRow): Promise<GuildRaidResultView | null> {
    const result = await client.query<RaidResultRow>(
      `SELECT id, raid_level, participant_count, total_damage, completed_at, treasure_player_id, treasure_player_name
       FROM guild_witch_raid_results
       WHERE raid_id = $1 AND week_key = $2::date
       ORDER BY completed_at DESC
       LIMIT 1`,
      [raid.id, storedWeekKey(raid.week_key)],
    );
    const row = result.rows[0];
    if (!row) return null;
    const participants = await client.query<RaidResultParticipantRow>(
      `SELECT player_id, display_name, photo_url, joined_at, placement, damage, duel_rating, reward
       FROM guild_witch_raid_result_participants
       WHERE result_id = $1
       ORDER BY placement ASC`,
      [row.id],
    );
    return {
      completedAt: toDateString(row.completed_at),
      id: row.id,
      level: row.raid_level,
      participantCount: toSafeInteger(row.participant_count, "raid result participant count"),
      participants: participants.rows.map((participant) => ({
        damage: toSafeInteger(participant.damage, "raid result damage"),
        displayName: participant.display_name,
        duelRating: toSafeInteger(participant.duel_rating, "raid result duel rating"),
        joinedAt: toDateString(participant.joined_at),
        photoUrl: participant.photo_url,
        placement: participant.placement,
        playerId: participant.player_id,
        ...(participant.reward && typeof participant.reward === "object" ? { reward: participant.reward as NonNullable<GuildRaidResultView["participants"][number]["reward"]> } : {}),
      })),
      totalDamage: toSafeInteger(row.total_damage, "raid result total damage"),
      treasurePlayer: row.treasure_player_id ? { displayName: row.treasure_player_name ?? "Гравець", playerId: row.treasure_player_id } : null,
    };
  }

  private async buildView(client: TransactionClient, raid: RaidRow, viewerId?: string): Promise<GuildRaidView> {
    if (raid.status === "open") await this.expireInactiveParticipants(client, raid.id);
    const guildLevel = await this.guildLevel(client, raid.guild_id);
    const treasure = viewerId ? await this.resolveTreasure(client, raid.guild_id, viewerId) : null;
    const bosses = await this.loadBosses(client, raid.id);
    const participantCount = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM guild_witch_raid_participants participants
       INNER JOIN guild_members members
         ON members.guild_id = $2 AND members.player_id = participants.player_id
       WHERE participants.raid_id = $1 AND participants.status IN ('enrolled', 'active')`,
      [raid.id, raid.guild_id],
    );
    const damageLeaderboard = await client.query<Pick<RaidParticipantRow, "damage_total" | "display_name" | "photo_url" | "player_id" | "duel_rating">>(
      `SELECT participants.player_id, participants.damage_total,
          players.photo_url, players.duel_rating,
          COALESCE(NULLIF(BTRIM(players.username), ''), NULLIF(BTRIM(players.first_name), ''), 'Гравець') AS display_name
       FROM guild_witch_raid_participants participants
       INNER JOIN guild_members members
         ON members.guild_id = $2 AND members.player_id = participants.player_id
       INNER JOIN players ON players.id = participants.player_id
       WHERE participants.raid_id = $1
       ORDER BY participants.damage_total DESC, participants.joined_at ASC, participants.player_id ASC`,
      [raid.id, raid.guild_id],
    );
    const leader = await this.loadLeader(client, raid.id, raid.guild_id);
    const participant = viewerId ? await this.loadParticipant(client, raid.id, raid.guild_id, viewerId) : null;
    const battle = viewerId ? await this.loadBattle(client, raid.id, viewerId) : null;
    const lastResult = raid.status === "open" ? await this.loadLatestRaidResult(client, raid) : null;
    const enrollment: GuildRaidEnrollmentView = {
      canStart: Boolean(viewerId && participant && leader?.player_id === viewerId && raid.status === "open"),
      enrolled: Boolean(participant),
      leaderId: leader?.player_id ?? null,
      participantCount: toSafeInteger(participantCount.rows[0]?.count ?? 0, "raid participant count"),
    };
    return {
      guildLevel,
      treasure,
      unlockLevel: WITCH_RAID_MIN_GUILD_LEVEL,
      unlocked: guildLevel >= WITCH_RAID_MIN_GUILD_LEVEL,
      bosses: bosses.map((boss) => ({
        artKey: boss.art_key ?? boss.code,
        cardId: boss.card_id,
        code: boss.code,
        currentHealth: toSafeInteger(boss.current_health, "witch current HP"),
        displayName: boss.display_name ?? boss.code,
        element: boss.element,
        health: toSafeInteger(boss.max_health, "witch max HP"),
        level: raid.level,
      })),
      battle: battle ? toBattleView(battle) : null,
      damageLeaderboard: damageLeaderboard.rows.map((participant): GuildRaidDamageParticipantView => ({
        damage: toSafeInteger(participant.damage_total, "raid participant damage"),
        displayName: participant.display_name ?? "Гравець",
        duelRating: toSafeInteger(participant.duel_rating, "duel rating"),
        photoUrl: participant.photo_url ?? null,
        playerId: participant.player_id,
      })),
      enrollment,
      id: raid.id,
      level: raid.level,
      nextLevel: nextRaidLevel(raid.level),
      lastResult,
      name: "Відьми",
      status: raid.status,
    };
  }

  /**
   * Reference: «при поражении — повторно атаковать ведьм текущего уровня». When nobody is left standing
   * the attempt is lost: the witches heal fully, their decks are dealt anew and the leader reopens the level.
   * Signees who never began a battle drop out after 15 idle minutes so they cannot keep a lost raid alive.
   */
  private async restartIfEveryoneFell(client: TransactionClient, raid: RaidRow) {
    if (raid.status !== "active") return false;
    const anyFallen = await client.query("SELECT 1 FROM guild_witch_raid_participants WHERE raid_id = $1 AND status = 'defeated' LIMIT 1", [raid.id]);
    if (!anyFallen.rows.length) return false;
    await client.query(
      `DELETE FROM guild_witch_raid_participants participants
       WHERE participants.raid_id = $1 AND participants.status IN ('enrolled', 'active')
         AND participants.last_activity_at < NOW() - INTERVAL '15 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM guild_witch_raid_battles battles
           WHERE battles.raid_id = participants.raid_id AND battles.player_id = participants.player_id AND battles.status = 'active'
         )`,
      [raid.id],
    );
    const standing = await client.query<{ alive: string; fallen: string }>(
      `SELECT COUNT(*) FILTER (WHERE status IN ('enrolled', 'active', 'finished')) AS alive,
          COUNT(*) FILTER (WHERE status = 'defeated') AS fallen
       FROM guild_witch_raid_participants WHERE raid_id = $1`,
      [raid.id],
    );
    const alive = Number(standing.rows[0]?.alive ?? 0);
    const fallen = Number(standing.rows[0]?.fallen ?? 0);
    if (alive > 0 || fallen === 0) return false;
    await client.query(
      "UPDATE guild_witch_raids SET status = 'open', started_at = NULL, heal_thresholds = '[]'::jsonb, updated_at = NOW() WHERE id = $1",
      [raid.id],
    );
    await client.query("UPDATE guild_witch_raid_bosses SET current_health = max_health, witch_deck = '[]'::jsonb WHERE raid_id = $1", [raid.id]);
    await client.query(
      "UPDATE guild_witch_raid_participants SET status = 'enrolled', damage_total = 0, last_activity_at = NOW() WHERE raid_id = $1",
      [raid.id],
    );
    return true;
  }

  private async guildLevel(client: TransactionClient, guildId: string) {
    const result = await client.query<{ level: number }>("SELECT level FROM guilds WHERE id = $1", [guildId]);
    return result.rows[0]?.level ?? 1;
  }

  /** Witch raids open at guild level 34 (reference). */
  private async assertUnlocked(client: TransactionClient, guildId: string) {
    if (await this.guildLevel(client, guildId) < WITCH_RAID_MIN_GUILD_LEVEL) {
      throw new GuildRaidDomainError("raid_locked", `Witch raids open at guild level ${WITCH_RAID_MIN_GUILD_LEVEL}`, 403);
    }
  }

  private async assertNotDigging(client: TransactionClient, playerId: string) {
    const digging = await client.query("SELECT 1 FROM guild_witch_treasures WHERE player_id = $1 AND status = 'digging' AND dig_ends_at > NOW()", [playerId]);
    if (digging.rows.length) throw new GuildRaidDomainError("raid_treasure_digging", "You are digging the treasure", 409);
  }

  /** Expires old offers, pays finished digs into the mail and returns the viewer's newest treasure this week. */
  private async resolveTreasure(client: TransactionClient, guildId: string, playerId: string): Promise<GuildWitchTreasureView | null> {
    await client.query(
      `UPDATE guild_witch_treasures SET status = 'expired', resolved_at = NOW()
       WHERE player_id = $1 AND status = 'offered' AND week_key < date_trunc('week', CURRENT_DATE)::date`,
      [playerId],
    );
    const due = await client.query<{ id: string; level: number }>(
      "SELECT id, level FROM guild_witch_treasures WHERE player_id = $1 AND status = 'digging' AND dig_ends_at <= NOW() FOR UPDATE",
      [playerId],
    );
    for (const row of due.rows) await this.payTreasure(client, row.id, playerId, row.level);
    const latest = await client.query<{
      id: string;
      level: number;
      status: GuildWitchTreasureView["status"];
      week_key: string | Date;
      dig_ends_at: string | Date | null;
      reward: GuildWitchTreasureView["reward"];
      mail_id: string | null;
    }>(
      `SELECT id, level, status, week_key, dig_ends_at, reward, mail_id FROM guild_witch_treasures
       WHERE player_id = $1 AND guild_id = $2 AND week_key = date_trunc('week', CURRENT_DATE)::date
       ORDER BY CASE status WHEN 'digging' THEN 0 WHEN 'offered' THEN 1 ELSE 2 END, offered_at DESC LIMIT 1`,
      [playerId, guildId],
    );
    const row = latest.rows[0];
    if (!row) return null;
    const peaceful = await hasCompletedCollection(client, playerId, PEACEFUL_DWARVES_COLLECTION_ID);
    const weekEnd = new Date(`${storedWeekKey(row.week_key)}T00:00:00.000Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    return {
      availableUntil: row.status === "offered" ? weekEnd.toISOString() : row.dig_ends_at ? toDateString(row.dig_ends_at) : null,
      digEndsAt: row.dig_ends_at ? toDateString(row.dig_ends_at) : null,
      digMinutes: getWitchTreasureDigMinutes(row.level, peaceful),
      id: row.id,
      level: row.level,
      mailId: row.mail_id,
      reward: row.reward ?? null,
      status: row.status,
    };
  }

  private async payTreasure(client: TransactionClient, treasureId: string, playerId: string, level: number) {
    const treasure = rollWitchTreasure(level, this.random);
    let reward: GuildWitchTreasureView["reward"];
    let mailId: string | null;
    if (treasure.kind === "card") {
      const card = await this.selectTreasureCard(client);
      const rewardCard: PlayerMailCardReward = { artKey: card.art_key, cardId: card.id, code: card.code, displayName: card.display_name, element: card.element, level: treasure.level };
      const mail = await client.query<{ id: string }>(
        `INSERT INTO player_mail (id, player_id, subject, body, silver, gold, card_id, card_level, card_bonus_power, source_key)
         VALUES ($1, $2, 'Відьмин скарб', $3, 0, 0, $4, $5, $6, $7)
         ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO UPDATE SET source_key = EXCLUDED.source_key RETURNING id`,
        [randomUUID(), playerId, `Скарб відьом ${level} рівня викопано. Заберіть карту в пошті.`, card.id, treasure.level, treasure.bonusPower, `guild-witch-treasure:${treasureId}`],
      );
      mailId = mail.rows[0]?.id ?? null;
      reward = { bonusPower: treasure.bonusPower, card: rewardCard, kind: "card" };
    } else {
      const mail = await client.query<{ id: string }>(
        `INSERT INTO player_mail (id, player_id, subject, body, silver, gold, source_key)
         VALUES ($1, $2, 'Відьмин скарб', $3, $4, $5, $6)
         ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO UPDATE SET source_key = EXCLUDED.source_key RETURNING id`,
        [randomUUID(), playerId, `Скарб відьом ${level} рівня викопано. Заберіть його в пошті.`,
          treasure.kind === "silver" ? treasure.amount : 0, treasure.kind === "gold" ? treasure.amount : 0, `guild-witch-treasure:${treasureId}`],
      );
      mailId = mail.rows[0]?.id ?? null;
      reward = { amount: treasure.amount, kind: treasure.kind };
    }
    await client.query(
      "UPDATE guild_witch_treasures SET status = 'claimed', reward = $2, mail_id = $3, resolved_at = NOW() WHERE id = $1",
      [treasureId, JSON.stringify(reward), mailId],
    );
  }

  /** Start digging the offered treasure (witch battles wait until it is done) or give it up for good. */
  async treasureDecision(playerId: string, guildId: string, treasureId: string, dig: boolean) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guild = await client.query<{ id: string }>("SELECT id FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
      if (!guild.rows[0]) throw new GuildRaidDomainError("guild_not_found", "Guild does not exist", 404);
      const row = await client.query<{ level: number; status: string }>(
        `SELECT level, status FROM guild_witch_treasures WHERE id = $1 AND player_id = $2 AND guild_id = $3
           AND week_key = date_trunc('week', CURRENT_DATE)::date FOR UPDATE`,
        [treasureId, playerId, guildId],
      );
      const treasure = row.rows[0];
      if (!treasure || treasure.status !== "offered") throw new GuildRaidDomainError("raid_treasure_unavailable", "This treasure is no longer available");
      if (dig) {
        await this.assertNotDigging(client, playerId);
        const active = await client.query(
          `SELECT 1 FROM guild_witch_raid_battles battles INNER JOIN guild_witch_raids raids ON raids.id = battles.raid_id
           WHERE battles.player_id = $1 AND battles.status = 'active' AND raids.guild_id = $2`,
          [playerId, guildId],
        );
        if (active.rows.length) throw new GuildRaidDomainError("raid_state_conflict", "Finish the current witch battle first");
        const minutes = getWitchTreasureDigMinutes(treasure.level, await hasCompletedCollection(client, playerId, PEACEFUL_DWARVES_COLLECTION_ID));
        await client.query(
          "UPDATE guild_witch_treasures SET status = 'digging', dig_started_at = NOW(), dig_ends_at = NOW() + make_interval(mins => $2) WHERE id = $1",
          [treasureId, minutes],
        );
      } else {
        await client.query("UPDATE guild_witch_treasures SET status = 'declined', resolved_at = NOW() WHERE id = $1", [treasureId]);
      }
      const raid = await this.ensureRaid(client, guildId);
      const view = await this.buildView(client, raid, playerId);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildRaidDomainError) throw error;
      throw new GuildRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  /** «Змінити карти» on the field for 10 gold, any number of times. */
  async swapCards(playerId: string, guildId: string, battleId: string, input: GuildRaidSwapRequest) {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new GuildRaidDomainError("raid_invalid", "Raid battle version is invalid", 400);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guild = await client.query<{ id: string }>("SELECT id FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
      if (!guild.rows[0]) throw new GuildRaidDomainError("guild_not_found", "Guild does not exist", 404);
      const battleResult = await client.query<RaidBattleRow>(
        `SELECT ${RAID_BATTLE_COLUMNS} FROM guild_witch_raid_battles
         WHERE id = $1 AND raid_id IN (SELECT id FROM guild_witch_raids WHERE guild_id = $2) AND player_id = $3 FOR UPDATE`,
        [battleId, guildId, playerId],
      );
      const battle = battleResult.rows[0];
      if (!battle) throw new GuildRaidDomainError("raid_battle_not_found", "Raid battle does not exist", 404);
      if (battle.status !== "active" || battle.version !== input.expectedVersion) throw new GuildRaidDomainError("raid_state_conflict", "Raid battle state is stale", 409);
      const paid = await client.query("UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold", [playerId, RAID_CARD_SWAP_GOLD]);
      if (!paid.rows.length) throw new GuildRaidDomainError("raid_insufficient_gold", "Not enough gold to change cards");
      let pool = { activeCards: activeCards(battle.player_active_slots, "player cards"), reserveQueue: cardList(battle.player_reserve_queue, "player queue") };
      for (const slot of [0, 1, 2] as const) pool = cycleCardPoolSlot(pool, slot);
      const log = [...battle.battle_log];
      this.addLog(log, { id: randomUUID(), kind: "swap", playerDamage: 0, text: `Карти змінено за ${RAID_CARD_SWAP_GOLD} золота`, turnNumber: toSafeInteger(battle.turn_number, "raid turn"), witchDamage: 0 });
      await client.query(
        `UPDATE guild_witch_raid_battles SET version = version + 1, card_changes = card_changes + 1,
           player_active_slots = $2, player_reserve_queue = $3, battle_log = $4, updated_at = NOW() WHERE id = $1`,
        [battle.id, JSON.stringify(pool.activeCards), JSON.stringify(pool.reserveQueue), JSON.stringify(log)],
      );
      const raidResult = await client.query<RaidRow>(
        "SELECT id, guild_id, level, status, week_key, started_at, updated_at, heal_thresholds FROM guild_witch_raids WHERE id = $1",
        [battle.raid_id],
      );
      const raid = raidResult.rows[0];
      if (!raid) throw new GuildRaidDomainError("raid_invalid", "Raid state disappeared", 503);
      const view = await this.buildView(client, raid, playerId);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildRaidDomainError) throw error;
      throw new GuildRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async getActiveRaid(guildId: string, viewerId?: string): Promise<GuildRaidView> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new GuildRaidPersistenceError({ cause: error });
    }
    try {
      await client.query("BEGIN");
      const guild = await client.query<{ id: string }>("SELECT id FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
      if (!guild.rows[0]) throw new GuildRaidDomainError("guild_not_found", "Guild does not exist", 404);
      let raid = await this.ensureRaid(client, guildId);
      if (raid.status === "active" && await this.restartIfEveryoneFell(client, raid)) {
        raid = (await this.loadRaid(client, guildId)) ?? raid;
      }
      const view = await this.buildView(client, raid, viewerId);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildRaidDomainError) throw error;
      throw new GuildRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async enroll(playerId: string, guildId: string) {
    return this.changeEnrollment(playerId, guildId, true);
  }

  async leave(playerId: string, guildId: string) {
    return this.changeEnrollment(playerId, guildId, false);
  }

  private async changeEnrollment(playerId: string, guildId: string, enroll: boolean) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guild = await client.query<{ id: string }>("SELECT id FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
      if (!guild.rows[0]) throw new GuildRaidDomainError("guild_not_found", "Guild does not exist", 404);
      const member = await client.query<{ player_id: string }>(
        "SELECT player_id FROM guild_members WHERE guild_id = $1 AND player_id = $2 FOR UPDATE",
        [guildId, playerId],
      );
      if (!member.rows[0]) throw new GuildRaidDomainError("raid_not_member", "Only guild members can join this raid", 403);
      const raid = await this.ensureRaid(client, guildId);
      if (enroll) {
        await this.assertUnlocked(client, guildId);
        await this.assertNotDigging(client, playerId);
        if (raid.status !== "open" && raid.status !== "active") throw new GuildRaidDomainError("raid_not_open", "The guild event is already complete");
        const participantStatus = raid.status === "active" ? "active" : "enrolled";
        await client.query(
          `INSERT INTO guild_witch_raid_participants (raid_id, player_id, status, last_activity_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (raid_id, player_id)
           DO UPDATE SET
             status = CASE
               WHEN guild_witch_raid_participants.status IN ('defeated', 'finished') THEN EXCLUDED.status
               ELSE guild_witch_raid_participants.status
             END,
             last_activity_at = NOW()`,
          [raid.id, playerId, participantStatus],
        );
      } else {
        if (raid.status !== "open") throw new GuildRaidDomainError("raid_not_open", "The guild event is already active");
        const battle = await this.loadBattle(client, raid.id, playerId, true);
        if (battle?.status === "active") throw new GuildRaidDomainError("raid_not_open", "You cannot leave during an active battle");
        await client.query("DELETE FROM guild_witch_raid_participants WHERE raid_id = $1 AND player_id = $2", [raid.id, playerId]);
      }
      const view = await this.buildView(client, raid, playerId);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildRaidDomainError) throw error;
      throw new GuildRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async startRaid(playerId: string, guildId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guild = await client.query<{ id: string }>("SELECT id FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
      if (!guild.rows[0]) throw new GuildRaidDomainError("guild_not_found", "Guild does not exist", 404);
      const member = await client.query<{ player_id: string }>("SELECT player_id FROM guild_members WHERE guild_id = $1 AND player_id = $2", [guildId, playerId]);
      if (!member.rows[0]) throw new GuildRaidDomainError("raid_not_member", "Only guild members can start this raid", 403);
      await this.assertUnlocked(client, guildId);
      const raid = await this.ensureRaid(client, guildId);
      if (raid.status !== "open") throw new GuildRaidDomainError("raid_not_open", "The raid is already in progress");
      await this.expireInactiveParticipants(client, raid.id);
      const participant = await this.loadParticipant(client, raid.id, guildId, playerId);
      if (!participant) throw new GuildRaidDomainError("raid_not_enrolled", "Join the raid before starting it");
      const leader = await this.loadLeader(client, raid.id, guildId);
      if (!leader || leader.player_id !== playerId) throw new GuildRaidDomainError("raid_not_leader", "Only the raid leader can start this raid", 403);
      const bosses = await this.loadBosses(client, raid.id, true);
      if (bosses.every((boss) => toSafeInteger(boss.current_health, "witch current HP") === 0)) throw new GuildRaidDomainError("raid_invalid", "This raid level is already complete");
      await client.query("UPDATE guild_witch_raids SET status = 'active', started_at = NOW(), updated_at = NOW() WHERE id = $1", [raid.id]);
      await client.query("UPDATE guild_witch_raid_participants SET status = 'active', last_activity_at = NOW() WHERE raid_id = $1", [raid.id]);
      const nextRaid = { ...raid, status: "active" as const, started_at: new Date() };
      const view = await this.buildView(client, nextRaid, playerId);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildRaidDomainError) throw error;
      throw new GuildRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async startBattle(playerId: string, guildId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guild = await client.query<{ id: string }>("SELECT id FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
      if (!guild.rows[0]) throw new GuildRaidDomainError("guild_not_found", "Guild does not exist", 404);
      await this.assertUnlocked(client, guildId);
      await this.assertNotDigging(client, playerId);
      const raid = await this.ensureRaid(client, guildId);
      if (raid.status !== "active") throw new GuildRaidDomainError("raid_not_active", "The raid must be started by its leader first");
      const participant = await this.loadParticipant(client, raid.id, guildId, playerId, true);
      if (!participant) throw new GuildRaidDomainError("raid_not_enrolled", "Join the raid before fighting");
      const current = await this.loadBattle(client, raid.id, playerId, true);
      if (current?.status === "active") {
        const view = await this.buildView(client, raid, playerId);
        await client.query("COMMIT");
        return view;
      }
      // Reference: after a fall the player waits for the next attempt; only a lost raid restarts the level.
      if (participant.status === "defeated") throw new GuildRaidDomainError("raid_battle_finished", "You have already fallen in this attempt");
      const loaded = await loadDuelParticipant(client, playerId, "guild_raid").catch((error: unknown) => {
        if (error instanceof DuelDeckInvalidError) throw new GuildRaidDomainError("raid_deck_invalid", "Потрібна повна бойова колода 3/2/2/2", 409);
        throw error;
      });
      // Extra cards fight witches and count towards the player's HP (reference): the guild card joins the cycle.
      const guildCard = toGuildDuelCard(loaded.guildCard);
      if (guildCard) loaded.snapshot.startingHp += guildCard.finalPower;
      // Title «Мисливець на драконів»: +10% to all cards in guild raids, witches included.
      if (await hasDragonHunterTitle(client, playerId)) applyDragonHunterTitle(loaded.snapshot, guildCard);
      // «Гноми на війні»: +10% card power and player HP in witch raids.
      if (await hasCompletedCollection(client, playerId, WAR_DWARVES_COLLECTION_ID)) {
        loaded.snapshot.cards = loaded.snapshot.cards.map((card) => ({ ...card, finalPower: Math.round(card.finalPower * (100 + WAR_DWARVES_PCT) / 100) }));
        if (guildCard) guildCard.finalPower = Math.round(guildCard.finalPower * (100 + WAR_DWARVES_PCT) / 100);
        loaded.snapshot.startingHp = Math.round(loaded.snapshot.startingHp * (100 + WAR_DWARVES_PCT) / 100);
      }
      const bosses = await this.loadBosses(client, raid.id, true);
      const witchDecks = await this.ensureWitchDecks(client, raid, bosses);
      const playerPool = initializeCyclicCardPool(loaded.snapshot.cards, this.random);
      const witchPools = witchDecks.map((deck) => initializeCyclicCardPool(deck.slice(0, 9), this.random)) as [
        CyclicCardPool<DuelCardSnapshot>, CyclicCardPool<DuelCardSnapshot>,
      ];
      const witchUniqueCards = witchDecks.map((deck) => deck[9] ?? null) as [DuelCardSnapshot, DuelCardSnapshot];
      await client.query(
        `INSERT INTO guild_witch_raid_battles (
           id, raid_id, player_id, raid_level, status, player_snapshot,
           player_hp, player_max_hp, player_active_slots, player_reserve_queue,
           witch_active_slots, witch_reserve_queues, target_boss_slot, witch_unique_cards,
           battle_log, turn_number, card_changes, heal_thresholds, last_curse_at, player_guild_card
         ) VALUES ($1, $2, $3, $4, 'active', $5, $6, $6, $7, $8, $9, $10, 1, $11, '[]'::jsonb, 0, 0, '[]'::jsonb, NOW(), $12)`,
        [
          randomUUID(), raid.id, playerId, raid.level, JSON.stringify(loaded.snapshot), loaded.snapshot.startingHp,
          JSON.stringify(playerPool.activeCards), JSON.stringify(playerPool.reserveQueue),
          JSON.stringify(witchPools.map((pool) => pool.activeCards)), JSON.stringify(witchPools.map((pool) => pool.reserveQueue)),
          JSON.stringify(witchUniqueCards),
          guildCard ? JSON.stringify(guildCard) : null,
        ],
      );
      await client.query("UPDATE guild_witch_raid_participants SET status = 'active', last_activity_at = NOW() WHERE raid_id = $1 AND player_id = $2", [raid.id, playerId]);
      const view = await this.buildView(client, raid, playerId);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildRaidDomainError) throw error;
      throw new GuildRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  private addLog(log: GuildRaidBattleLogEntry[], entry: GuildRaidBattleLogEntry) {
    log.push(entry);
    if (log.length > MAX_BATTLE_LOG_ENTRIES) log.splice(0, log.length - MAX_BATTLE_LOG_ENTRIES);
  }

  private async advanceRaidLevel(client: TransactionClient, raid: RaidRow) {
    const nextLevel = nextRaidLevel(raid.level);
    const currentBosses = await this.loadBosses(client, raid.id, true);
    const bosses = await this.selectBossCards(client, currentBosses.map((boss) => boss.card_id));
    await client.query("UPDATE guild_witch_raids SET level = $2, status = 'open', started_at = NULL, heal_thresholds = '[]'::jsonb, updated_at = NOW() WHERE id = $1", [raid.id, nextLevel]);
    await client.query("DELETE FROM guild_witch_raid_battles WHERE raid_id = $1 AND status = 'active'", [raid.id]);
    await client.query("UPDATE guild_witch_raid_participants SET status = 'enrolled', damage_total = 0, last_activity_at = NOW() WHERE raid_id = $1", [raid.id]);
    for (const boss of bosses) {
      await client.query(
        `UPDATE guild_witch_raid_bosses
         SET card_id = $3, max_health = $4, current_health = $4, witch_deck = '[]'::jsonb
         WHERE raid_id = $1 AND slot = $2`,
        [raid.id, boss.slot, boss.card_id, levelHealth(nextLevel)],
      );
    }
  }

  async action(playerId: string, guildId: string, battleId: string, input: GuildRaidActionRequest) {
    assertBossSlot(input.bossSlot);
    assertCardSlot(input.slotIndex);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new GuildRaidDomainError("raid_invalid", "Raid battle version is invalid", 400);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guild = await client.query<{ id: string }>("SELECT id FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
      if (!guild.rows[0]) throw new GuildRaidDomainError("guild_not_found", "Guild does not exist", 404);
      const battleResult = await client.query<RaidBattleRow>(
        `SELECT ${RAID_BATTLE_COLUMNS}
         FROM guild_witch_raid_battles
         WHERE id = $1 AND raid_id IN (SELECT id FROM guild_witch_raids WHERE guild_id = $2) AND player_id = $3
         FOR UPDATE`,
        [battleId, guildId, playerId],
      );
      const battle = battleResult.rows[0];
      if (!battle) throw new GuildRaidDomainError("raid_battle_not_found", "Raid battle does not exist", 404);
      const raidResult = await client.query<RaidRow>(
        "SELECT id, guild_id, level, status, week_key, started_at, updated_at, heal_thresholds FROM guild_witch_raids WHERE id = $1 FOR UPDATE",
        [battle.raid_id],
      );
      const raid = raidResult.rows[0];
      if (!raid || raid.guild_id !== guildId) throw new GuildRaidDomainError("raid_battle_not_found", "Raid battle does not exist", 404);
      if (battle.status !== "active" || raid.status !== "active" || battle.version !== input.expectedVersion) throw new GuildRaidDomainError("raid_state_conflict", "Raid battle state is stale", 409);
      const participant = await this.loadParticipant(client, raid.id, guildId, playerId, true);
      if (!participant) throw new GuildRaidDomainError("raid_not_member", "You are not a raid participant", 403);
      const bosses = await this.loadBosses(client, raid.id, true);
      const healthBefore = bosses.map((boss) => toSafeInteger(boss.current_health, "witch current HP")) as [number, number];
      const health = [...healthBefore] as [number, number];
      const playerCards = activeCards(battle.player_active_slots, "player cards");
      const playerQueue = cardList(battle.player_reserve_queue, "player queue");
      const witchCards = witchActiveCards(battle.witch_active_slots);
      const witchQueues = witchReserveQueues(battle.witch_reserve_queues);
      const uniqueCards = parseWitchUniqueCards(battle.witch_unique_cards);
      const battleLog = [...battle.battle_log];
      // Healing triggers once per threshold for the whole raid level, not per player battle.
      const healThresholds = new Set(raid.heal_thresholds ?? []);
      let playerGuildCard = battle.player_guild_card ?? null;
      let playerHp = toSafeInteger(battle.player_hp, "player HP");
      let lastCurseAt = new Date(battle.last_curse_at).getTime();
      const now = Date.now();
      let curseCount = 0;
      // «Гноми на відпочинку» halve the witches' curse (10% → 5% of max HP).
      const curseDue = lastCurseAt + CURSE_INTERVAL_MS <= now;
      const peacefulDwarves = curseDue && await hasCompletedCollection(client, playerId, PEACEFUL_DWARVES_COLLECTION_ID);
      const curseDamagePct = peacefulDwarves ? CURSE_DAMAGE_PCT / 2 : CURSE_DAMAGE_PCT;
      while (lastCurseAt + CURSE_INTERVAL_MS <= now && curseCount < MAX_BATTLE_LOG_ENTRIES) {
        lastCurseAt += CURSE_INTERVAL_MS;
        curseCount += 1;
        const curseDamage = Math.min(playerHp, Math.max(1, Math.round(toSafeInteger(battle.player_max_hp, "player max HP") * curseDamagePct / 100)));
        playerHp = Math.max(0, playerHp - curseDamage);
        this.addLog(battleLog, { id: randomUUID(), kind: "curse", playerDamage: 0, text: `Прокляття: −${curseDamage} HP`, turnNumber: toSafeInteger(battle.turn_number, "raid turn"), witchDamage: curseDamage });
      }
      let status: GuildRaidBattleStatus = "active";
      let nextTurn = toSafeInteger(battle.turn_number, "raid turn");
      let playerDamageDealt = 0;
      if (playerHp > 0 && health[input.bossSlot - 1] === 0) {
        throw new GuildRaidDomainError("raid_target_defeated", "The selected Witch is already defeated");
      }
      if (playerHp > 0) {
        const targetIndex = input.bossSlot - 1;
        const playerCard = playerCards[input.slotIndex]!;
        const witchCard = witchCards[targetIndex]![input.slotIndex]!;
        const playerAttack = calculateDuelDamage({
          attackerElement: playerCard.element,
          attackerElementDamagePct: battle.player_snapshot.modifiers.elementDamagePct[playerCard.element],
          attackerFinalPower: playerCard.finalPower,
          battleDamagePct: battle.player_snapshot.modifiers.battleDamagePct,
          defenderElement: witchCard.element,
        });
        const witchAttack = calculateDuelDamage({
          attackerElement: witchCard.element,
          attackerElementDamagePct: 0,
          attackerFinalPower: witchCard.finalPower,
          battleDamagePct: 0,
          defenderElement: playerCard.element,
        });
        health[targetIndex] = Math.max(0, health[targetIndex]! - playerAttack.damage);
        playerDamageDealt = healthBefore[targetIndex]! - health[targetIndex]!;
        playerHp = Math.max(0, playerHp - witchAttack.damage);
        const playerPoolResult = cycleCardPoolSlotWithGuildCard(
          { activeCards: playerCards, reserveQueue: playerQueue },
          input.slotIndex,
          playerGuildCard,
          this.random,
        );
        if (playerPoolResult.guildCardAppeared) playerGuildCard = null;
        const playerPool = playerPoolResult.pool;
        const witchPoolResult = cycleCardPoolSlotWithGuildCard(
          { activeCards: witchCards[targetIndex]!, reserveQueue: witchQueues[targetIndex]! },
          input.slotIndex,
          uniqueCards[targetIndex],
          this.random,
        );
        if (witchPoolResult.guildCardAppeared) uniqueCards[targetIndex] = null;
        const witchPool = witchPoolResult.pool;
        playerCards.splice(0, playerCards.length, ...playerPool.activeCards);
        playerQueue.splice(0, playerQueue.length, ...playerPool.reserveQueue);
        witchCards[targetIndex] = witchPool.activeCards;
        witchQueues[targetIndex] = witchPool.reserveQueue;
        nextTurn += 1;
        this.addLog(battleLog, {
          attackerCard: playerCard,
          defenderCard: witchCard,
          id: randomUUID(),
          kind: "attack",
          multiplier: getElementMultiplier(playerCard.element, witchCard.element),
          playerDamage: playerAttack.damage,
          slotIndex: input.slotIndex,
          targetBossSlot: input.bossSlot,
          text: `Удар по відьмі ${input.bossSlot}: −${playerAttack.damage}`,
          turnNumber: nextTurn,
          witchDamage: witchAttack.damage,
          witchMultiplier: getElementMultiplier(witchCard.element, playerCard.element),
        });
        for (let bossIndex = 0; bossIndex < health.length; bossIndex += 1) {
          const maxHealth = toSafeInteger(bosses[bossIndex]!.max_health, "witch max HP");
          for (const threshold of HEAL_THRESHOLDS) {
            const key = `${bossIndex + 1}:${threshold}`;
            if (health[bossIndex] === 0 || healThresholds.has(key) || healthBefore[bossIndex]! <= maxHealth * threshold || health[bossIndex]! > maxHealth * threshold) continue;
            healThresholds.add(key);
            const otherIndex = bossIndex === 0 ? 1 : 0;
            if (health[otherIndex]! > health[bossIndex]!) {
              health[bossIndex] = health[otherIndex]!;
              this.addLog(battleLog, { id: randomUUID(), kind: "heal", playerDamage: 0, targetBossSlot: (bossIndex + 1) as BossSlot, text: `Відьма ${bossIndex + 1} відновила здоров’я`, turnNumber: nextTurn, witchDamage: 0 });
            }
          }
        }
        if (health.every((value) => value === 0)) {
          status = "won";
          this.addLog(battleLog, { id: randomUUID(), kind: "death", playerDamage: 0, text: "Обидві відьми переможені", turnNumber: nextTurn, witchDamage: 0 });
        } else if (playerHp === 0) {
          status = "lost";
          this.addLog(battleLog, { id: randomUUID(), kind: "death", playerDamage: 0, text: "Гравець вибув із бою", turnNumber: nextTurn, witchDamage: 0 });
        }
      } else {
        status = "lost";
        this.addLog(battleLog, { id: randomUUID(), kind: "death", playerDamage: 0, text: "Гравець вибув із бою", turnNumber: nextTurn, witchDamage: 0 });
      }
      for (const [index, boss] of bosses.entries()) {
        await client.query("UPDATE guild_witch_raid_bosses SET current_health = $3 WHERE raid_id = $1 AND slot = $2", [raid.id, boss.slot, health[index]]);
      }
      if (playerDamageDealt > 0) {
        await client.query(
          "UPDATE guild_witch_raid_participants SET damage_total = damage_total + $3 WHERE raid_id = $1 AND player_id = $2",
          [raid.id, playerId, playerDamageDealt],
        );
      }
      await client.query(
        `UPDATE guild_witch_raid_battles
         SET status = $2, version = version + 1, player_hp = $3,
           player_active_slots = $4, player_reserve_queue = $5,
           witch_active_slots = $6, witch_reserve_queues = $7,
           target_boss_slot = $8, witch_unique_cards = $9, battle_log = $10, turn_number = $11,
           heal_thresholds = $12, last_curse_at = $13, player_guild_card = $14, updated_at = NOW(),
           finished_at = CASE WHEN $2 = 'active' THEN NULL ELSE NOW() END
         WHERE id = $1`,
        [battle.id, status, playerHp, JSON.stringify(playerCards), JSON.stringify(playerQueue), JSON.stringify(witchCards), JSON.stringify(witchQueues), input.bossSlot, JSON.stringify(uniqueCards), JSON.stringify(battleLog), nextTurn, JSON.stringify([...healThresholds]), new Date(lastCurseAt), playerGuildCard ? JSON.stringify(playerGuildCard) : null],
      );
      await client.query("UPDATE guild_witch_raids SET heal_thresholds = $2 WHERE id = $1", [raid.id, JSON.stringify([...healThresholds])]);
      await client.query("UPDATE guild_witch_raid_participants SET status = $3, last_activity_at = NOW() WHERE raid_id = $1 AND player_id = $2", [raid.id, playerId, status === "active" ? "active" : status === "won" ? "finished" : "defeated"]);
      if (status === "won") {
        await client.query(
          "INSERT INTO player_campaign_events (player_id, event_type, payload) VALUES ($1, 'WITCH_BATTLE_WON', $2)",
          [playerId, JSON.stringify({ battleId: battle.id })],
        );
      }
      if (status === "won" && health.every((value) => value === 0)) {
        await this.createRaidResult(client, raid);
        await this.advanceRaidLevel(client, raid);
      } else if (status === "lost") {
        await this.restartIfEveryoneFell(client, raid);
      }
      const nextRaidResult = await client.query<RaidRow>("SELECT id, guild_id, level, status, week_key, started_at, updated_at, heal_thresholds FROM guild_witch_raids WHERE id = $1", [raid.id]);
      const nextRaid = nextRaidResult.rows[0];
      if (!nextRaid) throw new GuildRaidDomainError("raid_invalid", "Raid state disappeared", 503);
      const view = await this.buildView(client, nextRaid, playerId);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildRaidDomainError) throw error;
      throw new GuildRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}

function isBalancedWitchDeck(deck: DuelCardSnapshot[], boss: RaidBossRow) {
  if (deck.length !== WITCH_DECK_SIZE) return false;
  const totalPower = deck.reduce((total, card) => total + card.finalPower, 0);
  const expectedTotal = Math.round(toSafeInteger(boss.max_health, "witch max HP") / WITCH_DECK_SIZE);
  const unique = deck[WITCH_NORMAL_CARD_COUNT];
  return Math.abs(totalPower - expectedTotal) <= WITCH_DECK_VARIATION
    && unique?.source === "guild"
    && unique.cardId === boss.card_id;
}
