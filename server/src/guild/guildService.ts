import { randomUUID } from "node:crypto";
import {
  CARD_ELEMENTS,
  GUILD_CONFIG,
  GUILD_LEVEL_REWARDS,
  GUILD_ROLE_PERMISSIONS,
  canKickGuildMember,
  canManageGuildRole,
  getGuildLevelForExperience,
  getGuildMemberCapacity,
  getGuildNextLevelExperience,
  getPlayerDisplayName,
  hasGuildPermission,
  normalizeGuildDescription,
  normalizeGuildName,
  normalizeGuildNameKey,
  type CardElement,
  type CreateGuildRequest,
  type GuildActivityType,
  type GuildAnnouncementView,
  type GuildApplicationView,
  type GuildCardCandidatesResponse,
  type GuildCardView,
  type GuildLanguage,
  type GuildJournalEntryView,
  type GuildJournalEventType,
  type GuildMissionView,
  type GuildListResponse,
  type GuildMemberView,
  type GuildMineResponse,
  type GuildPermission,
  type GuildProfileResponse,
  type GuildRecruitmentMode,
  type GuildRole,
  type GuildSummary,
  type PlayerCardInstance,
  type UpdateGuildSettingsRequest,
} from "@cardastika/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { mapCardInstanceRow, type CardInstanceProjectionRow } from "../cards/cardInstanceMapper.js";
import { GuildAltarService } from "./altarService.js";
import { GuildTreasuryService } from "./treasuryService.js";

export type Queryable = Pick<Pool, "query">;
type TransactionClient = Pick<PoolClient, "query">;

interface GuildRow extends QueryResultRow {
  activity_score: string | number;
  created_at: string | Date;
  description: string;
  emblem_id: string;
  experience: string | number;
  id: string;
  language: GuildLanguage;
  level: number;
  member_capacity?: number;
  member_count: string | number;
  min_player_level: number;
  name: string;
  next_level_experience?: string | number | null;
  recruitment_mode: GuildRecruitmentMode;
  theme_element: CardElement | null;
}

interface GuildMemberRow extends QueryResultRow {
  contributed_xp: string | number;
  first_name: string;
  joined_at: string | Date;
  last_name: string | null;
  level: number;
  nickname: string | null;
  photo_url: string | null;
  player_id: string;
  role: GuildRole;
  username: string | null;
}

interface GuildApplicationRow extends QueryResultRow {
  created_at: string | Date;
  expires_at: string | Date;
  guild_id: string;
  id: string;
  player_id: string;
  player_level: number;
  player_name: string;
}

interface PlayerLockRow extends QueryResultRow {
  first_name: string;
  id: string;
  level: number;
  nickname: string | null;
  photo_url: string | null;
  silver: string | number;
  username: string | null;
}

interface AnnouncementRow extends QueryResultRow {
  author_name: string;
  body: string;
  created_at: string | Date;
  id: string;
  updated_at: string | Date;
}

interface JournalRow extends QueryResultRow {
  activity_type: GuildActivityType | null;
  actor_name: string | null;
  amount: string | number | null;
  created_at: string | Date;
  detail: string;
  event_type: GuildJournalEventType;
  id: string;
  target_name: string | null;
}

interface GuildCardRow extends CardInstanceProjectionRow, QueryResultRow {}

const PLAYER_CARD_PROJECTION = `
  player_card_instances.id AS instance_id,
  cards.id AS card_id,
  cards.code,
  cards.display_name,
  cards.art_key,
  cards.element,
  player_card_instances.level,
  player_card_instances.bonus_power,
  player_card_instances.level_progress_elements,
  player_card_instances.protected_from_absorption,
  player_card_instances.stored_elements,
  cards.collection_id,
  cards.limited
`;

const GUILD_CARD_PROJECTION = `
  guild_cards.id AS instance_id,
  guild_cards.card_id,
  cards.code,
  cards.display_name,
  cards.art_key,
  cards.element,
  guild_cards.level,
  guild_cards.bonus_power,
  guild_cards.level_progress_elements,
  guild_cards.stored_elements,
  cards.collection_id,
  cards.limited
`;

const GUILD_LANGUAGES = new Set<GuildLanguage>(["uk", "ru", "en", "de", "other"]);
const RECRUITMENT_MODES = new Set<GuildRecruitmentMode>(["open", "application", "closed"]);
const GUILD_ROLES = new Set<GuildRole>(["leader", "officer", "veteran", "member", "newbie"]);

function toSafeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function toDateString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isCardElement(value: unknown): value is CardElement {
  return typeof value === "string" && (CARD_ELEMENTS as readonly string[]).includes(value);
}

function isUniqueViolation(error: unknown, constraint?: string) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; constraint?: string };
  return record.code === "23505" && (!constraint || record.constraint === constraint);
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/gu, "\\$&");
}

function nowPlusHours(hours: number, now = new Date()) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function toGuildSummary(row: GuildRow): GuildSummary {
  const experience = toSafeInteger(row.experience, "guild experience");
  const level = getGuildLevelForExperience(experience);
  return {
    activityScore: toSafeInteger(row.activity_score, "guild activity score"),
    createdAt: toDateString(row.created_at),
    description: row.description,
    emblemId: row.emblem_id,
    experience,
    id: row.id,
    isFull: toSafeInteger(row.member_count, "guild member count") >= (row.member_capacity ?? getGuildMemberCapacity(level)),
    language: row.language,
    level,
    memberCapacity: row.member_capacity ?? getGuildMemberCapacity(level),
    memberCount: toSafeInteger(row.member_count, "guild member count"),
    minPlayerLevel: row.min_player_level,
    name: row.name,
    recruitmentMode: row.recruitment_mode,
    themeElement: row.theme_element,
    nextLevelExperience: getGuildNextLevelExperience(level),
  };
}

function toMemberView(row: GuildMemberRow): GuildMemberView {
  return {
    contributedXp: toSafeInteger(row.contributed_xp, "member contributed XP"),
    displayName: getPlayerDisplayName({ firstName: row.first_name, nickname: row.nickname, username: row.username }),
    joinedAt: toDateString(row.joined_at),
    level: row.level,
    photoUrl: row.photo_url,
    playerId: row.player_id,
    role: row.role,
  };
}

function toApplicationView(row: GuildApplicationRow): GuildApplicationView {
  return {
    createdAt: toDateString(row.created_at),
    expiresAt: toDateString(row.expires_at),
    guildId: row.guild_id,
    id: row.id,
    playerId: row.player_id,
    playerLevel: row.player_level,
    playerName: row.player_name,
  };
}

function toAnnouncementView(row: AnnouncementRow): GuildAnnouncementView {
  return {
    authorName: row.author_name,
    body: row.body,
    createdAt: toDateString(row.created_at),
    id: row.id,
    updatedAt: toDateString(row.updated_at),
  };
}

function toJournalEntryView(row: JournalRow): GuildJournalEntryView {
  return {
    activityType: row.activity_type,
    actorName: row.actor_name,
    amount: row.amount === null ? null : toSafeInteger(row.amount, "journal amount"),
    createdAt: toDateString(row.created_at),
    detail: row.detail,
    id: row.id,
    targetName: row.target_name,
    type: row.event_type,
  };
}

export class GuildDomainError extends Error {
  constructor(
    public readonly code: string,
    message = code,
    public readonly status = 409,
    public readonly retryAt?: string,
  ) {
    super(message);
    this.name = "GuildDomainError";
  }
}

export class GuildPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Guild persistence is unavailable", options);
    this.name = "GuildPersistenceError";
  }
}

export interface GuildActivityRecorder {
  recordActivity(
    client: TransactionClient,
    playerId: string,
    activityType: GuildActivityType,
    sourceId: string,
    occurredAt?: Date,
  ): Promise<number>;
}

export interface GuildListFilters {
  hasSpace?: boolean;
  language?: GuildLanguage;
  minLevel?: number;
  name?: string;
  open?: boolean;
  page?: number;
}

export async function loadGuildCardForMember(client: Queryable, playerId: string): Promise<PlayerCardInstance | null> {
  const result = await client.query<GuildCardRow>(
    `
      SELECT ${GUILD_CARD_PROJECTION}
      FROM guild_members viewer
      INNER JOIN guilds g ON g.id = viewer.guild_id
      INNER JOIN guild_cards ON guild_cards.guild_id = g.id
      INNER JOIN cards ON cards.id = guild_cards.card_id
      WHERE viewer.player_id = $1
    `,
    [playerId],
  );
  return result.rows[0] ? mapCardInstanceRow(result.rows[0]) : null;
}

export class GuildService implements GuildActivityRecorder {
  private readonly altar: GuildAltarService;
  private readonly treasury: GuildTreasuryService;

  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {
    this.altar = new GuildAltarService(pool);
    this.treasury = new GuildTreasuryService(pool);
  }

  async recordActivity(
    client: TransactionClient,
    playerId: string,
    activityType: GuildActivityType,
    sourceId: string,
    occurredAt = new Date(),
  ) {
    const memberResult = await client.query<{ guild_id: string }>(
      "SELECT guild_id FROM guild_members WHERE player_id = $1 FOR UPDATE",
      [playerId],
    );
    const guildId = memberResult.rows[0]?.guild_id;
    if (!guildId) return 0;

    const guildResult = await client.query<{ experience: string | number; level: number }>(
      "SELECT experience, level FROM guilds WHERE id = $1 FOR UPDATE",
      [guildId],
    );
    const guild = guildResult.rows[0];
    if (!guild) return 0;

    const contributionDate = occurredAt.toISOString().slice(0, 10);
    const usedResult = await client.query<{ used: string | number }>(
      `
        SELECT COALESCE(SUM(xp), 0) AS used
        FROM guild_xp_contributions
        WHERE player_id = $1 AND contribution_date = $2::date
      `,
      [playerId, contributionDate],
    );
    const used = toSafeInteger(usedResult.rows[0]?.used ?? 0, "daily guild XP");
    const available = Math.max(0, GUILD_CONFIG.dailyXpCap - used);
    const reward = GUILD_CONFIG.xpRewards[activityType];
    if (available <= 0 || reward <= 0) return 0;
    const granted = Math.min(available, reward);
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO guild_xp_contributions (
          id, guild_id, player_id, activity_type, source_id, xp, contribution_date, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)
        ON CONFLICT (player_id, activity_type, source_id) DO NOTHING
        RETURNING id
      `,
      [randomUUID(), guildId, playerId, activityType, sourceId, granted, contributionDate, occurredAt],
    );
    if (inserted.rowCount !== 1) return 0;

    const nextExperience = toSafeInteger(guild.experience, "guild experience") + granted;
    const nextLevel = getGuildLevelForExperience(nextExperience);
    await client.query(
      "UPDATE guilds SET experience = $2, level = $3, updated_at = $4 WHERE id = $1",
      [guildId, nextExperience, nextLevel, occurredAt],
    );
    await client.query(
      "UPDATE guild_members SET contributed_xp = contributed_xp + $3, updated_at = $4 WHERE guild_id = $1 AND player_id = $2",
      [guildId, playerId, granted, occurredAt],
    );
    await this.logEvent(client, guildId, "xp_contributed", playerId, null, activityType, granted, `+${granted} XP до спільного прогресу`);
    return granted;
  }

  async list(filters: GuildListFilters = {}): Promise<GuildListResponse> {
    const page = Math.max(1, Math.trunc(filters.page ?? 1));
    const values: unknown[] = [];
    const conditions: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (filters.name?.trim()) conditions.push(`g.name ILIKE ${add(`%${escapeLike(filters.name.trim())}%`)} ESCAPE '\\'`);
    if (filters.language && GUILD_LANGUAGES.has(filters.language)) conditions.push(`g.language = ${add(filters.language)}`);
    if (filters.open) conditions.push("g.recruitment_mode = 'open'");
    if (filters.minLevel !== undefined) {
      const minLevel = Math.max(1, Math.min(120, Math.trunc(filters.minLevel)));
      conditions.push(`g.min_player_level <= ${add(minLevel)}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const capacityExpression = `(CASE g.level ${GUILD_CONFIG.maxMembersByLevel.map((capacity, index) => `WHEN ${index + 1} THEN ${capacity}`).join(" ")} ELSE ${GUILD_CONFIG.maxMembersByLevel[0]} END)`;
    const having = filters.hasSpace ? `HAVING COUNT(gm.player_id) < ${capacityExpression}` : "";
    const countResult = await this.pool.query<{ total: string }>(
      `
        SELECT COUNT(*) AS total
        FROM (
          SELECT g.id
          FROM guilds g
          LEFT JOIN guild_members gm ON gm.guild_id = g.id
          ${where}
          GROUP BY g.id
          ${having}
        ) counted
      `,
      values,
    );
    const totalEntries = Number(countResult.rows[0]?.total ?? 0);
    const offset = (page - 1) * GUILD_CONFIG.pageSize;
    const listValues = [...values, GUILD_CONFIG.pageSize, offset];
    const limitParam = `$${listValues.length - 1}`;
    const offsetParam = `$${listValues.length}`;
    const rows = await this.pool.query<GuildRow>(
      `
        SELECT
          g.id, g.name, g.description, g.emblem_id, g.language, g.recruitment_mode,
          g.theme_element, g.level, g.experience, g.min_player_level, g.created_at,
          COUNT(gm.player_id)::int AS member_count,
          ${capacityExpression}::int AS member_capacity,
          COALESCE((
            SELECT SUM(xp)::bigint
            FROM guild_xp_contributions contribution
            WHERE contribution.guild_id = g.id
              AND contribution.created_at >= NOW() - INTERVAL '7 days'
          ), 0)::bigint AS activity_score
        FROM guilds g
        LEFT JOIN guild_members gm ON gm.guild_id = g.id
        ${where}
        GROUP BY g.id
        ${having}
        ORDER BY (g.recruitment_mode = 'open') DESC, activity_score DESC, g.level DESC, member_count DESC, g.name_key ASC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `,
      listValues,
    );
    return {
      entries: rows.rows.map(toGuildSummary),
      page,
      pageSize: GUILD_CONFIG.pageSize,
      totalEntries,
      totalPages: Math.max(1, Math.ceil(totalEntries / GUILD_CONFIG.pageSize)),
    };
  }

  async getProfile(viewerId: string, guildId: string): Promise<GuildProfileResponse> {
    const client = await this.pool.connect();
    try {
      await this.expireApplications(client, viewerId);
      await this.expireGuildApplications(client, guildId);
      const guild = await this.loadGuildSummary(client, guildId);
      if (!guild) throw new GuildDomainError("guild_not_found", "Guild does not exist", 404);
      const memberRows = await client.query<GuildMemberRow>(
        `
          SELECT gm.player_id, gm.role, gm.contributed_xp, gm.joined_at,
            p.username, p.nickname, p.first_name, p.last_name, p.photo_url, p.level
          FROM guild_members gm
          INNER JOIN players p ON p.id = gm.player_id
          WHERE gm.guild_id = $1
          ORDER BY CASE gm.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 WHEN 'veteran' THEN 2 WHEN 'member' THEN 3 ELSE 4 END,
            gm.joined_at ASC, gm.player_id ASC
        `,
        [guildId],
      );
      const member = memberRows.rows.find((row) => row.player_id === viewerId);
      const permissions: readonly GuildPermission[] = member
        ? GUILD_ROLE_PERMISSIONS[member.role]
        : [];
      const activeApplicationResult = await client.query<GuildApplicationRow>(
        `
          SELECT a.id, a.guild_id, a.player_id, a.created_at, a.expires_at,
            p.level AS player_level,
            COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS player_name
          FROM guild_applications a
          INNER JOIN players p ON p.id = a.player_id
          WHERE a.player_id = $1 AND a.guild_id = $2 AND a.status = 'pending'
          LIMIT 1
        `,
        [viewerId, guildId],
      );
      const applications = hasGuildPermission(member?.role, "manage_applications")
        ? await this.loadApplications(client, guildId)
        : [];
      const dashboard = await this.loadGuildDashboard(client, guildId, guild.level, memberRows.rowCount ?? memberRows.rows.length);
      const altar = await this.altar.getView(client, viewerId);
      return {
        altar,
        applications,
        dashboard,
        guild,
        guildCard: await this.loadGuildCard(client, guildId, member?.role === "leader"),
        members: memberRows.rows.map(toMemberView),
        treasury: await this.treasury.getView(client, viewerId, guildId),
        viewer: {
          activeApplication: activeApplicationResult.rows[0] ? toApplicationView(activeApplicationResult.rows[0]) : null,
          member: member ? toMemberView(member) : null,
          permissions,
        },
      };
    } catch (error) {
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async purchaseAltarUpgrade(playerId: string, guildId: string, currency: "gold" | "silver") {
    return this.altar.purchase(playerId, guildId, currency);
  }

  async getGuildTreasury(playerId: string, guildId: string) {
    const client = await this.pool.connect();
    try {
      return await this.treasury.getView(client, playerId, guildId);
    } finally {
      client.release();
    }
  }

  async getGuildTreasuryCardCandidates(playerId: string, guildId: string) {
    return this.treasury.getCardCandidates(playerId, guildId);
  }

  async donateGuildTreasuryCurrency(playerId: string, guildId: string, currency: "gold" | "silver", amount: number) {
    await this.treasury.donateCurrency(playerId, guildId, currency, amount);
    return this.getProfile(playerId, guildId);
  }

  async donateGuildCardElements(playerId: string, guildId: string, fodderInstanceIds: readonly string[]) {
    await this.treasury.donateCardElements(playerId, guildId, fodderInstanceIds);
    return this.getProfile(playerId, guildId);
  }

  async getGuildCard(viewerId: string, guildId: string): Promise<GuildCardView> {
    const profile = await this.getProfile(viewerId, guildId);
    return profile.guildCard;
  }

  async getGuildCardCandidates(playerId: string, guildId: string): Promise<GuildCardCandidatesResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockGuild(client, guildId);
      const member = await this.lockMember(client, playerId, guildId);
      if (!member || member.role !== "leader") {
        throw new GuildDomainError("guild_permission_denied", "Only the guild leader can manage the Guild Card", 403);
      }
      const result = await client.query<GuildCardRow>(
        `
          SELECT ${PLAYER_CARD_PROJECTION}, player_card_instances.created_at
          FROM player_card_instances
          INNER JOIN cards ON cards.id = player_card_instances.card_id
          INNER JOIN player_decks ON player_decks.player_id = player_card_instances.player_id
          INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
            AND deck_slots.card_instance_id = player_card_instances.id
          WHERE player_card_instances.player_id = $1
          ORDER BY deck_slots.slot ASC
        `,
        [playerId],
      );
      await client.query("COMMIT");
      return { cards: result.rows.map(mapCardInstanceRow) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async setGuildCard(playerId: string, guildId: string, instanceId: string): Promise<GuildProfileResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guild = await this.lockGuild(client, guildId);
      const member = await this.lockMember(client, playerId, guildId);
      if (!member || member.role !== "leader") {
        throw new GuildDomainError("guild_permission_denied", "Only the guild leader can manage the Guild Card", 403);
      }
      const card = await client.query<GuildCardRow>(
        `
          SELECT ${PLAYER_CARD_PROJECTION}
          FROM player_card_instances
          INNER JOIN cards ON cards.id = player_card_instances.card_id
          INNER JOIN player_decks ON player_decks.player_id = player_card_instances.player_id
          INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
            AND deck_slots.card_instance_id = player_card_instances.id
          WHERE player_card_instances.id = $1 AND player_card_instances.player_id = $2
        `,
        [instanceId, playerId],
      );
      if (!card.rows[0]) throw new GuildDomainError("guild_card_not_owned", "Selected card is not owned by the guild leader", 403);
      const selectedCard = card.rows[0];
      if (guild.active_guild_card_instance_id === instanceId) {
        await client.query("COMMIT");
        return this.getProfile(playerId, guildId);
      }
      await client.query(
        `
          INSERT INTO guild_cards (
            id, guild_id, source_player_card_instance_id, selected_by_player_id,
            card_id, level, bonus_power, level_progress_elements, stored_elements
          )
          VALUES ($1, $2, $1, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (guild_id) DO UPDATE SET
            id = EXCLUDED.id,
            source_player_card_instance_id = EXCLUDED.source_player_card_instance_id,
            selected_by_player_id = EXCLUDED.selected_by_player_id,
            card_id = EXCLUDED.card_id,
            level = EXCLUDED.level,
            bonus_power = EXCLUDED.bonus_power,
            level_progress_elements = EXCLUDED.level_progress_elements,
            stored_elements = EXCLUDED.stored_elements,
            updated_at = NOW()
        `,
        [instanceId, guildId, playerId, selectedCard.card_id, selectedCard.level, selectedCard.bonus_power, selectedCard.level_progress_elements, selectedCard.stored_elements],
      );
      await client.query(
        "UPDATE guilds SET active_guild_card_instance_id = $2, updated_at = NOW() WHERE id = $1",
        [guildId, instanceId],
      );
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async mine(playerId: string): Promise<GuildMineResponse> {
    const client = await this.pool.connect();
    try {
      await this.expireApplications(client, playerId);
      const membership = await client.query<{ guild_id: string }>(
        "SELECT guild_id FROM guild_members WHERE player_id = $1",
        [playerId],
      );
      const guildId = membership.rows[0]?.guild_id;
      const applicationResult = await client.query<GuildApplicationRow>(
        `
          SELECT a.id, a.guild_id, a.player_id, a.created_at, a.expires_at,
            p.level AS player_level,
            COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS player_name
          FROM guild_applications a
          INNER JOIN players p ON p.id = a.player_id
          WHERE a.player_id = $1 AND a.status = 'pending'
          LIMIT 1
        `,
        [playerId],
      );
      return {
        activeApplication: applicationResult.rows[0] ? toApplicationView(applicationResult.rows[0]) : null,
        lastApplication: await this.lastApplication(client, playerId),
        guild: guildId ? await this.getProfile(playerId, guildId) : null,
      };
    } catch (error) {
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  private async lastApplication(client: TransactionClient, playerId: string): Promise<GuildMineResponse["lastApplication"]> {
    const result = await client.query<{ guild_id: string; name: string; status: string; retry_at: string | Date | null }>(
      `SELECT a.guild_id, g.name, a.status,
        (SELECT MAX(c.available_at) FROM guild_cooldowns c
         WHERE c.player_id = a.player_id AND c.guild_id = a.guild_id
           AND c.cooldown_type = 'rejected' AND c.available_at > NOW()) AS retry_at
       FROM guild_applications a JOIN guilds g ON g.id = a.guild_id
       WHERE a.player_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT 1`,
      [playerId],
    );
    const row = result.rows[0];
    if (!row || (row.status !== "rejected" && row.status !== "expired")) return null;
    return { guildId: row.guild_id, guildName: row.name, status: row.status, retryAt: row.retry_at ? toDateString(row.retry_at) : null };
  }

  async create(playerId: string, input: CreateGuildRequest) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const player = await this.lockPlayer(client, playerId);
      await this.assertCanCreate(player, client);
      const values = this.normalizeGuildInput(input);
      if (player.level < GUILD_CONFIG.unlockLevel) throw new GuildDomainError("guild_unlock_level", "Guilds unlock at level 10");
      if (toSafeInteger(player.silver, "silver") < GUILD_CONFIG.creationCostSilver) {
        throw new GuildDomainError("insufficient_silver", "Not enough silver to create a guild");
      }
      const guildId = randomUUID();
      try {
        await client.query(
          `
            INSERT INTO guilds (
              id, name, name_key, description, emblem_id, language, recruitment_mode,
              theme_element, min_player_level, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [guildId, values.name, values.nameKey, values.description, values.emblemId, values.language, values.recruitmentMode, values.themeElement, values.minPlayerLevel, playerId],
        );
      } catch (error) {
        if (isUniqueViolation(error, "guilds_name_key_key")) throw new GuildDomainError("guild_name_taken", "This guild name is already taken");
        throw error;
      }
      await client.query("INSERT INTO guild_treasuries (guild_id) VALUES ($1)", [guildId]);
      await client.query(
        "INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'leader')",
        [guildId, playerId],
      );
      await client.query(
        `INSERT INTO guild_forum_sections (id, guild_id, slug, title, description, visibility, sort_order)
         VALUES ($1, $2, 'welcome', 'Гостьова зала', 'Новини та знайомство. Видно всім мандрівникам.', 'public', 10),
                ($3, $2, 'inner', 'Внутрішня зала', 'Тактика, плани та розмови учасників.', 'private', 20)`,
        [randomUUID(), guildId, randomUUID()],
      );
      await this.logEvent(client, guildId, "guild_created", playerId, null, null, null, "Гільдію створено");
      await this.logEvent(client, guildId, "member_joined", playerId, playerId, null, null, "Засновник відкрив залу");
      await client.query(
        "UPDATE players SET silver = silver - $2, updated_at = NOW() WHERE id = $1",
        [playerId, GUILD_CONFIG.creationCostSilver],
      );
      await this.withdrawPendingApplications(client, playerId);
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      if (error instanceof GuildPersistenceError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async updateSettings(playerId: string, guildId: string, input: UpdateGuildSettingsRequest) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const member = await this.lockMember(client, playerId, guildId);
      if (!member || !hasGuildPermission(member.role, "manage_settings")) throw new GuildDomainError("guild_permission_denied", "Only the leader can change guild settings", 403);
      const values = this.normalizeGuildSettings(input);
      if (!Object.keys(values).length) throw new GuildDomainError("guild_settings_empty", "At least one setting is required", 400);
      const assignments: string[] = [];
      const params: unknown[] = [guildId];
      for (const [column, value] of Object.entries(values)) {
        assignments.push(`${column} = $${params.length + 1}`);
        params.push(value);
      }
      assignments.push("updated_at = NOW()");
      await client.query(`UPDATE guilds SET ${assignments.join(", ")} WHERE id = $1`, params);
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async join(playerId: string, guildId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const player = await this.lockPlayer(client, playerId);
      if (player.level < GUILD_CONFIG.unlockLevel) throw new GuildDomainError("guild_unlock_level", "Guilds unlock at level 10");
      if (await this.playerGuildId(client, playerId)) throw new GuildDomainError("already_in_guild", "Player is already in a guild");
      await this.assertNoCooldown(client, playerId, guildId, ["left", "kicked"]);
      const guild = await this.lockGuild(client, guildId);
      if (guild.recruitment_mode !== "open") throw new GuildDomainError("guild_not_open", "This guild does not accept direct joins");
      this.assertGuildEntry(player.level, guild.min_player_level);
      await this.assertCapacity(client, guildId, guild.level);
      await client.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'newbie')", [guildId, playerId]);
      await this.logEvent(client, guildId, "member_joined", playerId, playerId, null, null, "Приєднався до гільдії");
      await this.withdrawPendingApplications(client, playerId);
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async apply(playerId: string, guildId: string, message = "") {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const player = await this.lockPlayer(client, playerId);
      if (player.level < GUILD_CONFIG.unlockLevel) throw new GuildDomainError("guild_unlock_level", "Guilds unlock at level 10");
      if (await this.playerGuildId(client, playerId)) throw new GuildDomainError("already_in_guild", "Player is already in a guild");
      const guild = await this.lockGuild(client, guildId);
      if (guild.recruitment_mode === "closed") throw new GuildDomainError("guild_closed", "This guild is closed for recruitment");
      if (guild.recruitment_mode === "open") throw new GuildDomainError("guild_accepts_direct_join", "Join this guild directly");
      this.assertGuildEntry(player.level, guild.min_player_level);
      await this.assertCapacity(client, guildId, guild.level);
      await this.assertNoCooldown(client, playerId, guildId, ["kicked", "rejected"]);
      const expiresAt = nowPlusHours(GUILD_CONFIG.applicationTtlHours);
      try {
        await client.query(
          "INSERT INTO guild_applications (id, guild_id, player_id, message, expires_at) VALUES ($1, $2, $3, $4, $5)",
          [randomUUID(), guildId, playerId, normalizeApplicationMessage(message), expiresAt],
        );
      } catch (error) {
        if (isUniqueViolation(error, "guild_applications_one_pending_player_idx")) throw new GuildDomainError("active_application_exists", "Player already has an active guild application");
        throw error;
      }
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async withdrawApplication(playerId: string, applicationId: string) {
    const result = await this.pool.query(
      "UPDATE guild_applications SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 AND player_id = $2 AND status = 'pending'",
      [applicationId, playerId],
    );
    if (result.rowCount !== 1) throw new GuildDomainError("application_not_found", "Active application does not exist", 404);
    return { withdrawn: true };
  }

  async applications(playerId: string, guildId: string) {
    const client = await this.pool.connect();
    try {
      const member = await this.lockMember(client, playerId, guildId);
      if (!member || !hasGuildPermission(member.role, "manage_applications")) throw new GuildDomainError("guild_permission_denied", "You cannot manage applications", 403);
      await this.expireApplications(client, playerId);
      await this.expireGuildApplications(client, guildId);
      return { applications: await this.loadApplications(client, guildId) };
    } catch (error) {
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async decideApplication(playerId: string, guildId: string, applicationId: string, decision: "accept" | "reject") {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const actor = await this.lockMember(client, playerId, guildId);
      if (!actor || !hasGuildPermission(actor.role, "manage_applications")) throw new GuildDomainError("guild_permission_denied", "You cannot manage applications", 403);
      const applicationResult = await client.query<GuildApplicationRow & { message: string }>(
        `
          SELECT a.id, a.guild_id, a.player_id, a.created_at, a.expires_at, a.message,
            p.level AS player_level,
            COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS player_name
          FROM guild_applications a
          INNER JOIN players p ON p.id = a.player_id
          WHERE a.id = $1 AND a.guild_id = $2 AND a.status = 'pending'
          FOR UPDATE OF a
        `,
        [applicationId, guildId],
      );
      const application = applicationResult.rows[0];
      if (!application) throw new GuildDomainError("application_not_found", "Application is no longer active", 404);
      if (new Date(application.expires_at).getTime() <= Date.now()) {
        await client.query("UPDATE guild_applications SET status = 'expired', updated_at = NOW() WHERE id = $1", [applicationId]);
        throw new GuildDomainError("application_expired", "Application has expired", 409);
      }
      if (decision === "reject") {
        await client.query("UPDATE guild_applications SET status = 'rejected', decided_at = NOW(), updated_at = NOW() WHERE id = $1", [applicationId]);
        await this.upsertCooldown(client, application.player_id, guildId, "rejected", nowPlusHours(GUILD_CONFIG.rejectionCooldownHours));
        await this.logEvent(client, guildId, "application_rejected", playerId, application.player_id, null, null, "Заявку відхилено");
      } else {
        const applicant = await this.lockPlayer(client, application.player_id);
        if (await this.playerGuildId(client, applicant.id)) throw new GuildDomainError("applicant_already_in_guild", "Applicant is already in a guild");
        const guild = await this.lockGuild(client, guildId);
        await this.assertNoCooldown(client, applicant.id, guildId, ["left", "kicked", "rejected"]);
        this.assertGuildEntry(applicant.level, guild.min_player_level);
        await this.assertCapacity(client, guildId, guild.level);
        await client.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'newbie')", [guildId, applicant.id]);
        await client.query("UPDATE guild_applications SET status = 'accepted', decided_at = NOW(), updated_at = NOW() WHERE id = $1", [applicationId]);
        await this.withdrawPendingApplications(client, applicant.id, applicationId);
        await this.logEvent(client, guildId, "application_accepted", playerId, applicant.id, null, null, "Заявку прийнято");
        await this.logEvent(client, guildId, "member_joined", playerId, applicant.id, null, null, "Новий учасник приєднався");
      }
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async changeRole(playerId: string, guildId: string, targetPlayerId: string, nextRole: GuildRole) {
    if (!GUILD_ROLES.has(nextRole)) throw new GuildDomainError("invalid_guild_role", "Role is invalid", 400);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const actor = await this.lockMember(client, playerId, guildId);
      const target = await this.lockMember(client, targetPlayerId, guildId);
      if (!actor || !target || !canManageGuildRole(actor.role, target.role, nextRole)) throw new GuildDomainError("guild_permission_denied", "You cannot assign this role", 403);
      if (playerId === targetPlayerId) throw new GuildDomainError("cannot_change_own_role", "You cannot change your own role");
      await client.query("UPDATE guild_members SET role = $3, updated_at = NOW() WHERE guild_id = $1 AND player_id = $2", [guildId, targetPlayerId, nextRole]);
      await this.logEvent(client, guildId, "role_changed", playerId, targetPlayerId, null, null, `Роль змінено на ${nextRole}`);
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async kick(playerId: string, guildId: string, targetPlayerId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const actor = await this.lockMember(client, playerId, guildId);
      const target = await this.lockMember(client, targetPlayerId, guildId);
      if (!actor || !target || !canKickGuildMember(actor.role, target.role)) throw new GuildDomainError("guild_permission_denied", "You cannot remove this member", 403);
      await client.query("DELETE FROM guild_members WHERE guild_id = $1 AND player_id = $2", [guildId, targetPlayerId]);
      await this.upsertCooldown(client, targetPlayerId, guildId, "kicked", nowPlusHours(GUILD_CONFIG.kickCooldownHours));
      await this.logEvent(client, guildId, "member_kicked", playerId, targetPlayerId, null, null, "Учасника виключено");
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async leave(playerId: string, guildId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const member = await this.lockMember(client, playerId, guildId);
      if (!member) throw new GuildDomainError("not_guild_member", "Player is not in this guild", 404);
      if (member.role === "leader") {
        const count = await client.query<{ count: string }>("SELECT COUNT(*) AS count FROM guild_members WHERE guild_id = $1", [guildId]);
        if (Number(count.rows[0]?.count ?? 0) > 1) throw new GuildDomainError("leader_transfer_required", "Leader must transfer leadership before leaving");
        throw new GuildDomainError("leader_must_dissolve", "The sole leader must dissolve the guild instead");
      }
      await client.query("DELETE FROM guild_members WHERE guild_id = $1 AND player_id = $2", [guildId, playerId]);
      await this.upsertCooldown(client, playerId, guildId, "left", nowPlusHours(GUILD_CONFIG.leaveCooldownHours));
      await this.logEvent(client, guildId, "member_left", playerId, playerId, null, null, "Вийшов з гільдії");
      await client.query("COMMIT");
      return { left: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async transferLeadership(playerId: string, guildId: string, targetPlayerId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const actor = await this.lockMember(client, playerId, guildId);
      const target = await this.lockMember(client, targetPlayerId, guildId);
      if (!actor || actor.role !== "leader" || !target || targetPlayerId === playerId) throw new GuildDomainError("guild_permission_denied", "Only the leader can transfer leadership", 403);
      await client.query("UPDATE guild_members SET role = 'officer', updated_at = NOW() WHERE guild_id = $1 AND player_id = $2", [guildId, playerId]);
      await client.query("UPDATE guild_members SET role = 'leader', updated_at = NOW() WHERE guild_id = $1 AND player_id = $2", [guildId, targetPlayerId]);
      await client.query("DELETE FROM guild_cards WHERE guild_id = $1", [guildId]);
      await client.query("UPDATE guilds SET active_guild_card_instance_id = NULL, updated_at = NOW() WHERE id = $1", [guildId]);
      await this.logEvent(client, guildId, "role_changed", playerId, targetPlayerId, null, null, "Лідерство передано");
      await client.query("COMMIT");
      return this.getProfile(targetPlayerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async dissolve(playerId: string, guildId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const member = await this.lockMember(client, playerId, guildId);
      if (!member || member.role !== "leader") throw new GuildDomainError("guild_permission_denied", "Only the leader can dissolve a guild", 403);
      const count = await client.query<{ count: string }>("SELECT COUNT(*) AS count FROM guild_members WHERE guild_id = $1", [guildId]);
      if (Number(count.rows[0]?.count ?? 0) !== 1) throw new GuildDomainError("guild_not_empty", "Only a guild with its sole leader can be dissolved");
      await client.query("DELETE FROM guilds WHERE id = $1", [guildId]);
      await client.query("COMMIT");
      return { dissolved: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async updateAnnouncement(playerId: string, guildId: string, body: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const member = await this.lockMember(client, playerId, guildId);
      if (!member || !hasGuildPermission(member.role, "manage_announcements")) {
        throw new GuildDomainError("guild_permission_denied", "You cannot edit the guild announcement", 403);
      }
      const announcement = body.normalize("NFKC").trim();
      if (announcement.length > 280) throw new GuildDomainError("announcement_too_long", "Announcement is limited to 280 characters", 400);
      if (!announcement) {
        await client.query("DELETE FROM guild_announcements WHERE guild_id = $1", [guildId]);
      } else {
        await client.query(
          `INSERT INTO guild_announcements (id, guild_id, author_id, body)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (guild_id) DO UPDATE SET author_id = EXCLUDED.author_id, body = EXCLUDED.body, updated_at = NOW()`,
          [randomUUID(), guildId, playerId, announcement],
        );
      }
      await this.logEvent(client, guildId, "announcement_updated", playerId, null, null, null, announcement ? "Оголошення оновлено" : "Оголошення очищено");
      await client.query("COMMIT");
      return this.getProfile(playerId, guildId);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDomainError) throw error;
      throw new GuildPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  private async loadGuildDashboard(client: TransactionClient, guildId: string, level: number, memberCount: number) {
    const announcementResult = await client.query<AnnouncementRow>(
        `SELECT a.id, a.body, a.created_at, a.updated_at,
          COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS author_name
         FROM guild_announcements a INNER JOIN players p ON p.id = a.author_id
         WHERE a.guild_id = $1`,
        [guildId],
      );
    const journalResult = await client.query<JournalRow>(
        `SELECT l.id, l.event_type, l.activity_type, l.amount, l.detail, l.created_at,
          COALESCE(actor.nickname, NULLIF(actor.username, ''), actor.first_name) AS actor_name,
          COALESCE(target.nickname, NULLIF(target.username, ''), target.first_name) AS target_name
         FROM guild_activity_log l
         LEFT JOIN players actor ON actor.id = l.actor_id
         LEFT JOIN players target ON target.id = l.target_id
         WHERE l.guild_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT 8`,
        [guildId],
      );
    const metricsResult = await client.query<{ active_member_count: string; today_experience: string; weekly_experience: string }>(
        `SELECT
          COUNT(DISTINCT player_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS active_member_count,
          COALESCE(SUM(xp) FILTER (WHERE contribution_date = CURRENT_DATE), 0)::bigint AS today_experience,
          COALESCE(SUM(xp) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::bigint AS weekly_experience
         FROM guild_xp_contributions WHERE guild_id = $1`,
        [guildId],
      );
    const periodResult = await client.query<{ period_end: string; period_start: string }>(
        "SELECT (CURRENT_DATE - 6)::text AS period_start, CURRENT_DATE::text AS period_end",
      );
    const metrics = metricsResult.rows[0];
    const period = periodResult.rows[0]!;
    const target = GUILD_CONFIG.guildMissionBaseXp + memberCount * GUILD_CONFIG.guildMissionXpPerMember;
    const weeklyExperience = toSafeInteger(metrics?.weekly_experience ?? 0, "weekly guild XP");
    const mission: GuildMissionView = {
      completed: weeklyExperience >= target,
      description: "Грайте разом: кожна перемога наповнює спільний прогрес.",
      id: `${guildId}:${period.period_start}`,
      periodEnd: period.period_end,
      periodStart: period.period_start,
      progress: Math.min(target, weeklyExperience),
      rewardLabel: "Скарбниця: внесок у наступну нагороду",
      target,
      title: "Тижневий імпульс",
    };
    const reward = GUILD_LEVEL_REWARDS.find((entry) => entry.level > level);
    return {
      activeMemberCount: Number(metrics?.active_member_count ?? 0),
      announcement: announcementResult.rows[0] ? toAnnouncementView(announcementResult.rows[0]) : null,
      journal: journalResult.rows.map(toJournalEntryView),
      mission,
      nextReward: reward ? { label: reward.label, level: reward.level } : null,
      todayExperience: toSafeInteger(metrics?.today_experience ?? 0, "today guild XP"),
      weeklyExperience,
    };
  }

  private async loadGuildCard(client: TransactionClient, guildId: string, canManage: boolean): Promise<GuildCardView> {
    const result = await client.query<GuildCardRow>(
      `
        SELECT ${GUILD_CARD_PROJECTION}
        FROM guild_cards
        INNER JOIN cards ON cards.id = guild_cards.card_id
        WHERE guild_cards.guild_id = $1
      `,
      [guildId],
    );
    return {
      active: result.rows[0] ? mapCardInstanceRow(result.rows[0]) : null,
      canManage,
    };
  }

  private async logEvent(
    client: TransactionClient,
    guildId: string,
    eventType: GuildJournalEventType,
    actorId: string | null,
    targetId: string | null,
    activityType: GuildActivityType | null,
    amount: number | null,
    detail: string,
  ) {
    await client.query(
      `INSERT INTO guild_activity_log (id, guild_id, event_type, actor_id, target_id, activity_type, amount, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [randomUUID(), guildId, eventType, actorId, targetId, activityType, amount, detail.slice(0, 280)],
    );
  }

  private async loadGuildSummary(client: TransactionClient, guildId: string) {
    const result = await client.query<GuildRow>(
      `
        SELECT
          g.id, g.name, g.description, g.emblem_id, g.language, g.recruitment_mode,
          g.theme_element, g.level, g.experience, g.min_player_level, g.created_at,
          COUNT(gm.player_id)::int AS member_count,
          (CASE g.level ${GUILD_CONFIG.maxMembersByLevel.map((capacity, index) => `WHEN ${index + 1} THEN ${capacity}`).join(" ")} ELSE ${GUILD_CONFIG.maxMembersByLevel[0]} END)::int AS member_capacity,
          COALESCE((
            SELECT SUM(xp)::bigint FROM guild_xp_contributions contribution
            WHERE contribution.guild_id = g.id
              AND contribution.created_at >= NOW() - INTERVAL '7 days'
          ), 0)::bigint AS activity_score
        FROM guilds g
        LEFT JOIN guild_members gm ON gm.guild_id = g.id
        WHERE g.id = $1
        GROUP BY g.id
      `,
      [guildId],
    );
    const row = result.rows[0];
    return row ? toGuildSummary(row) : null;
  }

  private async loadApplications(client: TransactionClient, guildId: string) {
    const result = await client.query<GuildApplicationRow>(
      `
        SELECT a.id, a.guild_id, a.player_id, a.created_at, a.expires_at,
          p.level AS player_level,
          COALESCE(p.nickname, NULLIF(p.username, ''), p.first_name) AS player_name
        FROM guild_applications a
        INNER JOIN players p ON p.id = a.player_id
        WHERE a.guild_id = $1 AND a.status = 'pending'
        ORDER BY a.created_at ASC
      `,
      [guildId],
    );
    return result.rows.map(toApplicationView);
  }

  private async lockPlayer(client: TransactionClient, playerId: string) {
    const result = await client.query<PlayerLockRow>(
      `SELECT id, level, silver, username, nickname, first_name, photo_url FROM players WHERE id = $1 FOR UPDATE`,
      [playerId],
    );
    const player = result.rows[0];
    if (!player) throw new GuildDomainError("player_not_found", "Player does not exist", 404);
    return player;
  }

  private async assertCanCreate(player: PlayerLockRow, client: TransactionClient) {
    if (player.level < GUILD_CONFIG.unlockLevel) throw new GuildDomainError("guild_unlock_level", "Guilds unlock at level 10");
    if (await this.playerGuildId(client, player.id)) throw new GuildDomainError("already_in_guild", "Player is already in a guild");
  }

  private async lockGuild(client: TransactionClient, guildId: string) {
    const result = await client.query<{ id: string; level: number; min_player_level: number; recruitment_mode: GuildRecruitmentMode; active_guild_card_instance_id: string | null }>(
      "SELECT id, level, min_player_level, recruitment_mode, active_guild_card_instance_id FROM guilds WHERE id = $1 FOR UPDATE",
      [guildId],
    );
    const guild = result.rows[0];
    if (!guild) throw new GuildDomainError("guild_not_found", "Guild does not exist", 404);
    return guild;
  }

  private async lockMember(client: TransactionClient, playerId: string, guildId: string) {
    const result = await client.query<{ role: GuildRole; player_id: string }>(
      "SELECT player_id, role FROM guild_members WHERE player_id = $1 AND guild_id = $2 FOR UPDATE",
      [playerId, guildId],
    );
    return result.rows[0] ?? null;
  }

  private async playerGuildId(client: TransactionClient, playerId: string) {
    const result = await client.query<{ guild_id: string }>("SELECT guild_id FROM guild_members WHERE player_id = $1", [playerId]);
    return result.rows[0]?.guild_id ?? null;
  }

  private async assertCapacity(client: TransactionClient, guildId: string, level: number) {
    const result = await client.query<{ count: string }>("SELECT COUNT(*) AS count FROM guild_members WHERE guild_id = $1", [guildId]);
    if (Number(result.rows[0]?.count ?? 0) >= getGuildMemberCapacity(level)) throw new GuildDomainError("guild_full", "Guild has no free places");
  }

  private assertGuildEntry(playerLevel: number, minPlayerLevel: number) {
    if (playerLevel < minPlayerLevel) throw new GuildDomainError("guild_min_level", "Player level is below the guild requirement");
  }

  private async assertNoCooldown(client: TransactionClient, playerId: string, guildId: string, types: readonly ("left" | "kicked" | "rejected")[]) {
    const result = await client.query<{ available_at: string | Date }>(
      `
        SELECT available_at FROM guild_cooldowns
        WHERE player_id = $1 AND cooldown_type = ANY($2::text[])
          AND (guild_id IS NULL OR (cooldown_type = 'left' AND guild_id <> $3) OR (cooldown_type <> 'left' AND guild_id = $3))
          AND available_at > NOW()
        ORDER BY available_at DESC LIMIT 1
      `,
      [playerId, types, guildId],
    );
    const availableAt = result.rows[0]?.available_at;
    if (availableAt) throw new GuildDomainError("guild_cooldown", "Guild cooldown is active", 409, toDateString(availableAt));
  }

  private async upsertCooldown(client: TransactionClient, playerId: string, guildId: string | null, type: "left" | "kicked" | "rejected", availableAt: Date) {
    await client.query(
      `
        DELETE FROM guild_cooldowns
        WHERE player_id = $1 AND cooldown_type = $2
          AND ((guild_id IS NULL AND $3::uuid IS NULL) OR guild_id = $3)
      `,
      [playerId, type, guildId],
    );
    await client.query(
      "INSERT INTO guild_cooldowns (id, player_id, guild_id, cooldown_type, available_at) VALUES ($1, $2, $3, $4, $5)",
      [randomUUID(), playerId, guildId, type, availableAt],
    );
  }

  private async withdrawPendingApplications(client: TransactionClient, playerId: string, exceptId?: string) {
    await client.query(
      `
        UPDATE guild_applications
        SET status = 'withdrawn', updated_at = NOW()
        WHERE player_id = $1 AND status = 'pending' ${exceptId ? "AND id <> $2" : ""}
      `,
      exceptId ? [playerId, exceptId] : [playerId],
    );
  }

  private async expireApplications(client: TransactionClient, playerId: string) {
    await client.query(
      "UPDATE guild_applications SET status = 'expired', updated_at = NOW() WHERE player_id = $1 AND status = 'pending' AND expires_at <= NOW()",
      [playerId],
    );
  }

  private async expireGuildApplications(client: TransactionClient, guildId: string) {
    await client.query(
      "UPDATE guild_applications SET status = 'expired', updated_at = NOW() WHERE guild_id = $1 AND status = 'pending' AND expires_at <= NOW()",
      [guildId],
    );
  }

  private normalizeGuildInput(input: CreateGuildRequest) {
    const name = this.normalizeName(input.name);
    let description: string;
    try {
      description = normalizeGuildDescription(input.description);
    } catch (error) {
      throw new GuildDomainError(error instanceof Error ? error.message : "guild_description_too_long", "Guild description is invalid", 400);
    }
    return {
      description,
      emblemId: this.normalizeEmblem(input.emblemId),
      language: this.normalizeLanguage(input.language),
      minPlayerLevel: this.normalizeMinLevel(input.minPlayerLevel),
      name,
      nameKey: normalizeGuildNameKey(name),
      recruitmentMode: this.normalizeRecruitmentMode(input.recruitmentMode),
      themeElement: this.normalizeThemeElement(input.themeElement),
    };
  }

  private normalizeGuildSettings(input: UpdateGuildSettingsRequest) {
    const values: Record<string, unknown> = {};
    if (input.description !== undefined) {
      try {
        values.description = normalizeGuildDescription(input.description);
      } catch (error) {
        throw new GuildDomainError(error instanceof Error ? error.message : "guild_description_too_long", "Guild description is invalid", 400);
      }
    }
    if (input.emblemId !== undefined) values.emblem_id = this.normalizeEmblem(input.emblemId);
    if (input.language !== undefined) values.language = this.normalizeLanguage(input.language);
    if (input.minPlayerLevel !== undefined) values.min_player_level = this.normalizeMinLevel(input.minPlayerLevel);
    if (input.recruitmentMode !== undefined) values.recruitment_mode = this.normalizeRecruitmentMode(input.recruitmentMode);
    if (input.themeElement !== undefined) values.theme_element = this.normalizeThemeElement(input.themeElement);
    return values;
  }

  private normalizeName(value: string) {
    try { return normalizeGuildName(value); } catch (error) {
      throw new GuildDomainError(error instanceof Error ? error.message : "guild_name_invalid", "Guild name is invalid", 400);
    }
  }

  private normalizeLanguage(value: GuildLanguage | undefined) {
    if (value === undefined) return "uk" as const;
    if (!GUILD_LANGUAGES.has(value)) throw new GuildDomainError("invalid_guild_language", "Guild language is invalid", 400);
    return value;
  }

  private normalizeRecruitmentMode(value: GuildRecruitmentMode | undefined) {
    if (value === undefined) return "open" as const;
    if (!RECRUITMENT_MODES.has(value)) throw new GuildDomainError("invalid_recruitment_mode", "Recruitment mode is invalid", 400);
    return value;
  }

  private normalizeThemeElement(value: CardElement | null | undefined) {
    if (value === undefined || value === null) return null;
    if (!isCardElement(value)) throw new GuildDomainError("invalid_theme_element", "Guild theme element is invalid", 400);
    return value;
  }

  private normalizeEmblem(value: string | undefined) {
    const emblemId = (value ?? "shield-1").trim();
    if (!/^shield-[1-8]$/u.test(emblemId)) throw new GuildDomainError("invalid_guild_emblem", "Guild emblem is invalid", 400);
    return emblemId;
  }

  private normalizeMinLevel(value: number | undefined) {
    const minLevel = value ?? GUILD_CONFIG.unlockLevel;
    if (!Number.isSafeInteger(minLevel) || minLevel < GUILD_CONFIG.unlockLevel || minLevel > 120) {
      throw new GuildDomainError("invalid_guild_min_level", "Guild minimum level is invalid", 400);
    }
    return minLevel;
  }
}

function normalizeApplicationMessage(value: string) {
  const message = value.normalize("NFKC").trim();
  if (Array.from(message).length > 500) throw new GuildDomainError("application_message_too_long", "Application message is too long", 400);
  return message;
}
