import { randomUUID } from "node:crypto";
import {
  GUILD_WAR_GUILD_UNLOCK_LEVEL,
  getCardPower,
  getGuildWarSchedule,
  getRequiredAccountXp,
  isMagicSourceCode,
  pairGuildWars,
  type GuildWarGuildSeed,
} from "@cardastika/game-core";
import type { GuildRole, GuildWarAction, GuildWarParticipantView, GuildWarSideView, GuildWarView } from "@cardastika/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { advanceGuildWarMatch, getGuildWarHistory, GuildWarDomainError, loadGuildWarCombat } from "./guildWarCombat.js";

type TransactionClient = Pick<PoolClient, "query">;
export { GuildWarDomainError } from "./guildWarCombat.js";

interface GuildWarGuildRow extends QueryResultRow, GuildWarGuildSeed {}

interface CycleRow extends QueryResultRow {
  pairings_finalized_at: string | Date | null;
}

interface MatchRow extends QueryResultRow {
  damage_a: string | number;
  damage_b: string | number;
  guild_a_id: string | null;
  guild_a_level: number;
  guild_a_name: string;
  guild_a_rating: number;
  guild_b_id: string | null;
  guild_b_level: number | null;
  guild_b_name: string | null;
  guild_b_rating: number | null;
  id: string;
  mass_battle_wins_a: number;
  mass_battle_wins_b: number;
  winner_guild_id: string | null;
}

interface ParticipantRow extends QueryResultRow {
  deck_power: string | number;
  duel_rating: number;
  guild_id: string | null;
  guild_role: GuildRole;
  player_id: string;
  player_level: number;
  player_name: string;
}

interface GuildRow extends QueryResultRow {
  id: string;
  level: number;
  name: string;
  war_rating: number;
}

function integer(value: number | string, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field}`);
  return parsed;
}

function toParticipant(row: ParticipantRow): GuildWarParticipantView {
  return {
    deckPower: integer(row.deck_power, "deck power"),
    duelRating: integer(row.duel_rating, "duel rating"),
    level: integer(row.player_level, "player level"),
    name: row.player_name,
    playerId: row.player_id,
    role: row.guild_role,
  };
}

export class GuildWarPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Guild war data is unavailable", options);
    this.name = "GuildWarPersistenceError";
  }
}

export class GuildWarService {
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  /** Membership writes share the pairing transaction so they cannot change the pre-war roster. */
  static async prepareRosterForMembershipChange(client: PoolClient, now = new Date()) {
    const schedule = getGuildWarSchedule(now);
    const weekStart = schedule.weekStartsAt.slice(0, 10);
    const table = (await client.query<{ cycles: string | null; combat: string | null }>(
      "SELECT to_regclass('guild_war_cycles')::text AS cycles, to_regclass('guild_war_battle_results')::text AS combat",
    )).rows[0];
    if (!table?.cycles) return null;
    if (schedule.phase === "rest") {
      if (table.combat) {
        const overdueMatches = await client.query<{ id: string }>(
          "SELECT id FROM guild_war_matches WHERE week_start <= $1::date AND settled_at IS NULL ORDER BY week_start, id",
          [weekStart],
        );
        for (const { id } of overdueMatches.rows) await advanceGuildWarMatch(client, id, now);
      }
      return null;
    }
    if (table.combat) await GuildWarService.ensureCycle(client, weekStart, now);
    return weekStart;
  }

  /** Initialize the current week even before its first guild member opens the war screen. */
  async ensureCurrentCycle(now = new Date()) {
    const table = await this.pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('guild_war_battle_results')::text AS table_name",
    );
    if (!table.rows[0]?.table_name) return false;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await GuildWarService.ensureCycle(client, getGuildWarSchedule(now).weekStartsAt.slice(0, 10), now);
      await client.query("COMMIT");
      const unsettled = await client.query<{ id: string }>(
        "SELECT id FROM guild_war_matches WHERE settled_at IS NULL ORDER BY week_start, id",
      );
      for (const { id } of unsettled.rows) {
        await client.query("BEGIN");
        await advanceGuildWarMatch(client, id, now);
        await client.query("COMMIT");
      }
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new GuildWarPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async getWar(playerId: string, guildId: string, now = new Date(), input?: { weekStartsAt: string; action: GuildWarAction }): Promise<GuildWarView> {
    const schedule = getGuildWarSchedule(now);
    if (input && input.weekStartsAt !== schedule.weekStartsAt) {
      throw new GuildWarDomainError("war_week_ended", "The selected week has ended");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const guildResult = await client.query<GuildRow>(
        `SELECT g.id, g.name, g.level, g.war_rating
         FROM guilds g
         INNER JOIN guild_members gm ON gm.guild_id = g.id
         WHERE g.id = $1 AND gm.player_id = $2`,
        [guildId, playerId],
      );
      const guild = guildResult.rows[0];
      if (!guild) throw new GuildWarDomainError("war_not_guild_member", "Only guild members can view their war", 403);

      const weekStart = schedule.weekStartsAt.slice(0, 10);
      if (guild.level >= GUILD_WAR_GUILD_UNLOCK_LEVEL - 1) await GuildWarService.ensureCycle(client, weekStart, now);
      const currentMembership = await client.query<{ role: GuildRole }>(
        "SELECT role FROM guild_members WHERE guild_id = $1 AND player_id = $2",
        [guildId, playerId],
      );
      const membership = currentMembership.rows[0];
      if (!membership) throw new GuildWarDomainError("war_not_guild_member", "Only guild members can view their war", 403);
      const matchId = (await client.query<{ id: string }>(
        `SELECT id FROM guild_war_matches WHERE week_start = $1::date AND (guild_a_id = $2 OR guild_b_id = $2)`,
        [weekStart, guildId],
      )).rows[0]?.id;
      if (matchId) await advanceGuildWarMatch(client, matchId, now);
      const matchResult = await client.query<MatchRow>(
        `SELECT id, guild_a_id, guild_a_name, guild_a_level, guild_a_rating,
                guild_b_id, guild_b_name, guild_b_level, guild_b_rating,
                mass_battle_wins_a, mass_battle_wins_b, damage_a, damage_b, winner_guild_id
         FROM guild_war_matches
         WHERE week_start = $1::date AND (guild_a_id = $2 OR guild_b_id = $2)
         LIMIT 1`,
        [weekStart, guildId],
      );
      const match = matchResult.rows[0];
      if (!match) {
        if (input) throw new GuildWarDomainError("war_no_match", "No guild war match has been scheduled");
        await client.query("COMMIT");
        return {
          endsAt: schedule.endsAt,
          isUnlocked: guild.level >= GUILD_WAR_GUILD_UNLOCK_LEVEL,
          match: null,
          phase: schedule.phase,
          startsAt: schedule.startsAt,
          viewerIsRostered: false,
          weekStartsAt: schedule.weekStartsAt,
          unlockLevel: GUILD_WAR_GUILD_UNLOCK_LEVEL,
        };
      }

      const guildIsA = match.guild_a_id === guildId;
      const currentGuild: GuildWarSideView = {
        guildId,
        level: guildIsA ? match.guild_a_level : match.guild_b_level ?? guild.level,
        memberCount: 0,
        name: guildIsA ? match.guild_a_name : match.guild_b_name ?? guild.name,
        warRating: guildIsA ? match.guild_a_rating : match.guild_b_rating ?? integer(guild.war_rating, "war rating"),
        roster: [],
      };
      const opponentId = guildIsA ? match.guild_b_id : match.guild_a_id;
      const opponentName = guildIsA ? match.guild_b_name : match.guild_a_name;
      const opponentLevel = guildIsA ? match.guild_b_level : match.guild_a_level;
      const opponentRating = guildIsA ? match.guild_b_rating : match.guild_a_rating;
      const currentRoster = await this.loadRoster(client, match.id, guildId);
      const opponentRoster = opponentId ? await this.loadRoster(client, match.id, opponentId) : [];
      currentGuild.roster = currentRoster;
      currentGuild.memberCount = currentRoster.length;
      const opponent: GuildWarSideView | null = opponentName === null ? null : {
        guildId: opponentId,
        level: opponentLevel ?? 0,
        memberCount: opponentRoster.length,
        name: opponentName,
        warRating: opponentRating ?? 0,
        roster: opponentRoster,
      };

      const viewerIsRostered = currentRoster.some((participant) => participant.playerId === playerId);
      const combat = await loadGuildWarCombat(client, {
        playerId, guildId, match, schedule, now,
        role: viewerIsRostered ? membership.role : undefined,
        action: input?.action,
      });
      const history = schedule.phase === "results" || schedule.phase === "rest" || schedule.phase === "pairing"
        ? await getGuildWarHistory(client, guildId) : undefined;
      const progress = viewerIsRostered && (input || schedule.phase !== "pairing")
        ? (await client.query<{ account_xp: string; gold: string; level: number }>(
          "SELECT account_xp, gold, level FROM players WHERE id = $1", [playerId],
        )).rows[0] : undefined;
      await client.query("COMMIT");
      return {
        endsAt: schedule.endsAt,
        isUnlocked: true,
        match: {
          opponentDamage: integer(guildIsA ? match.damage_b : match.damage_a, "guild war damage"),
          opponentMassBattleWins: integer(guildIsA ? match.mass_battle_wins_b : match.mass_battle_wins_a, "guild war wins"),
          ownDamage: integer(guildIsA ? match.damage_a : match.damage_b, "guild war damage"),
          ownMassBattleWins: integer(guildIsA ? match.mass_battle_wins_a : match.mass_battle_wins_b, "guild war wins"),
          guild: currentGuild,
          opponent,
          winnerGuildId: match.winner_guild_id,
        },
        phase: schedule.phase,
        startsAt: schedule.startsAt,
        viewerIsRostered,
        weekStartsAt: schedule.weekStartsAt,
        unlockLevel: GUILD_WAR_GUILD_UNLOCK_LEVEL,
        ...combat,
        history,
        ...(progress ? { playerProgress: {
          accountXp: integer(progress.account_xp, "player XP"),
          accountXpRequired: getRequiredAccountXp(progress.level),
          gold: integer(progress.gold, "player gold"),
          level: progress.level,
        } } : {}),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuildWarDomainError) throw error;
      throw new GuildWarPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  private static async ensureCycle(client: PoolClient, weekStart: string, now: Date) {
    const current = await client.query<CycleRow>(
      "SELECT pairings_finalized_at FROM guild_war_cycles WHERE week_start = $1::date",
      [weekStart],
    );
    if (current.rows[0]?.pairings_finalized_at) return;
    await client.query("SELECT pg_advisory_xact_lock(103, hashtext($1))", [weekStart]);
    await client.query(
      "INSERT INTO guild_war_cycles (week_start) VALUES ($1::date) ON CONFLICT (week_start) DO NOTHING",
      [weekStart],
    );
    const cycle = await client.query<CycleRow>(
      "SELECT pairings_finalized_at FROM guild_war_cycles WHERE week_start = $1::date FOR UPDATE",
      [weekStart],
    );
    if (cycle.rows[0]?.pairings_finalized_at) return;

    // Results may still be pending if the server was offline when the last battle ended.
    const previousMatches = await client.query<{ id: string }>(
      "SELECT id FROM guild_war_matches WHERE week_start < $1::date AND settled_at IS NULL ORDER BY week_start, id",
      [weekStart],
    );
    for (const { id } of previousMatches.rows) await advanceGuildWarMatch(client, id, now);

    const eligibleResult = await client.query<GuildRow>(
      `SELECT g.id, g.name, g.level, g.war_rating
       FROM guilds g
       WHERE g.level >= $1
         AND EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = g.id)
       ORDER BY g.war_rating DESC, g.level DESC, g.name_key ASC`,
      [GUILD_WAR_GUILD_UNLOCK_LEVEL],
    );
    const eligible = eligibleResult.rows.map(this.toGuildSeed);
    let level34Candidates: GuildWarGuildSeed[] = [];
    if (eligible.length % 2 === 1) {
      const candidates = await client.query<GuildRow>(
        `SELECT g.id, g.name, g.level, g.war_rating
         FROM guilds g
         WHERE g.level = $1
           AND EXISTS (SELECT 1 FROM guild_members gm WHERE gm.guild_id = g.id)
         ORDER BY g.war_rating DESC, g.name_key ASC`,
        [GUILD_WAR_GUILD_UNLOCK_LEVEL - 1],
      );
      level34Candidates = candidates.rows.map(this.toGuildSeed);
    }
    const pairings = pairGuildWars(eligible, level34Candidates);
    for (const pairing of pairings) {
      const matchId = randomUUID();
      await client.query(
        `INSERT INTO guild_war_matches (
           id, week_start, guild_a_id, guild_a_name, guild_a_level, guild_a_rating,
           guild_b_id, guild_b_name, guild_b_level, guild_b_rating
         ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          matchId,
          weekStart,
          pairing.guildA.id,
          pairing.guildA.name,
          pairing.guildA.level,
          pairing.guildA.warRating,
          pairing.guildB?.id ?? null,
          pairing.guildB?.name ?? null,
          pairing.guildB?.level ?? null,
          pairing.guildB?.warRating ?? null,
        ],
      );
      await this.snapshotGuildRoster(client, weekStart, matchId, pairing.guildA.id);
      if (pairing.guildB) await this.snapshotGuildRoster(client, weekStart, matchId, pairing.guildB.id);
    }
    await client.query(
      "UPDATE guild_war_cycles SET pairings_finalized_at = $2 WHERE week_start = $1::date",
      [weekStart, now],
    );
  }

  private static toGuildSeed(row: GuildRow): GuildWarGuildSeed {
    return {
      id: row.id,
      level: integer(row.level, "guild level"),
      name: row.name,
      warRating: integer(row.war_rating, "war rating"),
    };
  }

  private static async snapshotGuildRoster(client: TransactionClient, weekStart: string, matchId: string, guildId: string) {
    await client.query(
      `INSERT INTO guild_war_participants (
         week_start, match_id, guild_id, player_id, player_name, player_level, duel_rating, guild_role
       )
       SELECT $1::date, $2, gm.guild_id, p.id,
              COALESCE(NULLIF(BTRIM(p.nickname), ''), NULLIF(BTRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), NULLIF(BTRIM(p.username), ''), 'Гравець'),
              p.level, p.duel_rating, gm.role
       FROM guild_members gm
       INNER JOIN players p ON p.id = gm.player_id
       WHERE gm.guild_id = $3
       ORDER BY p.duel_rating DESC, p.level DESC, gm.joined_at, p.id
       ON CONFLICT (week_start, player_id) DO NOTHING`,
      [weekStart, matchId, guildId],
    );
    const powerRows = await client.query<{ player_id: string; level: number; bonus_power: number; code: string }>(
      `SELECT p.player_id, pci.level, pci.bonus_power, c.code
       FROM guild_war_participants p
       JOIN player_decks d ON d.player_id = p.player_id
       JOIN deck_slots s ON s.deck_id = d.id
       JOIN player_card_instances pci ON pci.id = s.card_instance_id
       JOIN cards c ON c.id = pci.card_id
       WHERE p.match_id = $1 AND p.guild_id = $2`,
      [matchId, guildId],
    );
    const guildCard = (await client.query<{ level: number; bonus_power: number; code: string }>(
      "SELECT gc.level, gc.bonus_power, c.code FROM guild_cards gc JOIN cards c ON c.id = gc.card_id WHERE gc.guild_id = $1",
      [guildId],
    )).rows[0];
    const guildPower = guildCard ? getCardPower({ level: guildCard.level, bonusPower: guildCard.bonus_power, magicSource: isMagicSourceCode(guildCard.code) }) : 0;
    const powers = new Map<string, number>();
    for (const { player_id, level, bonus_power, code } of powerRows.rows) {
      powers.set(player_id, (powers.get(player_id) ?? guildPower) + getCardPower({ level, bonusPower: bonus_power, magicSource: isMagicSourceCode(code) }));
    }
    const deckPowers = Array.from(powers, ([player_id, deck_power]) => ({ player_id, deck_power }));
    if (deckPowers.length) {
      await client.query(
        `UPDATE guild_war_participants p SET deck_power = power.deck_power
         FROM jsonb_to_recordset($3::jsonb) AS power(player_id uuid, deck_power bigint)
         WHERE p.match_id = $1 AND p.guild_id = $2 AND p.player_id = power.player_id`,
        [matchId, guildId, JSON.stringify(deckPowers)],
      );
    }
  }

  private async loadRoster(client: TransactionClient, matchId: string, guildId: string) {
    const result = await client.query<ParticipantRow>(
      `SELECT player_id, player_name, player_level, duel_rating, guild_role, guild_id, deck_power
       FROM guild_war_participants
       WHERE match_id = $1 AND guild_id = $2
       ORDER BY deck_power DESC, duel_rating DESC, player_level DESC, player_name ASC`,
      [matchId, guildId],
    );
    return result.rows.map(toParticipant);
  }
}
