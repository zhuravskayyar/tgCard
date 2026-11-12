import { randomUUID } from "node:crypto";
import {
  TOURNAMENT_LEAGUES,
  TOURNAMENT_PVP_RULES,
  TOURNAMENT_RULES,
  applyAccountXp,
  calculateTournamentRatingChange,
  changeTournamentDuelCards,
  chooseTournamentBuff,
  createTournamentDuel,
  getDominantDeckElement,
  getElementMultiplier,
  getInitialTournamentRating,
  getNextTournamentSchedule,
  getTournamentBattleXp,
  getTournamentBuffOptions,
  getTournamentCollectionBonuses,
  getTournamentCardPower,
  getTournamentFinish,
  getTournamentLeague,
  getTournamentPendingMatches,
  getTournamentPodium,
  getTournamentPrize,
  getTournamentStageAt,
  getTournamentStageWindow,
  isTournamentEligible,
  isTournamentEventComplete,
  planTournamentEvent,
  recordTournamentResult,
  settleTournamentDuelTimeout,
  strikeTournamentDuel,
  syncTournamentDuelSide,
  toTournamentRatingScale,
  type RandomSource,
  type TournamentDuelState,
  type TournamentEventPlan,
  type TournamentFinish,
  type TournamentCollectionBonuses,
} from "@cardastika/game-core";
import {
  ARENA_LEAGUE_CONFIG,
  CARD_ELEMENTS,
  DUEL_LEAGUE_CONFIG,
  getLeagueIndexByRating,
  type CardElement,
  type CardRarity,
  type DuelCardSnapshot,
  type DuelExchange,
  type DuelSideSnapshot,
  type ElementMultiplier,
  type TournamentChatMessage,
  type TournamentChatView,
  type TournamentEventStatus,
  type TournamentLeague,
  type TournamentLobbyView,
  type TournamentPrize,
  type TournamentRegularLeague,
  type TournamentAwardsView,
  type TournamentRunAction,
  type TournamentRunView,
  type TournamentStanding,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { getSeasonWindow } from "../battlePassConfig.js";
import { createMagicSourceInstance, createStandardCardInstance, CryptoCardRandomSource } from "../cards/cardInstanceCreator.js";
import { ChatChannel } from "../chat/chatChannel.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { loadDuelParticipant, toGuildDuelCard } from "../duel/duelService.js";
import type { GuildActivityRecorder } from "../guild/guildService.js";
import { PlayerPersistenceError, PlayerRepository } from "../users/playerRepository.js";

const PRIZE_CATEGORIES = [
  { label: "1 місце", result: { placement: 1 } }, { label: "2 місце", result: { placement: 2 } },
  { label: "3 місце", result: { placement: 3 } }, { label: "4 місце", result: { placement: 4 } },
  { label: "1/4", result: { eliminatedWith: 8 } }, { label: "1/8", result: { eliminatedWith: 16 } },
  { label: "1/16", result: { eliminatedWith: 32 } }, { label: "1/32", result: { eliminatedWith: 64 } },
  { label: "1/64 і раніше", result: { eliminatedWith: 128 } }, { label: "Відбір", result: { qualifier: true } },
] as const;

/** Lowest sub-league of each global league on the reference scale. */
const GLOBAL_LEAGUE_FLOOR_INDEX: Record<TournamentRegularLeague, number> = { conqueror: 9, champion: 12, master: 15, ruler: 18 };
/** Results stay reachable from the lobby for a while after the event. */
const RESULT_VISIBLE_MS = 6 * 60 * 60_000;

interface EntrySnapshot { side: DuelSideSnapshot; deck: DuelCardSnapshot[]; collections?: TournamentCollectionBonuses }

interface MatchRewards { ratingChange: number; xp: number }

interface StoredMatch { duel: TournamentDuelState; rewards?: [MatchRewards, MatchRewards] }

interface EventRow {
  id: string;
  league: TournamentRegularLeague;
  starts_at: Date | string;
  status: TournamentEventStatus;
  plan: TournamentEventPlan | null;
}

interface EntryRow {
  event_id: string;
  player_id: string;
  status: "registered" | "playing" | "eliminated" | "finished" | "cancelled";
  snapshot: EntrySnapshot | null;
  placement: number | null;
  finish_label: string | null;
  prize: TournamentPrize | null;
  prize_granted: TournamentRunView["prizeGranted"] | null;
  rating_change: number;
  xp_earned: number;
}

interface MatchRow { id: string; stage: number; player_a: string; player_b: string; state: StoredMatch; winner_id: string | null }

interface Standing {
  duelRating: number;
  rating: number;
  provisional: boolean;
  league: TournamentRegularLeague;
  leagueIndex: number;
  eligible: boolean;
  hasMasterCup: boolean;
}

const time = (value: Date | string) => typeof value === "string" ? Date.parse(value) : value.getTime();

function displayLeagueIndex(rating: number, league: TournamentRegularLeague) {
  return Math.max(getLeagueIndexByRating(rating, ARENA_LEAGUE_CONFIG), GLOBAL_LEAGUE_FLOOR_INDEX[league]);
}

function stageLabel(plan: TournamentEventPlan, matchId: string | null, stage: number) {
  if (matchId?.startsWith("qual-") || stage < plan.mainStageOffset) return "Відбір";
  if (matchId === "bronze") return "Бій за 3 місце";
  const size = (plan.bracket?.filter(match => match.lane === "upper" && match.round === 1).length ?? 0) * 2;
  const field = size / 2 ** (stage - plan.mainStageOffset);
  return field <= 2 ? "Фінал" : field === 4 ? "Півфінал" : `1/${field / 2} фіналу`;
}

function finishLabel(finish: TournamentFinish) {
  return finish.kind === "placement" ? `${finish.placement} місце` : finish.kind === "qualifier" ? "Відбір" : finish.label;
}

function prizeFor(league: TournamentLeague, finish: TournamentFinish) {
  return getTournamentPrize(league, finish.kind === "placement" ? { placement: finish.placement }
    : finish.kind === "qualifier" ? { qualifier: true } : { eliminatedWith: finish.eliminatedWith });
}

function sideIndexOf(match: MatchRow, playerId: string): 0 | 1 {
  return match.player_a === playerId ? 0 : 1;
}

/**
 * Local development only. The reference has no bots in tournaments; this account lets one
 * tester play a test event alone. It strikes roughly every three seconds, never in production.
 */
const SPARRING_TELEGRAM_USER = { id: "900000000001", username: null, firstName: "Спаринг-партнер", lastName: null, photoUrl: null };
const SPARRING_STRIKE_MS = 3_000;

function sparringStrike(duel: TournamentDuelState, sparringId: string, now: number): TournamentDuelState {
  const index = duel.sides.findIndex(side => side.playerId === sparringId);
  if (index < 0 || duel.result || now < duel.battleStartsAt || now >= duel.endsAt) return duel;
  const side = index as 0 | 1;
  const last = duel.log.find(entry => entry.attacker === side)?.at ?? duel.battleStartsAt - SPARRING_STRIKE_MS;
  if (now - last < SPARRING_STRIKE_MS) return duel;
  const { own } = syncTournamentDuelSide(duel, side, now);
  const slot = ([0, 1, 2] as const).find(candidate => !own.used[candidate]);
  return slot === undefined ? duel : strikeTournamentDuel(duel, side, slot, now);
}

function toExchange(entry: TournamentDuelState["log"][number], perspective: 0 | 1): DuelExchange & { ownStrike: boolean } {
  const own = entry.attacker === perspective;
  const playerMultiplier = (own ? entry.attackerMultiplier : entry.defenderMultiplier) as DuelExchange["playerMultiplier"];
  const enemyMultiplier = (own ? entry.defenderMultiplier : entry.attackerMultiplier) as DuelExchange["enemyMultiplier"];
  return {
    slotIndex: entry.slot,
    turnNumber: entry.turn,
    playerCard: own ? entry.attackerCard : entry.defenderCard,
    enemyCard: own ? entry.defenderCard : entry.attackerCard,
    playerMultiplier,
    enemyMultiplier,
    playerDamage: own ? entry.attackerDamage : entry.defenderDamage,
    enemyDamage: own ? entry.defenderDamage : entry.attackerDamage,
    visualState: playerMultiplier > enemyMultiplier ? "player_strong" : enemyMultiplier > playerMultiplier ? "enemy_strong" : "neutral",
    ownStrike: own,
  };
}

export class TournamentService {
  private readonly chat: ChatChannel;
  private sparringId: string | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly truce = false,
    private readonly random: RandomSource = Math.random,
    private readonly devTools = process.env.NODE_ENV !== "production",
    /** Local sparring partner for solo test events; tests that count entrants turn it off. */
    private readonly sparringPartner = devTools,
    /** Tournament XP also goes to the player's guild (reference: guild XP is the XP members earn). */
    private readonly guildActivity?: GuildActivityRecorder,
  ) {
    this.chat = new ChatChannel(pool, "tournament_chat_messages");
  }

  getChat(): Promise<TournamentChatView> { return this.chat.read(); }

  sendChatMessage(playerId: string, rawBody: string): Promise<TournamentChatMessage> { return this.chat.send(playerId, rawBody); }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try { client = await this.pool.connect(); } catch (cause) { throw new PlayerPersistenceError({ cause }); }
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (cause instanceof TournamentActionError || cause instanceof TournamentRunMissingError || cause instanceof TournamentDeckError) throw cause;
      if (cause instanceof RangeError) throw new TournamentActionError(cause.message);
      throw new PlayerPersistenceError({ cause });
    } finally { client.release(); }
  }

  private async loadStanding(client: Pick<PoolClient, "query">, playerId: string): Promise<Standing> {
    const result = await client.query<{ duel_rating: number; arena_rating: number; rating: number | null; highest_league: TournamentRegularLeague | null; has_master_cup: boolean }>(`
      SELECT p.duel_rating, p.arena_rating, t.rating, t.highest_league,
        EXISTS (
          SELECT 1 FROM tournament_entries e JOIN tournament_events v ON v.id = e.event_id
          WHERE e.player_id = p.id AND v.league = 'master' AND e.placement IS NOT NULL
        ) AS has_master_cup
      FROM players p LEFT JOIN tournament_profiles t ON t.player_id = p.id
      WHERE p.id = $1
    `, [playerId]);
    const row = result.rows[0];
    if (!row) throw new Error("Tournament player is missing");
    const provisional = row.rating === null;
    const rating = row.rating ?? getInitialTournamentRating(toTournamentRatingScale(row.duel_rating), row.arena_rating);
    const league = getTournamentLeague({ rating, highestLeague: row.highest_league ?? undefined, hasMasterCup: row.has_master_cup });
    // Local development opens the tournament to every account for testing; production keeps the duel-league gate.
    const eligible = this.devTools || isTournamentEligible(row.duel_rating);
    return { duelRating: row.duel_rating, rating, provisional, league, leagueIndex: displayLeagueIndex(rating, league), eligible, hasMasterCup: row.has_master_cup };
  }

  /** The event a lobby offers: an open registration of the player's league, created once the window opens. */
  private async upcomingEvent(client: Pick<PoolClient, "query">, league: TournamentRegularLeague, now: Date) {
    const schedule = getNextTournamentSchedule(league, now, this.truce);
    if (schedule.registrationOpen) {
      await client.query(
        "INSERT INTO tournament_events (id, league, starts_at, status) VALUES ($1, $2, $3, 'registration') ON CONFLICT (league, starts_at) DO NOTHING",
        [randomUUID(), league, schedule.startsAt],
      );
    }
    const result = await client.query<EventRow>(
      "SELECT id, league, starts_at, status, plan FROM tournament_events WHERE league = $1 AND status = 'registration' AND starts_at > $2 ORDER BY starts_at LIMIT 1",
      [league, now],
    );
    return { schedule, event: result.rows[0] ?? null };
  }

  /** The player's latest event that is open, running or finished recently. */
  private async currentEntry(client: Pick<PoolClient, "query">, playerId: string, now: Date) {
    const result = await client.query<EntryRow & { league: TournamentRegularLeague; starts_at: Date | string; event_status: TournamentEventStatus; player_display_name: string }>(`
      SELECT e.*, v.league, v.starts_at, v.status AS event_status,
        COALESCE(NULLIF(BTRIM(p.nickname), ''), NULLIF(BTRIM(p.username), ''), p.first_name) AS player_display_name
      FROM tournament_entries e
      JOIN tournament_events v ON v.id = e.event_id
      JOIN players p ON p.id = e.player_id
      WHERE e.player_id = $1 AND (v.status IN ('registration', 'running') OR v.starts_at > $2)
      ORDER BY v.starts_at DESC LIMIT 1
    `, [playerId, new Date(now.getTime() - RESULT_VISIBLE_MS)]);
    return result.rows[0] ?? null;
  }

  private async latestPodium(league: TournamentRegularLeague): Promise<TournamentStanding[] | null> {
    const event = (await this.pool.query<EventRow>(
      "SELECT id, league, starts_at, status, plan FROM tournament_events WHERE league = $1 AND status = 'finished' AND plan IS NOT NULL ORDER BY starts_at DESC LIMIT 1",
      [league],
    )).rows[0];
    if (!event?.plan) return null;
    const podium = getTournamentPodium(event.plan);
    if (!podium?.length) return null;
    const rows = (await this.pool.query<{
      player_id: string;
      snapshot: EntrySnapshot | null;
      rating_at_start: number | null;
      guild_name: string | null;
    }>(`
      SELECT e.player_id, e.snapshot, e.rating_at_start, g.name AS guild_name
      FROM tournament_entries e
      LEFT JOIN guild_members gm ON gm.player_id = e.player_id
      LEFT JOIN guilds g ON g.id = gm.guild_id
      WHERE e.event_id = $1 AND e.player_id = ANY($2::uuid[])
    `, [event.id, podium])).rows;
    const byId = new Map(rows.map(row => [row.player_id, row]));
    return podium.flatMap((id, index) => {
      const row = byId.get(id);
      if (!row?.snapshot || row.rating_at_start === null) return [];
      return [{
        place: (index + 1) as 1 | 2 | 3 | 4,
        participant: {
          playerId: id,
          name: row.snapshot.side.name,
          photoUrl: row.snapshot.side.photoUrl,
          level: row.snapshot.side.level,
          guildName: row.guild_name,
          leagueIndex: displayLeagueIndex(row.rating_at_start, league),
          element: getDominantDeckElement(row.snapshot.deck),
        },
      }];
    });
  }

  async getLobby(playerId: string, now = new Date()): Promise<TournamentLobbyView> {
    await this.tick(now);
    try {
      const standing = await this.loadStanding(this.pool, playerId);
      const { schedule, event } = await this.upcomingEvent(this.pool, standing.league, now);
      const lastStandings = await this.latestPodium(standing.league);
      const entry = await this.currentEntry(this.pool, playerId, now);
      const shown = entry && entry.event_status === "registration" ? { id: entry.event_id, starts_at: entry.starts_at, status: entry.event_status } : event;
      const registeredCount = shown
        ? Number((await this.pool.query<{ count: string }>("SELECT COUNT(*) FROM tournament_entries WHERE event_id = $1", [shown.id])).rows[0]?.count ?? 0)
        : 0;
      return {
        eligible: standing.eligible,
        requiredDuelLeagueName: DUEL_LEAGUE_CONFIG.leagues[TOURNAMENT_PVP_RULES.requiredDuelLeagueIndex]!.name,
        duelRating: standing.duelRating,
        rating: standing.rating,
        ratingProvisional: standing.provisional,
        ratingLeagueIndex: standing.leagueIndex,
        league: standing.league,
        leagueName: TOURNAMENT_LEAGUES[standing.league].name,
        schedule,
        prizes: PRIZE_CATEGORIES.map(({ label, result }) => ({ label, prize: getTournamentPrize(standing.league, result) })),
        leagues: Object.entries(TOURNAMENT_LEAGUES).map(([key, definition]) => ({ league: key as TournamentLeague, ...definition, requiresMasterCup: key === "ruler", weeklyQualification: key === "crown" })),
        event: shown ? {
          id: shown.id,
          startsAt: new Date(time(shown.starts_at)).toISOString(),
          status: shown.status,
          registeredCount,
          registered: entry?.event_id === shown.id,
        } : null,
        lastResults: lastStandings ? { standings: lastStandings } : null,
        runAvailable: Boolean(entry && entry.event_status !== "registration"),
        runActive: Boolean(entry && entry.event_status === "running" && entry.status === "playing"),
        serverNow: now.getTime(),
        devScheduleAvailable: this.devTools,
        rules: {
          registrationMinutes: TOURNAMENT_RULES.registrationMs / 60_000,
          cycleSeconds: TOURNAMENT_RULES.cycleMs / 1000,
          roundSeconds: TOURNAMENT_RULES.roundMs / 1000,
          buffWindowSeconds: TOURNAMENT_PVP_RULES.buffWindowMs / 1000,
          freeCardChanges: TOURNAMENT_RULES.freeCardChanges,
          hpMultiplier: TOURNAMENT_RULES.hpMultiplier,
          buffGold: TOURNAMENT_RULES.buffGold,
          buffPercent: TOURNAMENT_RULES.buffPercent,
          collectionBuffPercent: TOURNAMENT_RULES.collectionBuffPercent,
        },
      };
    } catch (cause) {
      if (cause instanceof PlayerPersistenceError) throw cause;
      throw new PlayerPersistenceError({ cause });
    }
  }

  async getAwards(playerId: string): Promise<TournamentAwardsView> {
    try {
      const profile = (await this.pool.query<{ rating: number; highest_league: TournamentRegularLeague }>("SELECT rating, highest_league FROM tournament_profiles WHERE player_id = $1", [playerId])).rows[0];
      const rows = (await this.pool.query<{ league: TournamentRegularLeague; badge: string | null; count: string }>(`
        SELECT v.league, e.prize->>'badge' AS badge, COUNT(*) AS count
        FROM tournament_entries e JOIN tournament_events v ON v.id = e.event_id
        WHERE e.player_id = $1 AND e.rewarded_at IS NOT NULL
        GROUP BY v.league, e.prize->>'badge'
      `, [playerId])).rows;
      const awards = rows.filter(row => row.badge).map(row => ({ league: row.league, badge: row.badge as TournamentAwardsView["awards"][number]["badge"], count: Number(row.count) }));
      const total = (filter: (badge: string) => boolean) => awards.filter(row => filter(row.badge)).reduce((sum, row) => sum + row.count, 0);
      return {
        played: rows.reduce((sum, row) => sum + Number(row.count), 0),
        rating: profile?.rating ?? null,
        ratingLeagueIndex: profile ? displayLeagueIndex(profile.rating, profile.highest_league) : null,
        cups: total(badge => badge.startsWith("cup_")),
        medals: total(badge => !badge.startsWith("cup_")),
        awards,
      };
    } catch (cause) { throw new PlayerPersistenceError({ cause }); }
  }

  async register(playerId: string, now = new Date()): Promise<TournamentLobbyView> {
    await this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`tournament-entry:${playerId}`]);
      const standing = await this.loadStanding(client, playerId);
      if (!standing.eligible) throw new TournamentActionError("Tournament needs a higher duel league");
      const busy = await client.query(
        "SELECT 1 FROM tournament_entries e JOIN tournament_events v ON v.id = e.event_id WHERE e.player_id = $1 AND v.status IN ('registration', 'running') AND e.status IN ('registered', 'playing')",
        [playerId],
      );
      if (busy.rows.length) throw new TournamentActionError("Already registered for a tournament");
      const { event } = await this.upcomingEvent(client, standing.league, now);
      if (!event) throw new TournamentActionError("Tournament registration is not open");
      const locked = await client.query<EventRow>("SELECT id, status, starts_at FROM tournament_events WHERE id = $1 FOR UPDATE", [event.id]);
      if (locked.rows[0]?.status !== "registration" || time(locked.rows[0].starts_at) <= now.getTime()) throw new TournamentActionError("Tournament registration is closed");
      await client.query("INSERT INTO tournament_entries (event_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, playerId]);
    });
    return this.getLobby(playerId, now);
  }

  async unregister(playerId: string, now = new Date()): Promise<TournamentLobbyView> {
    await this.transaction(async client => {
      const entry = await this.currentEntry(client, playerId, now);
      if (!entry || entry.event_status !== "registration") throw new TournamentActionError("No open tournament registration");
      await client.query("SELECT 1 FROM tournament_events WHERE id = $1 FOR UPDATE", [entry.event_id]);
      await client.query("DELETE FROM tournament_entries e USING tournament_events v WHERE v.id = e.event_id AND v.status = 'registration' AND e.event_id = $1 AND e.player_id = $2", [entry.event_id, playerId]);
    });
    return this.getLobby(playerId, now);
  }

  /** Local testing only: one tester can open an event of their league starting in a minute. */
  async scheduleDevEvent(playerId: string, now = new Date()): Promise<TournamentLobbyView> {
    if (!this.devTools) throw new TournamentActionError("Tournament test events are available only locally");
    await this.transaction(async client => {
      const standing = await this.loadStanding(client, playerId);
      const startsAt = new Date(Math.ceil((now.getTime() + 60_000) / 1000) * 1000);
      await client.query("INSERT INTO tournament_events (id, league, starts_at, status) VALUES ($1, $2, $3, 'registration') ON CONFLICT (league, starts_at) DO NOTHING", [randomUUID(), standing.league, startsAt]);
    });
    const lobby = await this.register(playerId, now);
    // A lone tester gets the local sparring partner, so the test event is not cancelled.
    if (!this.sparringPartner) return lobby;
    const sparringId = await this.resolveSparring();
    if (lobby.event && sparringId !== playerId) {
      await this.pool.query("INSERT INTO tournament_entries (event_id, player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [lobby.event.id, sparringId]);
    }
    return this.getLobby(playerId, now);
  }

  private async resolveSparring() {
    this.sparringId ??= (await new PlayerRepository(this.pool).findOrCreateFromTelegram(SPARRING_TELEGRAM_USER)).id;
    return this.sparringId;
  }

  /** Starts due events and closes expired rounds. Safe to call from every request and a timer. */
  async tick(now = new Date()) {
    let due: EventRow[];
    try {
      due = (await this.pool.query<EventRow>(
        "SELECT id, league, starts_at, status, plan FROM tournament_events WHERE (status = 'registration' AND starts_at <= $1) OR status = 'running' ORDER BY starts_at",
        [now],
      )).rows;
    } catch (cause) { throw new PlayerPersistenceError({ cause }); }
    for (const event of due) {
      let needsWork: boolean;
      try { needsWork = await this.needsAdvance(event, now, this.pool); }
      catch (cause) { throw new PlayerPersistenceError({ cause }); }
      if (!needsWork) continue;
      await this.transaction(async client => {
        const locked = await this.lockEvent(client, event.id, true);
        if (locked) await this.advance(client, locked, now);
      });
    }
  }

  private async lockEvent(client: PoolClient, eventId: string, skipLocked = false) {
    const result = await client.query<EventRow>(
      `SELECT id, league, starts_at, status, plan FROM tournament_events WHERE id = $1 FOR UPDATE${skipLocked ? " SKIP LOCKED" : ""}`,
      [eventId],
    );
    return result.rows[0] ?? null;
  }

  private async start(client: PoolClient, event: EventRow) {
    const entries = (await client.query<{ player_id: string }>("SELECT player_id FROM tournament_entries WHERE event_id = $1 ORDER BY registered_at", [event.id])).rows;
    const seeds: { playerId: string; rating: number }[] = [];
    for (const { player_id: playerId } of entries) {
      let snapshot: EntrySnapshot;
      try {
        const participant = await loadDuelParticipant(client, playerId, "all_battles");
        const guildCard = toGuildDuelCard(participant.guildCard);
        // Additional cards fight in the tournament and count towards its HP.
        const deck = guildCard ? [...participant.snapshot.cards, guildCard] : participant.snapshot.cards;
        const side = { ...participant.snapshot, cards: deck };
        if (this.sparringPartner && participant.player.first_name === SPARRING_TELEGRAM_USER.firstName) {
          side.name = participant.player.first_name;
        }
        const completed = await client.query<{ code: string }>(
          "SELECT c.code FROM player_collection_completions pc JOIN collections c ON c.id = pc.collection_id WHERE pc.player_id = $1",
          [playerId],
        );
        snapshot = { side, deck, collections: getTournamentCollectionBonuses(completed.rows.map(row => row.code)) };
      } catch (cause) {
        if (cause instanceof Error && cause.name === "DuelDeckInvalidError") {
          await client.query("UPDATE tournament_entries SET status = 'cancelled' WHERE event_id = $1 AND player_id = $2", [event.id, playerId]);
          continue;
        }
        throw cause;
      }
      const standing = await this.loadStanding(client, playerId);
      // The first participation fixes the separate tournament rating.
      await client.query(`
        INSERT INTO tournament_profiles (player_id, rating, highest_league, highest_league_index)
        VALUES ($1, $2, $3, $4) ON CONFLICT (player_id) DO NOTHING
      `, [playerId, standing.rating, standing.league, standing.leagueIndex]);
      await client.query("UPDATE tournament_entries SET status = 'playing', snapshot = $3, rating_at_start = $4 WHERE event_id = $1 AND player_id = $2", [event.id, playerId, JSON.stringify(snapshot), standing.rating]);
      seeds.push({ playerId, rating: standing.rating });
    }
    const plan = planTournamentEvent(seeds, this.random);
    if (!plan) {
      await client.query("UPDATE tournament_entries SET status = 'cancelled' WHERE event_id = $1", [event.id]);
      await client.query("UPDATE tournament_events SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [event.id]);
      return null;
    }
    await client.query("UPDATE tournament_events SET status = 'running', plan = $2, updated_at = NOW() WHERE id = $1", [event.id, JSON.stringify(plan)]);
    return { ...event, status: "running" as const, plan };
  }

  /** Pairs due matches, closes finished or expired ones and pays results; the caller holds the event lock. */
  private async advance(client: PoolClient, source: EventRow, now: Date) {
    if (this.sparringPartner && !this.sparringId) {
      const found = await client.query<{ id: string }>("SELECT id FROM players WHERE first_name = $1 ORDER BY created_at LIMIT 1", [SPARRING_TELEGRAM_USER.firstName]);
      this.sparringId = found.rows[0]?.id ?? null;
    }
    let event: EventRow | null = source;
    if (event.status === "registration") {
      if (time(event.starts_at) > now.getTime()) return event;
      event = await this.start(client, event);
      if (!event) return null;
    }
    if (event.status !== "running" || !event.plan) return event;
    if (!await this.needsAdvance(event, now, client)) return event;
    let plan = event.plan;
    const startsAt = time(event.starts_at);
    const currentStage = getTournamentStageAt(startsAt, now.getTime());
    const entries = new Map((await client.query<EntryRow>("SELECT * FROM tournament_entries WHERE event_id = $1", [event.id])).rows.map(row => [row.player_id, row]));
    let didProgress = false;

    for (let guard = 0; guard < 512; guard++) {
      let progressed = false;
      for (const pending of getTournamentPendingMatches(plan)) {
        const existing = (await client.query<MatchRow>("SELECT * FROM tournament_matches WHERE event_id = $1 AND id = $2", [event.id, pending.id])).rows[0];
        if (!existing) {
          if (pending.stage > currentStage) continue;
          const [a, b] = pending.playerIds.map(id => entries.get(id)!.snapshot!) as [EntrySnapshot, EntrySnapshot];
          const duel = createTournamentDuel({
            id: `${event.id}:${pending.id}`,
            battleStartsAt: getTournamentStageWindow(startsAt, pending.stage).battleStartsAt,
            sides: [
              { playerId: pending.playerIds[0], deck: a.deck, modifiers: a.side.modifiers, ...(a.collections ? { collections: a.collections } : {}) },
              { playerId: pending.playerIds[1], deck: b.deck, modifiers: b.side.modifiers, ...(b.collections ? { collections: b.collections } : {}) },
            ],
            random: this.random,
          });
          await client.query(
            "INSERT INTO tournament_matches (event_id, id, stage, player_a, player_b, state) VALUES ($1, $2, $3, $4, $5, $6)",
            [event.id, pending.id, pending.stage, pending.playerIds[0], pending.playerIds[1], JSON.stringify({ duel } satisfies StoredMatch)],
          );
          progressed = true;
          continue;
        }
        let duel = existing.state.duel;
        if (this.sparringPartner && this.sparringId) {
          const acted = sparringStrike(duel, this.sparringId, now.getTime());
          if (acted !== duel && !acted.result) {
            await client.query("UPDATE tournament_matches SET state = $3 WHERE event_id = $1 AND id = $2", [event.id, pending.id, JSON.stringify({ duel: acted } satisfies StoredMatch)]);
          }
          duel = acted;
        }
        duel = settleTournamentDuelTimeout(duel, now.getTime());
        if (!duel.result) continue;
        const winnerId = duel.sides[duel.result.winnerIndex].playerId;
        const loserId = duel.sides[duel.result.winnerIndex === 0 ? 1 : 0].playerId;
        const rewards = await this.payMatch(client, event.id, pending.id, duel);
        await client.query(
          "UPDATE tournament_matches SET state = $3, winner_id = $4, settled_at = $5 WHERE event_id = $1 AND id = $2",
          [event.id, pending.id, JSON.stringify({ duel, rewards } satisfies StoredMatch), winnerId, now],
        );
        plan = recordTournamentResult(plan, pending.id, { winnerId, loserId }, this.random);
        progressed = true;
      }
      if (!progressed) break;
      didProgress = true;
    }

    if (!didProgress && !isTournamentEventComplete(plan)) return event;
    for (const entry of entries.values()) {
      if (entry.status !== "playing") continue;
      const finish = getTournamentFinish(plan, entry.player_id);
      if (finish) await this.finishEntry(client, event, entry.player_id, finish);
    }
    const complete = isTournamentEventComplete(plan);
    await client.query(
      "UPDATE tournament_events SET plan = $2, status = $3, updated_at = NOW() WHERE id = $1",
      [event.id, JSON.stringify(plan), complete ? "finished" : "running"],
    );
    return { ...event, plan, status: complete ? "finished" as const : "running" as const };
  }

  /** Rating and XP after every round for both sides. */
  private async payMatch(client: PoolClient, eventId: string, matchId: string, duel: TournamentDuelState): Promise<[MatchRewards, MatchRewards]> {
    const profiles = new Map((await client.query<{ player_id: string; rating: number; highest_league: TournamentRegularLeague; highest_league_index: number }>(
      "SELECT player_id, rating, highest_league, highest_league_index FROM tournament_profiles WHERE player_id = ANY($1::uuid[]) ORDER BY player_id FOR UPDATE",
      [duel.sides.map(side => side.playerId)],
    )).rows.map(row => [row.player_id, row]));
    const rewards: MatchRewards[] = [];
    const guildXp: { playerId: string; xp: number }[] = [];
    for (const index of [0, 1] as const) {
      const side = duel.sides[index];
      const other = duel.sides[index === 0 ? 1 : 0];
      const profile = profiles.get(side.playerId)!;
      const won = duel.result!.winnerIndex === index;
      const ratingChange = calculateTournamentRatingChange({
        won,
        playerRating: profile.rating,
        opponentRating: profiles.get(other.playerId)!.rating,
        damageDealt: side.damage,
        damageTaken: other.damage,
        playerMaxHp: side.maxHp,
        opponentMaxHp: other.maxHp,
      });
      const rating = Math.max(0, profile.rating + ratingChange);
      const { hasMasterCup } = await this.loadStanding(client, side.playerId);
      const league = getTournamentLeague({ rating, highestLeague: profile.highest_league, hasMasterCup });
      const leagueIndex = displayLeagueIndex(rating, league);
      const promotionSilver = ARENA_LEAGUE_CONFIG.leagues
        .filter(({ index: candidate }) => candidate > profile.highest_league_index && candidate <= leagueIndex)
        .reduce((sum, definition) => sum + definition.promotionReward, 0);
      await client.query(
        "UPDATE tournament_profiles SET rating = $2, highest_league = $3, highest_league_index = GREATEST(highest_league_index, $4), updated_at = NOW() WHERE player_id = $1",
        [side.playerId, rating, league, leagueIndex],
      );

      const xp = getTournamentBattleXp({
        damageDealt: side.damage,
        opponentStartingHp: other.maxHp,
        experiencePercent: Math.max(0, Math.round(side.modifiers.experienceRewardPct)),
        outcome: won ? "win" : "loss",
      });
      const player = (await client.query<{ level: number; account_xp: number | string }>("SELECT level, account_xp FROM players WHERE id = $1 FOR UPDATE", [side.playerId])).rows[0]!;
      const progression = applyAccountXp({ level: player.level, xp: Number(player.account_xp), gainedXp: xp });
      await client.query(
        "UPDATE players SET level = $2, account_xp = $3, gold = gold + $4, silver = silver + $5, updated_at = NOW() WHERE id = $1",
        [side.playerId, progression.newLevel, progression.remainingXp, progression.goldReward, promotionSilver],
      );
      guildXp.push({ playerId: side.playerId, xp });
      await client.query(
        "UPDATE tournament_entries SET rating_change = rating_change + $3, xp_earned = xp_earned + $4 WHERE event_id = $1 AND player_id = $2",
        [eventId, side.playerId, ratingChange, xp],
      );
      rewards.push({ ratingChange, xp });
    }
    // Guild rows are locked only after both player rows, so two guildmates in one match cannot
    // deadlock with a duel that locks one of them and then the guild.
    for (const { playerId, xp } of guildXp) {
      await this.guildActivity?.recordActivity(client, playerId, "tournament_battle", `tournament:${eventId}:${matchId}`, xp);
    }
    return rewards as [MatchRewards, MatchRewards];
  }

  /** Pays the finish prize once: cards for Conquerors, a magic source of a random element above, diamonds into the season. */
  private async finishEntry(client: PoolClient, event: EventRow, playerId: string, finish: TournamentFinish) {
    const prize = prizeFor(event.league, finish);
    const claimed = await client.query(`
      UPDATE tournament_entries SET status = $3, placement = $4, finish_label = $5, prize = $6, rewarded_at = NOW()
      WHERE event_id = $1 AND player_id = $2 AND rewarded_at IS NULL RETURNING player_id
    `, [event.id, playerId, finish.kind === "placement" ? "finished" : "eliminated", finish.kind === "placement" ? finish.placement : null, finishLabel(finish), JSON.stringify(prize)]);
    if (!claimed.rows.length) return;
    let cardName: string | null = null;
    if (prize.reward?.kind === "card" && prize.reward.cardCodes.length) {
      const code = prize.reward.cardCodes[Math.floor(this.random() * prize.reward.cardCodes.length)]!;
      const card = (await client.query<{ id: string; code: string; display_name: string | null; art_key: string | null; element: CardElement; collection_id: string | null; description: string; limited: boolean; min_rarity: CardRarity; source: "standard" | "raid" }>(
        "SELECT id, code, display_name, art_key, element, collection_id, description, limited, min_rarity, source FROM cards WHERE code = $1",
        [code],
      )).rows[0];
      if (card) {
        await createStandardCardInstance(client, playerId, {
          artKey: card.art_key, code: card.code, collectionId: card.collection_id, description: card.description,
          displayName: card.display_name, element: card.element, id: card.id, limited: card.limited,
          minRarity: card.min_rarity, shopEligible: false, source: card.source,
        }, prize.reward.level, new CryptoCardRandomSource());
        await recordCardDiscovery(client, playerId, card.id);
        cardName = card.display_name ?? card.code;
      }
    }
    if (prize.reward?.kind === "source") {
      const element = CARD_ELEMENTS[Math.floor(this.random() * CARD_ELEMENTS.length)]!;
      cardName = (await createMagicSourceInstance(client, playerId, element, prize.reward.level)).displayName;
    }
    if (prize.diamonds) {
      await client.query(
        `INSERT INTO player_battle_pass_state (player_id, season_id, diamonds) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, season_id) DO UPDATE SET diamonds = player_battle_pass_state.diamonds + EXCLUDED.diamonds, updated_at = NOW()`,
        [playerId, getSeasonWindow(new Date()).seasonId, prize.diamonds],
      );
    }
    const granted = { cardName, diamonds: prize.diamonds, sourcePending: false };
    await client.query("UPDATE tournament_entries SET prize_granted = $3 WHERE event_id = $1 AND player_id = $2", [event.id, playerId, JSON.stringify(granted)]);
  }

  async getRun(playerId: string, now = new Date()): Promise<TournamentRunView | null> {
    let eventId: string;
    try {
      const entry = await this.currentEntry(this.pool, playerId, now);
      if (!entry) return null;
      eventId = entry.event_id;
      const event = (await this.pool.query<EventRow>(
        "SELECT id, league, starts_at, status, plan FROM tournament_events WHERE id = $1",
        [eventId],
      )).rows[0];
      if (event && !await this.needsAdvance(event, now, this.pool)) return await this.view(this.pool, playerId, now);
    } catch (cause) { throw new PlayerPersistenceError({ cause }); }
    return this.transaction(async client => {
      // A different request is already advancing this event; show its last committed state.
      const locked = await this.lockEvent(client, eventId, true);
      if (locked) await this.advance(client, locked, now);
      return this.view(client, playerId, now);
    });
  }

  /** Ordinary battle polls read committed state without waiting for the event-wide lock. */
  private async needsAdvance(event: EventRow, now: Date, client: Pick<PoolClient, "query">): Promise<boolean> {
    if (event.status === "registration") return time(event.starts_at) <= now.getTime();
    if (event.status !== "running") return false;
    if (this.sparringPartner || !event.plan) return true;
    const pending = getTournamentPendingMatches(event.plan);
    if (pending.length === 0) return true;
    const existing = new Map((await client.query<{ id: string; has_result: boolean }>(`
      SELECT id, COALESCE(state #> '{duel,result}' <> 'null'::jsonb, false) AS has_result
      FROM tournament_matches WHERE event_id = $1 AND id = ANY($2::text[])
    `, [event.id, pending.map(match => match.id)])).rows.map(row => [row.id, row]));
    const startsAt = time(event.starts_at);
    const currentStage = getTournamentStageAt(startsAt, now.getTime());
    return pending.some(match => {
      const row = existing.get(match.id);
      return row ? row.has_result || getTournamentStageWindow(startsAt, match.stage).endsAt <= now.getTime() : match.stage <= currentStage;
    });
  }

  async action(playerId: string, action: TournamentRunAction, now = new Date()): Promise<TournamentRunView> {
    await this.transaction(async client => {
      const entry = await this.currentEntry(client, playerId, now);
      if (!entry) throw new TournamentRunMissingError();
      const event = await this.lockEvent(client, entry.event_id);
      if (!event) throw new TournamentRunMissingError();
      await this.advance(client, event, now);
      const match = (await client.query<MatchRow>(
        "SELECT * FROM tournament_matches WHERE event_id = $1 AND (event_id::text || ':' || id) = $2 AND $3 IN (player_a, player_b) AND winner_id IS NULL",
        [event.id, action.matchId, playerId],
      )).rows[0];
      if (!match) throw new TournamentActionError("Tournament match is no longer active");
      const index = sideIndexOf(match, playerId);
      const at = now.getTime();
      let duel = match.state.duel;
      if (action.type === "buff") {
        const opponent = duel.sides[index === 0 ? 1 : 0];
        const own = duel.sides[index];
        const options = getTournamentBuffOptions([...own.own.active, ...own.own.reserve], [...opponent.own.active, ...opponent.own.reserve], own.buffPercent);
        if (!options.some(option => option.element === action.element)) throw new TournamentActionError("Choose one of the offered tournament buffs");
        if (at >= duel.battleStartsAt) throw new TournamentActionError("Tournament buffs close when the battle starts");
        // Every choice, including a change, is a new purchase.
        const paid = await client.query("UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold", [playerId, TOURNAMENT_RULES.buffGold]);
        if (!paid.rows[0]) throw new TournamentActionError("Not enough gold for the tournament buff");
        duel = chooseTournamentBuff(duel, index, action.element, at);
      } else if (action.type === "attack") {
        duel = strikeTournamentDuel(duel, index, action.slotIndex, at);
      } else {
        duel = changeTournamentDuelCards(duel, index, at);
      }
      await client.query("UPDATE tournament_matches SET state = $3 WHERE event_id = $1 AND id = $2", [event.id, match.id, JSON.stringify({ duel } satisfies StoredMatch)]);
      if (duel.result) await this.advance(client, (await this.lockEvent(client, event.id))!, now);
    });
    return (await this.getRun(playerId, now))!;
  }

  private async view(client: Pick<PoolClient, "query">, playerId: string, now: Date): Promise<TournamentRunView | null> {
    const entry = await this.currentEntry(client, playerId, now);
    if (!entry) return null;
    const event = (await client.query<EventRow>("SELECT id, league, starts_at, status, plan FROM tournament_events WHERE id = $1", [entry.event_id])).rows[0]!;
    const startsAt = time(event.starts_at);
    const participants = Number((await client.query<{ count: string }>("SELECT COUNT(*) FROM tournament_entries WHERE event_id = $1 AND status <> 'cancelled'", [event.id])).rows[0]?.count ?? 0);
    const balance = (await client.query<{ gold: number | string }>("SELECT gold FROM players WHERE id = $1", [playerId])).rows[0];
    const rating = (await this.loadStanding(client, playerId)).rating;
    const base = {
      eventId: event.id,
      league: event.league,
      leagueName: TOURNAMENT_LEAGUES[event.league].name,
      startsAt: new Date(startsAt).toISOString(),
      serverNow: now.getTime(),
      participants,
      player: entry.snapshot?.side ? { ...entry.snapshot.side, name: entry.player_display_name } : null,
      match: null,
      stage: null,
      buffCost: TOURNAMENT_RULES.buffGold,
      goldAvailable: Number(balance?.gold ?? 0),
      rating,
      ratingChange: entry.rating_change,
      xpEarned: entry.xp_earned,
    } satisfies Partial<TournamentRunView>;

    if (event.status === "registration") return { ...base, status: "waiting" };
    if (event.status === "cancelled" || entry.status === "cancelled") return { ...base, status: "cancelled" };
    const plan = event.plan!;
    const finished = entry.status === "finished" || entry.status === "eliminated";
    const podium = getTournamentPodium(plan);
    const result: TournamentRunView = {
      ...base,
      status: finished ? entry.status as "finished" | "eliminated" : "round_wait",
      ...(entry.placement ? { placement: entry.placement } : {}),
      ...(entry.finish_label ? { finishLabel: entry.finish_label } : {}),
      ...(entry.prize ? { prize: entry.prize } : {}),
      ...(entry.prize_granted ? { prizeGranted: entry.prize_granted } : {}),
    };
    if (podium) {
      // Name and portrait from the tournament snapshot; the guild as it is now.
      const rows = (await client.query<{ player_id: string; snapshot: EntrySnapshot; rating_at_start: number; guild_name: string | null }>(`
        SELECT e.player_id, e.snapshot, e.rating_at_start, g.name AS guild_name
        FROM tournament_entries e
        LEFT JOIN guild_members gm ON gm.player_id = e.player_id
        LEFT JOIN guilds g ON g.id = gm.guild_id
        WHERE e.event_id = $1 AND e.player_id = ANY($2::uuid[])
      `, [event.id, podium])).rows;
      const byId = new Map(rows.map(row => [row.player_id, row]));
      result.standings = podium.map((id, place) => {
        const row = byId.get(id)!;
        return {
          place: (place + 1) as 1 | 2 | 3 | 4,
          participant: {
            playerId: id,
            name: row.snapshot.side.name,
            photoUrl: row.snapshot.side.photoUrl,
            level: row.snapshot.side.level,
            guildName: row.guild_name,
            leagueIndex: displayLeagueIndex(row.rating_at_start, event.league),
            element: getDominantDeckElement(row.snapshot.deck),
          },
        };
      });
    }

    const match = (await client.query<MatchRow>(
      "SELECT * FROM tournament_matches WHERE event_id = $1 AND $2 IN (player_a, player_b) ORDER BY stage DESC, settled_at DESC NULLS FIRST LIMIT 1",
      [event.id, playerId],
    )).rows[0];
    if (!match) {
      // A bye in the qualifier: the first fight is in the next stage.
      if (!finished) {
        const index = Math.max(0, getTournamentStageAt(startsAt, now.getTime())) + 1;
        result.stage = { index, label: stageLabel(plan, null, index), ...getTournamentStageWindow(startsAt, index) };
      }
      return result;
    }
    const index = sideIndexOf(match, playerId);
    const duel = match.state.duel;
    const me = duel.sides[index];
    const them = duel.sides[index === 0 ? 1 : 0];
    const synced = syncTournamentDuelSide(duel, index, now.getTime());
    const ownCards = synced.own.active.map(card => ({ ...card, finalPower: getTournamentCardPower(card, me) })) as [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
    const viewCards = synced.view.active.map(card => ({ ...card, finalPower: getTournamentCardPower(card, them) })) as [DuelCardSnapshot, DuelCardSnapshot, DuelCardSnapshot];
    const opponentSnapshot = (await client.query<{ snapshot: EntrySnapshot; player_display_name: string }>(`
      SELECT e.snapshot,
        COALESCE(NULLIF(BTRIM(p.nickname), ''), NULLIF(BTRIM(p.username), ''), p.first_name) AS player_display_name
      FROM tournament_entries e
      JOIN players p ON p.id = e.player_id
      WHERE e.event_id = $1 AND e.player_id = $2
    `, [event.id, them.playerId])).rows[0]!;
    const opponentName = this.sparringPartner && them.playerId === this.sparringId
      ? opponentSnapshot.snapshot.side.name
      : opponentSnapshot.player_display_name;
    const live = !duel.result && !match.winner_id;
    if (live && !finished) result.status = now.getTime() < duel.battleStartsAt ? "buff_selection" : "battle";
    if (!finished) {
      const index = live ? match.stage : match.stage + 1;
      result.stage = { index, label: live ? stageLabel(plan, match.id, index) : "Наступний раунд", ...getTournamentStageWindow(startsAt, index) };
    }
    const rewards = match.state.rewards?.[index] ?? null;
    result.match = {
      id: duel.id,
      opponent: { ...opponentSnapshot.snapshot.side, id: them.playerId, name: opponentName },
      playerCards: ownCards,
      opponentCards: viewCards,
      pairMultipliers: [0, 1, 2].map(slot => getElementMultiplier(ownCards[slot]!.element, viewCards[slot]!.element)) as [ElementMultiplier, ElementMultiplier, ElementMultiplier],
      playerUsedSlots: [...synced.own.used],
      cycleEndsAt: now.getTime() < duel.battleStartsAt ? duel.battleStartsAt : duel.battleStartsAt + (synced.own.cycle + 1) * TOURNAMENT_RULES.cycleMs,
      playerHp: me.hp,
      playerMaxHp: me.maxHp,
      opponentHp: them.hp,
      opponentMaxHp: them.maxHp,
      playerDamage: me.damage,
      opponentDamage: them.damage,
      log: duel.log.map(row => toExchange(row, index)),
      freeChangeAvailable: me.own.changes < TOURNAMENT_RULES.freeCardChanges,
      buffElement: me.buff,
      outcome: duel.result ? duel.result.winnerIndex === index ? "win" : "loss" : null,
      ratingChange: rewards?.ratingChange ?? null,
      xp: rewards?.xp ?? null,
    };
    if (result.status === "buff_selection") {
      result.buffOptions = getTournamentBuffOptions([...me.own.active, ...me.own.reserve], [...them.own.active, ...them.own.reserve], me.buffPercent);
    }
    return result;
  }
}

export class TournamentDeckError extends Error { constructor() { super("A valid saved 9-card deck is required"); this.name = "TournamentDeckError"; } }
export class TournamentRunMissingError extends Error { constructor() { super("No active tournament"); this.name = "TournamentRunMissingError"; } }
export class TournamentActionError extends Error { constructor(message: string) { super(message); this.name = "TournamentActionError"; } }
export { ChatError as TournamentChatError } from "../chat/chatChannel.js";
