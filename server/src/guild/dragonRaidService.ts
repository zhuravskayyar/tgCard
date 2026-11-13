import { randomUUID } from "node:crypto";
import {
  applyAccountXp,
  calculateDuelDamage,
  canUpgradeDragonLair,
  cycleCardPoolSlot,
  DRAGON_BATTLE_LOG_SIZE,
  DRAGON_BREATH_DAMAGE,
  DRAGON_BREATH_INTERVAL_MS,
  DRAGON_DECK_SIZE,
  DRAGON_DECK_SOURCES,
  DRAGON_INACTIVE_ENROLLMENT_MINUTES,
  DRAGON_LAIR_MAX_LEVEL,
  DRAGON_LAIRS,
  DRAGON_REWARD_CARD_LEVEL,
  getDragonLair,
  getDragonLairUpgradeCost,
  getDragonRespawnHours,
  getDueDragonBreaths,
  getElementMultiplier,
  getRarityForLevel,
  initializeCyclicCardPool,
  RAID_CARD_SWAP_GOLD,
  resolveDragonSlayerPoints,
  rollDragonDeckPowers,
  splitDragonBreath,
  type DragonLairDefinition,
  type RandomSource,
} from "@cardastika/game-core";
import type {
  CardElement,
  DuelCardSnapshot,
  DuelSideSnapshot,
  GuildDragonActionRequest,
  GuildDragonBattleView,
  GuildDragonLairView,
  GuildDragonParticipantView,
  GuildDragonRaidListView,
  GuildDragonRaidView,
  GuildDragonResultView,
  GuildRaidBattleLogEntry,
  GuildRaidBattleStatus,
  GuildRaidSwapRequest,
  GuildRole,
  PlayerMailCardReward,
} from "@cardastika/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";

interface GuildXpGrant { playerId: string; sourceId: string; xp: number }

/** Guild XP goes through the guild service; every XP a member earns also goes to the guild (reference). */
export interface DragonRaidGuildActivity {
  recordActivity(client: Pick<PoolClient, "query">, playerId: string, activityType: "dragon_raid", sourceId: string, playerXp: number): Promise<number>;
}
import { DuelDeckInvalidError, loadDuelParticipant } from "../duel/duelService.js";
import { applyDragonHunterTitle, hasDragonHunterTitle } from "./dragonHunterTitle.js";

type TransactionClient = Pick<PoolClient, "query">;
type ActiveCards = [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];

/** Ranks that may open a dragon raid; «Учасник» and «Новачок» (adepts and neophytes) may not. */
const STARTING_ROLES: readonly GuildRole[] = ["leader", "officer", "veteran"];
const UPGRADE_ROLES: readonly GuildRole[] = ["leader", "officer"];
const MAX_BREATHS_PER_PASS = 240;
const ROLE_ORDER_SQL = `CASE members.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 WHEN 'veteran' THEN 2 WHEN 'member' THEN 3 ELSE 4 END`;
const DISPLAY_NAME_SQL = `COALESCE(NULLIF(BTRIM(players.username), ''), NULLIF(BTRIM(players.first_name), ''), 'Гравець')`;

interface RaidRow extends QueryResultRow {
  id: string;
  guild_id: string;
  lair_code: string;
  status: "open" | "active";
  max_health: number | string;
  current_health: number | string;
  started_at: string | Date | null;
  last_breath_at: string | Date | null;
}

interface LairRow extends QueryResultRow {
  lair_code: string;
  level: number;
  defeated_count: number;
}

interface DragonCardRow extends QueryResultRow {
  id: string;
  code: string;
  display_name: string | null;
  art_key: string | null;
  element: CardElement;
}

interface ParticipantRow extends QueryResultRow {
  player_id: string;
  status: "enrolled" | "active" | "defeated";
  damage_total: number | string;
  joined_at: string | Date;
  role: GuildRole;
  contributed_xp: number | string;
  display_name: string;
  photo_url: string | null;
}

interface BattleRow extends QueryResultRow {
  id: string;
  raid_id: string;
  player_id: string;
  status: GuildRaidBattleStatus;
  version: number;
  player_snapshot: DuelSideSnapshot;
  player_hp: number | string;
  player_max_hp: number | string;
  player_active_slots: unknown;
  player_reserve_queue: unknown;
  dragon_active_slots: unknown;
  dragon_reserve_queue: unknown;
  battle_log: GuildRaidBattleLogEntry[];
  turn_number: number;
  card_changes: number;
  finished_at: string | Date | null;
}

/** A finished battle stays visible this long so the last strike can play before the lobby returns. */
const FINISHED_BATTLE_VISIBLE_MS = 15_000;

interface ResultRow extends QueryResultRow {
  id: string;
  outcome: "won" | "lost";
  completed_at: string | Date;
  leader_name: string | null;
  winner_player_id: string | null;
  winner_name: string | null;
  reward_card: PlayerMailCardReward | null;
  mail_id: string | null;
  participants: { playerId: string; displayName: string; damage: number; pointsAfter: number }[];
}

export type GuildDragonRaidErrorCode =
  | "guild_not_found"
  | "raid_not_member"
  | "lair_not_found"
  | "raid_not_open"
  | "raid_not_active"
  | "raid_not_enrolled"
  | "raid_not_leader"
  | "raid_other_enrollment"
  | "raid_respawning"
  | "raid_battle_not_found"
  | "raid_battle_finished"
  | "raid_state_conflict"
  | "raid_deck_invalid"
  | "raid_invalid"
  | "insufficient_gold"
  | "lair_upgrade_forbidden"
  | "lair_upgrade_unavailable"
  | "insufficient_treasury";

export class GuildDragonRaidDomainError extends Error {
  constructor(public readonly code: GuildDragonRaidErrorCode, message: string, public readonly status = 409) {
    super(message);
    this.name = "GuildDragonRaidDomainError";
  }
}

export class GuildDragonRaidPersistenceError extends Error {
  constructor(options: ErrorOptions) {
    super("Guild dragon raid data is unavailable", options);
    this.name = "GuildDragonRaidPersistenceError";
  }
}

function toSafeInteger(value: number | string, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function toIso(value: string | Date) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function activeCards(value: unknown, field: string): ActiveCards {
  if (!Array.isArray(value) || value.length !== 3 || value.some((card) => !card || typeof card !== "object")) {
    throw new GuildDragonRaidDomainError("raid_invalid", `Invalid ${field} in dragon battle`, 503);
  }
  return [value[0] as DuelCardSnapshot, value[1] as DuelCardSnapshot, value[2] as DuelCardSnapshot];
}

function cardList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((card) => !card || typeof card !== "object")) {
    throw new GuildDragonRaidDomainError("raid_invalid", `Invalid ${field} in dragon battle`, 503);
  }
  return value as DuelCardSnapshot[];
}

function requireLair(code: string) {
  const lair = getDragonLair(code);
  if (!lair) throw new GuildDragonRaidDomainError("lair_not_found", "Dragon lair does not exist", 404);
  return lair;
}

function addLog(log: GuildRaidBattleLogEntry[], entry: GuildRaidBattleLogEntry) {
  log.push(entry);
  if (log.length > DRAGON_BATTLE_LOG_SIZE) log.splice(0, log.length - DRAGON_BATTLE_LOG_SIZE);
}

function toBattleView(row: BattleRow): GuildDragonBattleView {
  return {
    battleId: row.id,
    battleLog: [...row.battle_log].reverse(),
    cardChanges: toSafeInteger(row.card_changes, "card changes"),
    dragonActiveCards: activeCards(row.dragon_active_slots, "dragon cards"),
    playerActiveCards: activeCards(row.player_active_slots, "player cards"),
    playerHp: toSafeInteger(row.player_hp, "player HP"),
    playerMaxHp: toSafeInteger(row.player_max_hp, "player max HP"),
    status: row.status,
    turnNumber: toSafeInteger(row.turn_number, "turn"),
    version: toSafeInteger(row.version, "battle version"),
  };
}

const BATTLE_COLUMNS = `id, raid_id, player_id, status, version, player_snapshot, player_hp, player_max_hp,
  player_active_slots, player_reserve_queue, dragon_active_slots, dragon_reserve_queue,
  battle_log, turn_number, card_changes, finished_at`;

/**
 * Dragon raids (reference: «Мануал: рейды»). Eight lairs per guild, real-time pair strikes,
 * a breath every 30 s split between the living, dragon slayer points and per-player respawns.
 */
export class GuildDragonRaidService {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly random: RandomSource = Math.random,
    private readonly now: () => number = Date.now,
    private readonly guildActivity?: DragonRaidGuildActivity,
  ) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new GuildDragonRaidPersistenceError({ cause: error });
    }
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildDragonRaidDomainError) throw error;
      throw new GuildDragonRaidPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  private async lockGuild(client: TransactionClient, guildId: string) {
    const guild = await client.query<{ id: string; level: number }>("SELECT id, level FROM guilds WHERE id = $1 FOR UPDATE", [guildId]);
    const row = guild.rows[0];
    if (!row) throw new GuildDragonRaidDomainError("guild_not_found", "Guild does not exist", 404);
    return row;
  }

  private async requireMember(client: TransactionClient, guildId: string, playerId: string) {
    const member = await client.query<{ role: GuildRole }>("SELECT role FROM guild_members WHERE guild_id = $1 AND player_id = $2", [guildId, playerId]);
    const row = member.rows[0];
    if (!row) throw new GuildDragonRaidDomainError("raid_not_member", "Only guild members can join dragon raids", 403);
    return row;
  }

  private async ensureLairs(client: TransactionClient, guildId: string) {
    for (const lair of DRAGON_LAIRS) {
      await client.query(
        "INSERT INTO guild_dragon_lairs (guild_id, lair_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [guildId, lair.code],
      );
      await client.query(
        `INSERT INTO guild_dragon_raids (id, guild_id, lair_code, status, max_health, current_health)
         VALUES ($1, $2, $3, 'open', $4, $4) ON CONFLICT (guild_id, lair_code) DO NOTHING`,
        [randomUUID(), guildId, lair.code, lair.health],
      );
    }
  }

  private async lockRaid(client: TransactionClient, guildId: string, lair: DragonLairDefinition) {
    const select = () => client.query<RaidRow>(
      `SELECT id, guild_id, lair_code, status, max_health, current_health, started_at, last_breath_at
       FROM guild_dragon_raids WHERE guild_id = $1 AND lair_code = $2 FOR UPDATE`,
      [guildId, lair.code],
    );
    let raid = await select();
    if (!raid.rows[0]) {
      await this.ensureLairs(client, guildId);
      raid = await select();
    }
    const row = raid.rows[0];
    if (!row) throw new GuildDragonRaidDomainError("raid_invalid", "Dragon raid is missing", 503);
    return row;
  }

  /**
   * Before the start an idle enrolled player drops out after 15 minutes (reference). During the raid
   * the same applies to anyone who never began a battle, so an idle player cannot keep the raid alive.
   */
  private async expireInactive(client: TransactionClient, raid: RaidRow, lair: DragonLairDefinition) {
    if (raid.status === "open") {
      await client.query(
        `DELETE FROM guild_dragon_raid_participants
         WHERE raid_id = $1 AND last_activity_at < NOW() - make_interval(mins => $2)`,
        [raid.id, DRAGON_INACTIVE_ENROLLMENT_MINUTES],
      );
      return raid;
    }
    const removed = await client.query(
      `DELETE FROM guild_dragon_raid_participants participants
       WHERE participants.raid_id = $1 AND participants.status <> 'defeated'
         AND participants.last_activity_at < NOW() - make_interval(mins => $2)
         AND NOT EXISTS (
           SELECT 1 FROM guild_dragon_raid_battles battles
           WHERE battles.raid_id = participants.raid_id AND battles.player_id = participants.player_id AND battles.status = 'active'
         )`,
      [raid.id, DRAGON_INACTIVE_ENROLLMENT_MINUTES],
    );
    return removed.rowCount ? this.finishIfEveryoneFell(client, raid, lair) : raid;
  }

  private async loadParticipants(client: TransactionClient, raid: RaidRow) {
    const result = await client.query<ParticipantRow>(
      `SELECT participants.player_id, participants.status, participants.damage_total, participants.joined_at,
          members.role, members.contributed_xp, players.photo_url, ${DISPLAY_NAME_SQL} AS display_name
       FROM guild_dragon_raid_participants participants
       INNER JOIN guild_members members ON members.guild_id = $2 AND members.player_id = participants.player_id
       INNER JOIN players ON players.id = participants.player_id
       WHERE participants.raid_id = $1
       ORDER BY ${ROLE_ORDER_SQL}, members.contributed_xp DESC, participants.joined_at ASC, participants.player_id ASC`,
      [raid.id, raid.guild_id],
    );
    return result.rows;
  }

  /** The raid leader is the highest-ranked enrolled player; ties go to more guild XP. */
  private leaderOf(participants: readonly ParticipantRow[]) {
    return participants.find((participant) => participant.status !== "defeated") ?? null;
  }

  private async loadBattles(client: TransactionClient, raidId: string, lock = false) {
    const result = await client.query<BattleRow>(
      `SELECT ${BATTLE_COLUMNS} FROM guild_dragon_raid_battles WHERE raid_id = $1 ORDER BY player_id${lock ? " FOR UPDATE" : ""}`,
      [raidId],
    );
    return result.rows;
  }

  /** Applies every overdue breath to the living fighters; ends the raid when nobody is left. */
  private async applyBreaths(client: TransactionClient, raid: RaidRow, lair: DragonLairDefinition) {
    if (raid.status !== "active" || !raid.last_breath_at) return raid;
    const due = getDueDragonBreaths(new Date(raid.last_breath_at).getTime(), this.now());
    if (due.count === 0) return raid;
    const battles = await this.loadBattles(client, raid.id, true);
    const living = battles.filter((battle) => battle.status === "active" && toSafeInteger(battle.player_hp, "player HP") > 0);
    const hp = new Map(living.map((battle) => [battle.id, toSafeInteger(battle.player_hp, "player HP")]));
    const logs = new Map(living.map((battle) => [battle.id, [...battle.battle_log]]));
    for (let index = 0; index < Math.min(due.count, MAX_BREATHS_PER_PASS); index += 1) {
      const alive = living.filter((battle) => hp.get(battle.id)! > 0);
      if (!alive.length) break;
      const shares = splitDragonBreath(lair.kind, alive.length);
      alive.forEach((battle, aliveIndex) => {
        const damage = Math.min(hp.get(battle.id)!, shares[aliveIndex]!);
        hp.set(battle.id, hp.get(battle.id)! - damage);
        const log = logs.get(battle.id)!;
        addLog(log, { id: randomUUID(), kind: "breath", playerDamage: 0, text: `Подих змія: −${damage} HP`, turnNumber: battle.turn_number, witchDamage: damage });
        if (hp.get(battle.id) === 0) addLog(log, { id: randomUUID(), kind: "death", playerDamage: 0, text: "Ви вибули з бою", turnNumber: battle.turn_number, witchDamage: 0 });
      });
    }
    for (const battle of living) {
      const nextHp = hp.get(battle.id)!;
      const dead = nextHp === 0;
      await client.query(
        `UPDATE guild_dragon_raid_battles SET player_hp = $2, battle_log = $3, status = $4, version = version + 1,
           updated_at = NOW(), finished_at = CASE WHEN $4 = 'active' THEN NULL ELSE NOW() END WHERE id = $1`,
        [battle.id, nextHp, JSON.stringify(logs.get(battle.id)), dead ? "lost" : "active"],
      );
      if (dead) await client.query("UPDATE guild_dragon_raid_participants SET status = 'defeated' WHERE raid_id = $1 AND player_id = $2", [raid.id, battle.player_id]);
    }
    await client.query("UPDATE guild_dragon_raids SET last_breath_at = $2, updated_at = NOW() WHERE id = $1", [raid.id, new Date(due.nextLastBreathAt)]);
    const next = { ...raid, last_breath_at: new Date(due.nextLastBreathAt) };
    return this.finishIfEveryoneFell(client, next, lair);
  }

  private async finishIfEveryoneFell(client: TransactionClient, raid: RaidRow, lair: DragonLairDefinition) {
    if (raid.status !== "active") return raid;
    const participants = await this.loadParticipants(client, raid);
    if (participants.length && participants.some((participant) => participant.status !== "defeated")) return raid;
    if (!participants.length) return this.resetRaid(client, raid, lair);
    // Defeat: no slayer points, no respawn; the dragon can be attacked again at once.
    const leaderName = participants[0]?.display_name ?? null;
    await client.query(
      `INSERT INTO guild_dragon_raid_results (id, guild_id, lair_code, outcome, leader_name, participants)
       VALUES ($1, $2, $3, 'lost', $4, $5)`,
      [randomUUID(), raid.guild_id, lair.code, leaderName, JSON.stringify(participants.map((participant) => ({
        playerId: participant.player_id, displayName: participant.display_name, damage: toSafeInteger(participant.damage_total, "damage"), pointsAfter: 0,
      })))],
    );
    await this.logJournal(client, raid.guild_id, "dragon_raid_lost", null, `${lair.lairName}: рейд програно, рейд-лідер ${leaderName ?? "—"}`);
    return this.resetRaid(client, raid, lair);
  }

  private async resetRaid(client: TransactionClient, raid: RaidRow, lair: DragonLairDefinition) {
    await client.query("UPDATE guild_dragon_raid_battles SET status = 'lost', finished_at = NOW() WHERE raid_id = $1 AND status = 'active'", [raid.id]);
    await client.query("DELETE FROM guild_dragon_raid_participants WHERE raid_id = $1", [raid.id]);
    await client.query(
      `UPDATE guild_dragon_raids SET status = 'open', current_health = $2, max_health = $2,
         started_at = NULL, last_breath_at = NULL, updated_at = NOW() WHERE id = $1`,
      [raid.id, lair.health],
    );
    return { ...raid, status: "open" as const, current_health: lair.health, max_health: lair.health, started_at: null, last_breath_at: null };
  }

  private async logJournal(client: TransactionClient, guildId: string, eventType: string, actorId: string | null, detail: string) {
    await client.query(
      `INSERT INTO guild_activity_log (id, guild_id, event_type, actor_id, target_id, activity_type, amount, detail)
       VALUES ($1, $2, $3, $4, NULL, NULL, NULL, $5)`,
      [randomUUID(), guildId, eventType, actorId, detail],
    );
  }

  private async loadDragonCard(client: TransactionClient, lair: DragonLairDefinition) {
    const result = await client.query<DragonCardRow>("SELECT id, code, display_name, art_key, element FROM cards WHERE id = $1", [lair.cardId]);
    const row = result.rows[0];
    if (!row) throw new GuildDragonRaidDomainError("raid_invalid", `Dragon card ${lair.cardId} is missing`, 503);
    return row;
  }

  private async lairView(client: TransactionClient, guildId: string, guildLevel: number, lair: DragonLairDefinition, raid: RaidRow, lairRow: LairRow, viewerId: string): Promise<GuildDragonLairView> {
    const card = await this.loadDragonCard(client, lair);
    const counts = await client.query<{ count: string; viewer: boolean }>(
      `SELECT COUNT(*) FILTER (WHERE status <> 'defeated') AS count, BOOL_OR(player_id = $2) AS viewer
       FROM guild_dragon_raid_participants WHERE raid_id = $1`,
      [raid.id, viewerId],
    );
    const respawn = await client.query<{ available_at: Date | string }>(
      "SELECT available_at FROM player_dragon_respawns WHERE player_id = $1 AND lair_code = $2 AND available_at > NOW()",
      [viewerId, lair.code],
    );
    const level = lairRow.level;
    const nextUpgrade = level >= DRAGON_LAIR_MAX_LEVEL ? null : {
      level: level + 1,
      ...getDragonLairUpgradeCost(lair.kind, level + 1),
      allowed: canUpgradeDragonLair(level, guildLevel),
    };
    return {
      code: lair.code,
      currentHealth: toSafeInteger(raid.current_health, "dragon HP"),
      defeatedCount: lairRow.defeated_count,
      dragon: { artKey: card.art_key ?? card.code, cardId: card.id, code: card.code, displayName: card.display_name ?? card.code, element: card.element },
      health: toSafeInteger(raid.max_health, "dragon max HP"),
      kind: lair.kind,
      lairLevel: level,
      lairName: lair.lairName,
      nextUpgrade,
      participantCount: toSafeInteger(counts.rows[0]?.count ?? 0, "participants"),
      respawnHours: getDragonRespawnHours(level),
      status: raid.status,
      viewerAvailableAt: respawn.rows[0] ? toIso(respawn.rows[0].available_at) : null,
      viewerEnrolled: Boolean(counts.rows[0]?.viewer),
    };
  }

  private async lairRow(client: TransactionClient, guildId: string, code: string) {
    const result = await client.query<LairRow>("SELECT lair_code, level, defeated_count FROM guild_dragon_lairs WHERE guild_id = $1 AND lair_code = $2", [guildId, code]);
    const row = result.rows[0];
    if (!row) throw new GuildDragonRaidDomainError("raid_invalid", "Dragon lair is missing", 503);
    return row;
  }

  private async slayerPoints(client: TransactionClient, guildId: string, playerId: string) {
    const result = await client.query<{ points: string }>("SELECT points FROM guild_dragon_slayer_points WHERE guild_id = $1 AND player_id = $2", [guildId, playerId]);
    return toSafeInteger(result.rows[0]?.points ?? 0, "slayer points");
  }

  async listLairs(guildId: string, viewerId: string): Promise<GuildDragonRaidListView> {
    return this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      const member = await this.requireMember(client, guildId, viewerId);
      await this.ensureLairs(client, guildId);
      const lairs: GuildDragonLairView[] = [];
      for (const lair of DRAGON_LAIRS) {
        let raid = await this.lockRaid(client, guildId, lair);
        raid = await this.applyBreaths(client, raid, lair);
        raid = await this.expireInactive(client, raid, lair);
        lairs.push(await this.lairView(client, guildId, guild.level, lair, raid, await this.lairRow(client, guildId, lair.code), viewerId));
      }
      const enrolled = await client.query<{ lair_code: string }>(
        `SELECT raids.lair_code FROM guild_dragon_raid_participants participants
         INNER JOIN guild_dragon_raids raids ON raids.id = participants.raid_id
         WHERE participants.player_id = $1 AND raids.guild_id = $2`,
        [viewerId, guildId],
      );
      const treasury = await client.query<{ gold: string; silver: string }>("SELECT gold, silver FROM guild_treasuries WHERE guild_id = $1", [guildId]);
      const ranking = await client.query<{ player_id: string; display_name: string; points: string }>(
        `SELECT points.player_id, points.points, ${DISPLAY_NAME_SQL} AS display_name
         FROM guild_dragon_slayer_points points
         INNER JOIN guild_members members ON members.guild_id = points.guild_id AND members.player_id = points.player_id
         INNER JOIN players ON players.id = points.player_id
         WHERE points.guild_id = $1 AND points.points > 0
         ORDER BY points.points DESC, points.player_id
         LIMIT 50`,
        [guildId],
      );
      const enrolledCount = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM guild_dragon_raid_participants participants
         INNER JOIN guild_dragon_raids raids ON raids.id = participants.raid_id
         WHERE raids.guild_id = $1 AND participants.status <> 'defeated'`,
        [guildId],
      );
      return {
        enrolledCount: toSafeInteger(enrolledCount.rows[0]?.count ?? 0, "enrolled"),
        ranking: ranking.rows.map((row) => ({ displayName: row.display_name, playerId: row.player_id, points: toSafeInteger(row.points, "slayer points") })),
        successfulRaids: lairs.reduce((total, lair) => total + lair.defeatedCount, 0),
        canUpgrade: UPGRADE_ROLES.includes(member.role),
        guildLevel: guild.level,
        lairs,
        slayerPoints: await this.slayerPoints(client, guildId, viewerId),
        treasury: { gold: toSafeInteger(treasury.rows[0]?.gold ?? 0, "treasury gold"), silver: toSafeInteger(treasury.rows[0]?.silver ?? 0, "treasury silver") },
        viewerEnrolledLair: enrolled.rows[0]?.lair_code ?? null,
      };
    });
  }

  private async buildView(client: TransactionClient, guildId: string, guildLevel: number, lair: DragonLairDefinition, raid: RaidRow, viewerId: string): Promise<GuildDragonRaidView> {
    const participants = await this.loadParticipants(client, raid);
    const battles = await this.loadBattles(client, raid.id);
    const battleByPlayer = new Map(battles.map((battle) => [battle.player_id, battle]));
    const points = await client.query<{ player_id: string; points: string }>(
      "SELECT player_id, points FROM guild_dragon_slayer_points WHERE guild_id = $1 AND player_id = ANY($2::uuid[])",
      [guildId, participants.map((participant) => participant.player_id)],
    );
    const pointsByPlayer = new Map(points.rows.map((row) => [row.player_id, toSafeInteger(row.points, "slayer points")]));
    const leader = this.leaderOf(participants);
    const viewer = participants.find((participant) => participant.player_id === viewerId);
    const ownBattle = battleByPlayer.get(viewerId);
    const viewerBattle = ownBattle && (ownBattle.status === "active"
      || (ownBattle.finished_at && this.now() - new Date(ownBattle.finished_at).getTime() < FINISHED_BATTLE_VISIBLE_MS)
      || (raid.status === "active" && viewer?.status === "defeated")) ? ownBattle : undefined;
    const latest = await client.query<ResultRow>(
      `SELECT id, outcome, completed_at, leader_name, winner_player_id, winner_name, reward_card, mail_id, participants
       FROM guild_dragon_raid_results WHERE guild_id = $1 AND lair_code = $2 ORDER BY completed_at DESC LIMIT 1`,
      [guildId, lair.code],
    );
    const result = latest.rows[0];
    const lastResult: GuildDragonResultView | null = result ? {
      completedAt: toIso(result.completed_at),
      id: result.id,
      leaderName: result.leader_name,
      outcome: result.outcome,
      participants: result.participants,
      winner: result.winner_player_id && result.reward_card ? {
        card: result.reward_card,
        displayName: result.winner_name ?? "Гравець",
        mailId: result.mail_id,
        playerId: result.winner_player_id,
      } : null,
    } : null;
    const participantViews: GuildDragonParticipantView[] = participants.map((participant) => {
      const own = battleByPlayer.get(participant.player_id);
      const battle = own && (own.status === "active" || participant.status === "defeated") ? own : undefined;
      return {
        alive: participant.status !== "defeated",
        damage: toSafeInteger(participant.damage_total, "damage"),
        displayName: participant.display_name,
        hp: battle ? toSafeInteger(battle.player_hp, "player HP") : null,
        maxHp: battle ? toSafeInteger(battle.player_max_hp, "player max HP") : null,
        photoUrl: participant.photo_url,
        playerId: participant.player_id,
        slayerPoints: pointsByPlayer.get(participant.player_id) ?? 0,
      };
    }).sort((left, right) => right.damage - left.damage);
    const leaderMayStart = Boolean(leader && STARTING_ROLES.includes(leader.role));
    return {
      battle: viewerBattle ? toBattleView(viewerBattle) : null,
      breathDamage: DRAGON_BREATH_DAMAGE[lair.kind],
      enrollment: {
        canStart: Boolean(raid.status === "open" && viewer && leader?.player_id === viewerId && leaderMayStart),
        enrolled: Boolean(viewer),
        leaderId: leader?.player_id ?? null,
        participantCount: participants.filter((participant) => participant.status !== "defeated").length,
      },
      lair: await this.lairView(client, guildId, guildLevel, lair, raid, await this.lairRow(client, guildId, lair.code), viewerId),
      lastResult,
      nextBreathAt: raid.status === "active" && raid.last_breath_at ? new Date(new Date(raid.last_breath_at).getTime() + DRAGON_BREATH_INTERVAL_MS).toISOString() : null,
      participants: participantViews,
    };
  }

  async getRaid(guildId: string, lairCode: string, viewerId: string) {
    const lair = requireLair(lairCode);
    return this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      await this.requireMember(client, guildId, viewerId);
      let raid = await this.lockRaid(client, guildId, lair);
      raid = await this.applyBreaths(client, raid, lair);
      raid = await this.expireInactive(client, raid, lair);
      return this.buildView(client, guildId, guild.level, lair, raid, viewerId);
    });
  }

  async enroll(playerId: string, guildId: string, lairCode: string) {
    const lair = requireLair(lairCode);
    return this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      await this.requireMember(client, guildId, playerId);
      let raid = await this.lockRaid(client, guildId, lair);
      raid = await this.applyBreaths(client, raid, lair);
      raid = await this.expireInactive(client, raid, lair);
      const respawn = await client.query("SELECT 1 FROM player_dragon_respawns WHERE player_id = $1 AND lair_code = $2 AND available_at > NOW()", [playerId, lair.code]);
      if (respawn.rows.length) throw new GuildDragonRaidDomainError("raid_respawning", "This dragon is still respawning for you");
      const other = await client.query<{ raid_id: string }>("SELECT raid_id FROM guild_dragon_raid_participants WHERE player_id = $1", [playerId]);
      if (other.rows[0] && other.rows[0].raid_id !== raid.id) throw new GuildDragonRaidDomainError("raid_other_enrollment", "You can join only one dragon raid at a time");
      if (!other.rows[0]) {
        await client.query(
          "INSERT INTO guild_dragon_raid_participants (raid_id, player_id, status) VALUES ($1, $2, $3)",
          [raid.id, playerId, raid.status === "active" ? "active" : "enrolled"],
        );
      } else {
        await client.query("UPDATE guild_dragon_raid_participants SET last_activity_at = NOW() WHERE raid_id = $1 AND player_id = $2", [raid.id, playerId]);
      }
      return this.buildView(client, guildId, guild.level, lair, raid, playerId);
    });
  }

  async leave(playerId: string, guildId: string, lairCode: string) {
    const lair = requireLair(lairCode);
    return this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      let raid = await this.lockRaid(client, guildId, lair);
      raid = await this.applyBreaths(client, raid, lair);
      const fighting = (await this.loadBattles(client, raid.id)).some((battle) => battle.player_id === playerId && battle.status === "active");
      if (fighting) throw new GuildDragonRaidDomainError("raid_not_open", "You cannot leave during your battle");
      await client.query("DELETE FROM guild_dragon_raid_participants WHERE raid_id = $1 AND player_id = $2", [raid.id, playerId]);
      raid = await this.finishIfEveryoneFell(client, raid, lair);
      return this.buildView(client, guildId, guild.level, lair, raid, playerId);
    });
  }

  async start(playerId: string, guildId: string, lairCode: string) {
    const lair = requireLair(lairCode);
    return this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      await this.requireMember(client, guildId, playerId);
      const raid = await this.lockRaid(client, guildId, lair);
      if (raid.status !== "open") throw new GuildDragonRaidDomainError("raid_not_open", "The raid is already in progress");
      await this.expireInactive(client, raid, lair);
      const participants = await this.loadParticipants(client, raid);
      const leader = this.leaderOf(participants);
      if (!participants.some((participant) => participant.player_id === playerId)) throw new GuildDragonRaidDomainError("raid_not_enrolled", "Join the raid before starting it");
      if (!leader || leader.player_id !== playerId || !STARTING_ROLES.includes(leader.role)) {
        throw new GuildDragonRaidDomainError("raid_not_leader", "Only the raid leader can start this raid", 403);
      }
      await client.query("UPDATE guild_dragon_raids SET status = 'active', started_at = NOW(), last_breath_at = NOW(), updated_at = NOW() WHERE id = $1", [raid.id]);
      await client.query("UPDATE guild_dragon_raid_participants SET status = 'active', last_activity_at = NOW() WHERE raid_id = $1", [raid.id]);
      const next = { ...raid, status: "active" as const, started_at: new Date(), last_breath_at: new Date(this.now()) };
      return this.buildView(client, guildId, guild.level, lair, next, playerId);
    });
  }

  private async dragonDeck(client: TransactionClient, lair: DragonLairDefinition, raidId: string): Promise<DuelCardSnapshot[]> {
    const source = DRAGON_DECK_SOURCES[lair.kind];
    const templates = await client.query<DragonCardRow>(
      `SELECT cards.id, cards.code, cards.display_name, cards.art_key, cards.element
       FROM cards LEFT JOIN collections ON collections.id = cards.collection_id
       WHERE collections.code = $1 OR cards.id = ANY($2::text[])
       ORDER BY cards.id`,
      [source.collectionCode, source.extraCardIds],
    );
    if (!templates.rows.length) throw new GuildDragonRaidDomainError("raid_invalid", "Dragon deck cards are missing", 503);
    const level = DRAGON_REWARD_CARD_LEVEL[lair.kind];
    const powers = rollDragonDeckPowers(lair.kind, this.random, DRAGON_DECK_SIZE);
    return powers.map((power, index) => {
      const template = templates.rows[Math.floor(this.random() * templates.rows.length)]!;
      return {
        artKey: template.art_key,
        basePower: power,
        bonusPower: 0,
        cardId: template.id,
        code: template.code,
        displayName: template.display_name,
        element: template.element,
        finalPower: power,
        instanceId: `${raidId}:dragon:${index}:${randomUUID()}`,
        level,
        limited: false,
        rarity: getRarityForLevel(level),
      };
    });
  }

  async startBattle(playerId: string, guildId: string, lairCode: string) {
    const lair = requireLair(lairCode);
    return this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      let raid = await this.lockRaid(client, guildId, lair);
      raid = await this.applyBreaths(client, raid, lair);
      if (raid.status !== "active") throw new GuildDragonRaidDomainError("raid_not_active", "The raid leader must open the raid first");
      const participant = (await this.loadParticipants(client, raid)).find((row) => row.player_id === playerId);
      if (!participant) throw new GuildDragonRaidDomainError("raid_not_enrolled", "Join the raid before fighting");
      const existing = (await this.loadBattles(client, raid.id)).find((battle) => battle.player_id === playerId);
      if (existing?.status === "active") return this.buildView(client, guildId, guild.level, lair, raid, playerId);
      if (existing) {
        const fellThisRaid = participant.status === "defeated"
          || Boolean(raid.started_at && existing.finished_at && new Date(existing.finished_at) >= new Date(raid.started_at));
        if (fellThisRaid) throw new GuildDragonRaidDomainError("raid_battle_finished", "You have already fallen in this raid");
        await client.query("DELETE FROM guild_dragon_raid_battles WHERE id = $1", [existing.id]);
      }
      // Dragon raids use the battle deck only; extra cards do not take part.
      const loaded = await loadDuelParticipant(client as PoolClient, playerId, "guild_raid").catch((error: unknown) => {
        if (error instanceof DuelDeckInvalidError) throw new GuildDragonRaidDomainError("raid_deck_invalid", "Потрібна повна бойова колода 3/2/2/2");
        throw error;
      });
      if (await hasDragonHunterTitle(client, playerId)) applyDragonHunterTitle(loaded.snapshot);
      const playerPool = initializeCyclicCardPool(loaded.snapshot.cards, this.random);
      const dragonPool = initializeCyclicCardPool(await this.dragonDeck(client, lair, raid.id), this.random);
      await client.query(
        `INSERT INTO guild_dragon_raid_battles (id, raid_id, player_id, status, player_snapshot, player_hp, player_max_hp,
           player_active_slots, player_reserve_queue, dragon_active_slots, dragon_reserve_queue)
         VALUES ($1, $2, $3, 'active', $4, $5, $5, $6, $7, $8, $9)`,
        [
          randomUUID(), raid.id, playerId, JSON.stringify(loaded.snapshot), loaded.snapshot.startingHp,
          JSON.stringify(playerPool.activeCards), JSON.stringify(playerPool.reserveQueue),
          JSON.stringify(dragonPool.activeCards), JSON.stringify(dragonPool.reserveQueue),
        ],
      );
      await client.query("UPDATE guild_dragon_raid_participants SET status = 'active', last_activity_at = NOW() WHERE raid_id = $1 AND player_id = $2", [raid.id, playerId]);
      return this.buildView(client, guildId, guild.level, lair, raid, playerId);
    });
  }

  private async lockBattle(client: TransactionClient, raid: RaidRow, battleId: string, playerId: string, expectedVersion: number) {
    const result = await client.query<BattleRow>(
      `SELECT ${BATTLE_COLUMNS} FROM guild_dragon_raid_battles WHERE id = $1 AND raid_id = $2 AND player_id = $3 FOR UPDATE`,
      [battleId, raid.id, playerId],
    );
    const battle = result.rows[0];
    if (!battle) throw new GuildDragonRaidDomainError("raid_battle_not_found", "Dragon battle does not exist", 404);
    if (battle.status !== "active") throw new GuildDragonRaidDomainError("raid_battle_finished", "This battle is over");
    if (battle.version !== expectedVersion) throw new GuildDragonRaidDomainError("raid_state_conflict", "Dragon battle state is stale");
    return battle;
  }

  async action(playerId: string, guildId: string, lairCode: string, battleId: string, input: GuildDragonActionRequest) {
    const lair = requireLair(lairCode);
    if (input.slotIndex !== 0 && input.slotIndex !== 1 && input.slotIndex !== 2) throw new GuildDragonRaidDomainError("raid_invalid", "Card slot is invalid", 400);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new GuildDragonRaidDomainError("raid_invalid", "Battle version is invalid", 400);
    const guildXp: GuildXpGrant[] = [];
    const view = await this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      let raid = await this.lockRaid(client, guildId, lair);
      if (raid.status !== "active") throw new GuildDragonRaidDomainError("raid_not_active", "The raid is not active");
      raid = await this.applyBreaths(client, raid, lair);
      if (raid.status !== "active") return this.buildView(client, guildId, guild.level, lair, raid, playerId);
      const battleCheck = (await this.loadBattles(client, raid.id)).find((row) => row.id === battleId && row.player_id === playerId);
      if (battleCheck && battleCheck.status !== "active") return this.buildView(client, guildId, guild.level, lair, raid, playerId);
      const battle = await this.lockBattle(client, raid, battleId, playerId, input.expectedVersion);
      const playerCards = activeCards(battle.player_active_slots, "player cards");
      const playerQueue = cardList(battle.player_reserve_queue, "player queue");
      const dragonCards = activeCards(battle.dragon_active_slots, "dragon cards");
      const dragonQueue = cardList(battle.dragon_reserve_queue, "dragon queue");
      const log = [...battle.battle_log];
      const playerCard = playerCards[input.slotIndex]!;
      const dragonCard = dragonCards[input.slotIndex]!;
      const strike = calculateDuelDamage({
        attackerElement: playerCard.element,
        attackerElementDamagePct: battle.player_snapshot.modifiers.elementDamagePct[playerCard.element],
        attackerFinalPower: playerCard.finalPower,
        battleDamagePct: battle.player_snapshot.modifiers.battleDamagePct,
        defenderElement: dragonCard.element,
      });
      const counter = calculateDuelDamage({
        attackerElement: dragonCard.element,
        attackerElementDamagePct: 0,
        attackerFinalPower: dragonCard.finalPower,
        battleDamagePct: 0,
        defenderElement: playerCard.element,
      });
      const healthBefore = toSafeInteger(raid.current_health, "dragon HP");
      const health = Math.max(0, healthBefore - strike.damage);
      const dealt = healthBefore - health;
      const playerHp = Math.max(0, toSafeInteger(battle.player_hp, "player HP") - counter.damage);
      const turn = battle.turn_number + 1;
      const nextPlayer = cycleCardPoolSlot({ activeCards: playerCards, reserveQueue: playerQueue }, input.slotIndex);
      const nextDragon = cycleCardPoolSlot({ activeCards: dragonCards, reserveQueue: dragonQueue }, input.slotIndex);
      addLog(log, {
        attackerCard: playerCard,
        defenderCard: dragonCard,
        id: randomUUID(),
        kind: "attack",
        multiplier: getElementMultiplier(playerCard.element, dragonCard.element),
        playerDamage: strike.damage,
        slotIndex: input.slotIndex,
        text: `Удар по змію: −${strike.damage}`,
        turnNumber: turn,
        witchDamage: counter.damage,
        witchMultiplier: getElementMultiplier(dragonCard.element, playerCard.element),
      });
      const won = health === 0;
      const fell = !won && playerHp === 0;
      if (fell) addLog(log, { id: randomUUID(), kind: "death", playerDamage: 0, text: "Ви вибули з бою", turnNumber: turn, witchDamage: 0 });
      await client.query(
        `UPDATE guild_dragon_raid_battles SET status = $2, version = version + 1, player_hp = $3,
           player_active_slots = $4, player_reserve_queue = $5, dragon_active_slots = $6, dragon_reserve_queue = $7,
           battle_log = $8, turn_number = $9, updated_at = NOW(),
           finished_at = CASE WHEN $2 = 'active' THEN NULL ELSE NOW() END
         WHERE id = $1`,
        [battle.id, won ? "won" : fell ? "lost" : "active", playerHp, JSON.stringify(nextPlayer.activeCards), JSON.stringify(nextPlayer.reserveQueue),
          JSON.stringify(nextDragon.activeCards), JSON.stringify(nextDragon.reserveQueue), JSON.stringify(log), turn],
      );
      await client.query(
        `UPDATE guild_dragon_raid_participants SET damage_total = damage_total + $3, last_activity_at = NOW(),
           status = CASE WHEN $4 THEN 'defeated' ELSE status END
         WHERE raid_id = $1 AND player_id = $2`,
        [raid.id, playerId, dealt, fell],
      );
      await client.query("UPDATE guild_dragon_raids SET current_health = $2, updated_at = NOW() WHERE id = $1", [raid.id, health]);
      raid = { ...raid, current_health: health };
      if (won) raid = await this.completeVictory(client, raid, lair, guildXp);
      else if (fell) raid = await this.finishIfEveryoneFell(client, raid, lair);
      return this.buildView(client, guildId, guild.level, lair, raid, playerId);
    });
    await this.grantGuildXp(guildXp);
    return view;
  }

  /** «Змінити карти» on the field for 10 gold, any number of times. */
  async swapCards(playerId: string, guildId: string, lairCode: string, battleId: string, input: GuildRaidSwapRequest) {
    const lair = requireLair(lairCode);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new GuildDragonRaidDomainError("raid_invalid", "Battle version is invalid", 400);
    return this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      let raid = await this.lockRaid(client, guildId, lair);
      raid = await this.applyBreaths(client, raid, lair);
      if (raid.status !== "active") throw new GuildDragonRaidDomainError("raid_not_active", "The raid is not active");
      const battle = await this.lockBattle(client, raid, battleId, playerId, input.expectedVersion);
      const paid = await client.query("UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold", [playerId, RAID_CARD_SWAP_GOLD]);
      if (!paid.rows.length) throw new GuildDragonRaidDomainError("insufficient_gold", "Not enough gold to change cards");
      let pool = { activeCards: activeCards(battle.player_active_slots, "player cards"), reserveQueue: cardList(battle.player_reserve_queue, "player queue") };
      for (const slot of [0, 1, 2] as const) pool = cycleCardPoolSlot(pool, slot);
      const log = [...battle.battle_log];
      addLog(log, { id: randomUUID(), kind: "swap", playerDamage: 0, text: `Карти змінено за ${RAID_CARD_SWAP_GOLD} золота`, turnNumber: battle.turn_number, witchDamage: 0 });
      await client.query(
        `UPDATE guild_dragon_raid_battles SET version = version + 1, card_changes = card_changes + 1,
           player_active_slots = $2, player_reserve_queue = $3, battle_log = $4, updated_at = NOW() WHERE id = $1`,
        [battle.id, JSON.stringify(pool.activeCards), JSON.stringify(pool.reserveQueue), JSON.stringify(log)],
      );
      return this.buildView(client, guildId, guild.level, lair, raid, playerId);
    });
  }

  private async completeVictory(client: TransactionClient, raid: RaidRow, lair: DragonLairDefinition, guildXp: GuildXpGrant[]) {
    const participants = await this.loadParticipants(client, raid);
    const pointsRows = await client.query<{ player_id: string; points: string }>(
      "SELECT player_id, points FROM guild_dragon_slayer_points WHERE guild_id = $1 AND player_id = ANY($2::uuid[]) FOR UPDATE",
      [raid.guild_id, participants.map((participant) => participant.player_id)],
    );
    const before = new Map(pointsRows.rows.map((row) => [row.player_id, toSafeInteger(row.points, "slayer points")]));
    const outcome = resolveDragonSlayerPoints(participants.map((participant) => ({
      damage: toSafeInteger(participant.damage_total, "damage"),
      joinedAt: new Date(participant.joined_at).getTime(),
      playerId: participant.player_id,
      pointsBefore: before.get(participant.player_id) ?? 0,
    })));
    for (const entry of outcome) {
      await client.query(
        `INSERT INTO guild_dragon_slayer_points (guild_id, player_id, points) VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, player_id) DO UPDATE SET points = EXCLUDED.points`,
        [raid.guild_id, entry.playerId, entry.pointsAfter],
      );
    }
    const winner = participants.find((participant) => participant.player_id === outcome.find((entry) => entry.winner)?.playerId) ?? null;
    const card = await this.loadDragonCard(client, lair);
    const rewardCard: PlayerMailCardReward = {
      artKey: card.art_key,
      cardId: card.id,
      code: card.code,
      displayName: card.display_name,
      element: card.element,
      level: DRAGON_REWARD_CARD_LEVEL[lair.kind],
    };
    const resultId = randomUUID();
    let mailId: string | null = null;
    if (winner) {
      const mail = await client.query<{ id: string }>(
        `INSERT INTO player_mail (id, player_id, subject, body, silver, gold, card_id, card_level, source_key)
         VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7)
         ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO UPDATE SET source_key = EXCLUDED.source_key
         RETURNING id`,
        [randomUUID(), winner.player_id, "Карта змія", `${lair.lairName}: у вас найбільше очок змієборця. Заберіть карту «${card.display_name ?? card.code}».`, card.id, rewardCard.level, `guild-dragon-raid:${resultId}`],
      );
      mailId = mail.rows[0]?.id ?? null;
    }
    // Experience (reference): a victory pays XP from the damage dealt, then the player's percentage bonuses.
    // A defeat pays none. Guild XP is recorded after every player row is locked.
    const battles = new Map((await this.loadBattles(client, raid.id)).map((battle) => [battle.player_id, battle]));
    const xpByPlayer = new Map<string, number>();
    for (const participant of [...participants].sort((left, right) => left.player_id.localeCompare(right.player_id))) {
      const damage = toSafeInteger(participant.damage_total, "damage");
      const bonusPct = Math.max(0, Math.round(battles.get(participant.player_id)?.player_snapshot.modifiers.experienceRewardPct ?? 0));
      const xp = Math.round(damage * (100 + bonusPct) / 100);
      xpByPlayer.set(participant.player_id, xp);
      if (xp <= 0) continue;
      const player = (await client.query<{ level: number; account_xp: number | string }>("SELECT level, account_xp FROM players WHERE id = $1 FOR UPDATE", [participant.player_id])).rows[0];
      if (!player) continue;
      const progression = applyAccountXp({ level: player.level, xp: Number(player.account_xp), gainedXp: xp });
      await client.query(
        "UPDATE players SET level = $2, account_xp = $3, gold = gold + $4, updated_at = NOW() WHERE id = $1",
        [participant.player_id, progression.newLevel, progression.remainingXp, progression.goldReward],
      );
    }
    for (const [playerId, xp] of xpByPlayer) {
      if (xp > 0) guildXp.push({ playerId, sourceId: `dragon-raid:${resultId}:${playerId}`, xp });
    }
    const lairRow = await this.lairRow(client, raid.guild_id, lair.code);
    const respawnHours = getDragonRespawnHours(lairRow.level);
    for (const participant of participants) {
      await client.query(
        `INSERT INTO player_dragon_respawns (player_id, lair_code, available_at) VALUES ($1, $2, NOW() + make_interval(hours => $3))
         ON CONFLICT (player_id, lair_code) DO UPDATE SET available_at = EXCLUDED.available_at`,
        [participant.player_id, lair.code, respawnHours],
      );
      await client.query(
        "INSERT INTO player_campaign_events (player_id, event_type, payload) VALUES ($1, 'DRAGON_RAID_WON', $2)",
        [participant.player_id, JSON.stringify({ lair: lair.code, resultId })],
      );
    }
    await client.query("UPDATE guild_dragon_lairs SET defeated_count = defeated_count + 1 WHERE guild_id = $1 AND lair_code = $2", [raid.guild_id, lair.code]);
    await client.query(
      `INSERT INTO guild_dragon_raid_results (id, guild_id, lair_code, outcome, leader_name, winner_player_id, winner_name, reward_card, mail_id, participants)
       VALUES ($1, $2, $3, 'won', $4, $5, $6, $7, $8, $9)`,
      [resultId, raid.guild_id, lair.code, this.leaderOf(participants)?.display_name ?? participants[0]?.display_name ?? null,
        winner?.player_id ?? null, winner?.display_name ?? null, JSON.stringify(rewardCard), mailId,
        JSON.stringify(participants.map((participant) => ({
          damage: toSafeInteger(participant.damage_total, "damage"),
          displayName: participant.display_name,
          playerId: participant.player_id,
          pointsAfter: outcome.find((entry) => entry.playerId === participant.player_id)?.pointsAfter ?? 0,
          xp: xpByPlayer.get(participant.player_id) ?? 0,
        })))],
    );
    await this.logJournal(client, raid.guild_id, "dragon_raid_won", winner?.player_id ?? null, `${lair.lairName}: змія переможено, карту отримує ${winner?.display_name ?? "—"}`);
    return this.resetRaid(client, raid, lair);
  }

  /**
   * Guild XP goes in its own short transactions after the raid commits: the guild service locks the member
   * row before the guild row, the opposite of the raid, so doing it inside the raid could deadlock.
   * Each grant is keyed by its source id, so a retry never pays twice.
   */
  private async grantGuildXp(grants: readonly GuildXpGrant[]) {
    if (!this.guildActivity) return;
    for (const grant of grants) {
      let client: PoolClient | null = null;
      try {
        client = await this.pool.connect();
        await client.query("BEGIN");
        await this.guildActivity.recordActivity(client, grant.playerId, "dragon_raid", grant.sourceId, grant.xp);
        await client.query("COMMIT");
      } catch (error) {
        await client?.query("ROLLBACK").catch(() => undefined);
        console.error("Dragon raid guild XP was not recorded", error);
      } finally {
        client?.release();
      }
    }
  }

  async upgradeLair(playerId: string, guildId: string, lairCode: string) {
    const lair = requireLair(lairCode);
    await this.transaction(async (client) => {
      const guild = await this.lockGuild(client, guildId);
      const member = await this.requireMember(client, guildId, playerId);
      if (!UPGRADE_ROLES.includes(member.role)) throw new GuildDragonRaidDomainError("lair_upgrade_forbidden", "Only the leader or an officer can upgrade lairs", 403);
      await this.ensureLairs(client, guildId);
      const row = await client.query<LairRow>("SELECT lair_code, level, defeated_count FROM guild_dragon_lairs WHERE guild_id = $1 AND lair_code = $2 FOR UPDATE", [guildId, lair.code]);
      const current = row.rows[0]?.level ?? 1;
      if (!canUpgradeDragonLair(current, guild.level)) throw new GuildDragonRaidDomainError("lair_upgrade_unavailable", "The lair cannot be above the guild level or level 20");
      const cost = getDragonLairUpgradeCost(lair.kind, current + 1);
      const paid = await client.query(
        `UPDATE guild_treasuries SET ${cost.currency} = ${cost.currency} - $2, updated_at = NOW() WHERE guild_id = $1 AND ${cost.currency} >= $2 RETURNING guild_id`,
        [guildId, cost.amount],
      );
      if (!paid.rows.length) throw new GuildDragonRaidDomainError("insufficient_treasury", "The guild treasury cannot pay for this upgrade");
      await client.query("UPDATE guild_dragon_lairs SET level = level + 1 WHERE guild_id = $1 AND lair_code = $2", [guildId, lair.code]);
      await this.logJournal(client, guildId, "dragon_lair_upgraded", playerId, `${lair.lairName}: рівень ${current + 1}`);
    });
    return this.listLairs(guildId, playerId);
  }
}

/** Leaving or being kicked clears the player's dragon slayer points and dragon enrollment in that guild. */
export async function clearDragonRaidMembership(client: TransactionClient, guildId: string, playerId: string) {
  await client.query("DELETE FROM guild_dragon_slayer_points WHERE guild_id = $1 AND player_id = $2", [guildId, playerId]);
  await client.query(
    `DELETE FROM guild_dragon_raid_participants WHERE player_id = $1
       AND raid_id IN (SELECT id FROM guild_dragon_raids WHERE guild_id = $2)`,
    [playerId, guildId],
  );
}
