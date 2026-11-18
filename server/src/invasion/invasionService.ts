import { randomUUID } from "node:crypto";
import {
  applyAccountXp,
  calculateBattleReward,
  createInvasionBattle,
  getEffectiveDeckPower,
  getInvasionAttackDiamonds,
  getInvasionAttackSilver,
  getInvasionAttackXp,
  getInvasionBoss,
  getInvasionPauseAfterBoss,
  getInvasionPowerPct,
  getInvasionStanding,
  getNextInvasionStart,
  getStartingHp,
  hasInvasionFortuneTitle,
  INVASION_BOSS_COUNT,
  INVASION_DAILY_DIAMONDS,
  INVASION_CARD_SWAP_GOLD,
  quoteInvasionAttack,
  resolveInvasionPrizes,
  resolveInvasionStrike,
  rollInvasionBossDeck,
  runInvasionAutobattle,
  shuffleCards,
  swapInvasionCards,
  type InvasionCollectionCode,
  type RandomSource,
} from "@cardastika/game-core";
import {
  DUEL_LEAGUE_CONFIG,
  INVASION_UNLOCK_DUEL_LEAGUE_INDEX,
  isInvasionUnlocked,
  type CardElement,
  type DuelCardSnapshot,
  type InvasionAttackRequest,
  type InvasionAttackResultView,
  type InvasionBossDefeatView,
  type InvasionBossView,
  type InvasionGuildRatingResponse,
  type InvasionPrizeKindView,
  type InvasionPrizeView,
  type InvasionStrikeRequest,
  type InvasionSwapRequest,
  type InvasionView,
} from "@cardastika/shared";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { getAccountBoostStatus } from "../boosts/accountBoost.js";
import { getSeasonWindow } from "../battlePassConfig.js";
import { getCurrencyBoostStatus } from "../boosts/currencyBoost.js";
import { CryptoCardRandomSource, createStandardCardInstance } from "../cards/cardInstanceCreator.js";
import { COLLECTION_CARDS, COLLECTIONS } from "../collections/collectionCatalog.js";
import { recordCardDiscovery } from "../collections/discoveryService.js";
import { recalculateAutomaticDeck } from "../decks/automaticDeckService.js";
import type { GuildActivityRecorder } from "../guild/guildService.js";
import { DuelDeckInvalidError, loadDuelParticipant, toGuildDuelCard } from "../duel/duelService.js";
import {
  appendLog,
  applyInvasionPowerPct,
  buildBossDeckSnapshots,
  pickRandom,
  toBattleView,
  toIso,
  toLogEntry,
  toSafeNumber,
  type InvasionCardRow,
  type StoredInvasionBattle,
  type StoredInvasionState,
} from "./invasionHelpers.js";

type Client = Pick<PoolClient, "query">;

export type InvasionErrorCode =
  | "invasion_locked"
  | "invasion_not_active"
  | "invasion_boss_not_ready"
  | "invasion_battle_active"
  | "invasion_battle_not_found"
  | "invasion_battle_finished"
  | "invasion_state_conflict"
  | "invasion_slot_not_ready"
  | "invasion_nothing_to_swap"
  | "invasion_price_changed"
  | "invasion_deck_invalid"
  | "invasion_permit_none"
  | "invasion_permit_active"
  | "insufficient_gold";

export class InvasionDomainError extends Error {
  constructor(public readonly code: InvasionErrorCode, message: string, public readonly status = 409) {
    super(message);
    this.name = "InvasionDomainError";
  }
}

export class InvasionPersistenceError extends Error {
  constructor(options: ErrorOptions) {
    super("Invasion data is unavailable", options);
    this.name = "InvasionPersistenceError";
  }
}

const ADVISORY_LOCK_KEY = 7_340_098;
const ELEMENTS: readonly CardElement[] = ["fire", "water", "air", "earth"];
const INVASION_COLLECTION_CODES: readonly InvasionCollectionCode[] = ["umutants", "usoldiers", "ugiants", "ufavorites", "ugenerals"];
const TOP_SIZE = 10;
const GUILD_TOP_SIZE = 50;
const MAX_DEFEATS_PER_VIEW = 50;
const DISPLAY_NAME_SQL = `COALESCE(NULLIF(BTRIM(players.nickname), ''), NULLIF(BTRIM(players.username), ''), NULLIF(BTRIM(players.first_name), ''), 'Гравець')`;
const LEAGUE_NAME = DUEL_LEAGUE_CONFIG.leagues[INVASION_UNLOCK_DUEL_LEAGUE_INDEX]!.name;

export const INVASION_CARDS_BY_COLLECTION = Object.fromEntries(INVASION_COLLECTION_CODES.map((code) => {
  const collection = COLLECTIONS.find((entry) => entry.code === code);
  if (!collection) throw new Error(`Invasion collection ${code} is missing from the catalog`);
  return [code, collection.cards.map((card) => card.id)];
})) as Record<InvasionCollectionCode, string[]>;
const PRIZE_CARD_IDS = INVASION_COLLECTION_CODES.flatMap((code) => INVASION_CARDS_BY_COLLECTION[code]);
const CARD_DEFINITIONS = new Map(COLLECTION_CARDS.map((card) => [card.id, card]));

interface EventRow extends QueryResultRow {
  number: number;
  starts_at: Date | string;
  current_boss: number;
  boss_health: number | string;
  boss_appears_at: Date | string;
  boss_deck: DuelCardSnapshot[];
  finished_at: Date | string | null;
}

interface PlayerRow extends QueryResultRow {
  level: number;
  account_xp: number | string;
  gold: number | string;
  duel_rating: number | string;
  duel_highest_league_index: number | string;
}

interface ParticipantRow extends QueryResultRow {
  damage: number | string;
  super_strikes: number;
  attacks: number;
  last_attack_at: Date | string | null;
}

interface BattleRow extends QueryResultRow {
  id: string;
  player_id: string;
  invasion_number: number;
  boss_number: number;
  state: StoredInvasionState;
  log: StoredInvasionBattle["log"];
  version: number;
  finished: boolean;
}

interface PlayerContext {
  cards: DuelCardSnapshot[];
  deckPower: number;
  hp: number;
  modifiers: StoredInvasionState["modifiers"];
}

interface ViewOptions {
  /** `undefined`: read the open battle; `null` or a row: show exactly that. */
  battle?: BattleRow | null;
  lastResult?: InvasionAttackResultView | null;
}

const BATTLE_COLUMNS = "id, player_id, invasion_number, boss_number, state, log, version, finished";
const PARTICIPANT_COLUMNS = "damage, super_strikes, attacks, last_attack_at";

function toStored(row: BattleRow): StoredInvasionBattle {
  return { id: row.id, version: row.version, boss_number: row.boss_number, state: row.state, log: row.log, finished: row.finished };
}

function isBossAlive(event: EventRow, battle: Pick<BattleRow, "invasion_number" | "boss_number">) {
  return event.number === battle.invasion_number && event.current_boss === battle.boss_number
    && toSafeNumber(event.boss_health, "boss health") > 0;
}

/**
 * «Навала Шуліки» (docs/invasion.md). Lock order in write transactions: event row, then the player's battle, then the player, then participant rows.
 * Reads (GET, the view after a write) never hold the event lock; they only lock when they must write (settle, new invasion).
 * Every timestamp comes from `now()` so quotes, cycles and breaks use one clock.
 */
export class InvasionService {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly random: RandomSource = Math.random,
    private readonly now: () => number = Date.now,
    private readonly cardRandom = new CryptoCardRandomSource(),
    private readonly guildActivity?: GuildActivityRecorder,
  ) {}

  /** A plain connection (no transaction) for reads. */
  private async read<T>(work: (client: PoolClient) => Promise<T>) {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new InvasionPersistenceError({ cause: error });
    }
    try {
      return await work(client);
    } catch (error) {
      if (error instanceof InvasionDomainError || error instanceof InvasionPersistenceError) throw error;
      throw new InvasionPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new InvasionPersistenceError({ cause: error });
    }
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof InvasionDomainError) throw error;
      throw new InvasionPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------- events

  private async latestEvent(client: Client) {
    const result = await client.query<EventRow>("SELECT * FROM invasion_events ORDER BY number DESC LIMIT 1");
    return result.rows[0] ?? null;
  }

  /** Creates the next invasion lazily; the advisory lock keeps two first requests from creating two. */
  private async ensureEvent(client: Client): Promise<EventRow> {
    const latest = await this.latestEvent(client);
    if (latest && !latest.finished_at) return latest;
    await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
    const again = await this.latestEvent(client);
    if (again && !again.finished_at) return again;
    const number = (again?.number ?? 0) + 1;
    const startsAt = new Date(getNextInvasionStart(again?.finished_at ? new Date(again.finished_at).getTime() : this.now()));
    const boss = getInvasionBoss(1);
    const deck = await this.rollBossDeck(client, 1, number);
    const inserted = await client.query<EventRow>(
      `INSERT INTO invasion_events (number, starts_at, current_boss, boss_health, boss_appears_at, boss_deck)
       VALUES ($1, $2, 1, $3, $2, $4) RETURNING *`,
      [number, startsAt, boss.health, JSON.stringify(deck)],
    );
    return inserted.rows[0]!;
  }

  private async lockEvent(client: Client, number: number) {
    const result = await client.query<EventRow>("SELECT * FROM invasion_events WHERE number = $1 FOR UPDATE", [number]);
    const row = result.rows[0];
    if (!row) throw new InvasionDomainError("invasion_not_active", "The invasion does not exist", 404);
    return row;
  }

  private async rollBossDeck(client: Client, bossNumber: number, eventNumber: number) {
    const boss = getInvasionBoss(bossNumber);
    const seeds = rollInvasionBossDeck(boss, INVASION_CARDS_BY_COLLECTION, ELEMENTS, this.random);
    const rows = await client.query<InvasionCardRow>(
      "SELECT id, code, display_name, art_key FROM cards WHERE id = ANY($1::text[])",
      [[...new Set(seeds.map((seed) => seed.cardId))]],
    );
    return buildBossDeckSnapshots(boss, seeds, new Map(rows.rows.map((row) => [row.id, row])), `invasion${eventNumber}-${randomUUID()}`);
  }

  // ---------------------------------------------------------------- player

  private async loadPlayer(client: Client, playerId: string) {
    const result = await client.query<PlayerRow>(
      "SELECT level, account_xp, gold, duel_rating, duel_highest_league_index FROM players WHERE id = $1",
      [playerId],
    );
    const row = result.rows[0];
    if (!row) throw new InvasionDomainError("invasion_locked", "Player does not exist", 404);
    return row;
  }

  private isUnlocked(player: PlayerRow) {
    return isInvasionUnlocked(Number(player.duel_rating), Number(player.duel_highest_league_index));
  }

  private async powerBonusPct(client: Client, playerId: string) {
    const result = await client.query<{ mechanists: boolean; first_places: string }>(
      `SELECT EXISTS (
          SELECT 1 FROM player_collection_completions completions
          INNER JOIN collections ON collections.id = completions.collection_id
          WHERE completions.player_id = $1 AND collections.code = 'mechanists'
        ) AS mechanists,
        (SELECT COUNT(*) FROM invasion_prizes WHERE player_id = $1 AND kind = 'first_place') AS first_places`,
      [playerId],
    );
    const row = result.rows[0];
    return getInvasionPowerPct({ hasMechanists: row?.mechanists === true, firstPlaces: Number(row?.first_places ?? 0) });
  }

  private async hasTreasureHunters(client: Client, playerId: string) {
    const result = await client.query(
      `SELECT 1 FROM player_collection_completions completions
       INNER JOIN collections ON collections.id = completions.collection_id
       WHERE completions.player_id = $1 AND collections.code = 'treasure_hunters' LIMIT 1`,
      [playerId],
    );
    return result.rows.length > 0;
  }

  private utcDay(nowMs: number) {
    return new Date(nowMs).toISOString().slice(0, 10);
  }

  private async normDiamondsToday(client: Client, playerId: string, nowMs: number) {
    const result = await client.query<{ norm_diamonds: number }>(
      "SELECT norm_diamonds FROM invasion_daily_diamonds WHERE player_id = $1 AND day = $2::date",
      [playerId, this.utcDay(nowMs)],
    );
    return result.rows[0]?.norm_diamonds ?? 0;
  }

  private async permitState(client: Client, playerId: string, invasionNumber: number, bossNumber: number) {
    const result = await client.query<{ owned: number | null; active: boolean }>(
      `SELECT (SELECT hunting_permits FROM player_invasion_items WHERE player_id = $1) AS owned,
         EXISTS (SELECT 1 FROM invasion_permit_activations WHERE player_id = $1 AND invasion_number = $2 AND boss_number = $3) AS active`,
      [playerId, invasionNumber, bossNumber],
    );
    return { owned: result.rows[0]?.owned ?? 0, activeOnBoss: result.rows[0]?.active === true };
  }

  /** Battle deck + the guild's extra card, power raised by the collection/title bonus; null when the deck is not complete. */
  private async loadContext(client: PoolClient, playerId: string): Promise<PlayerContext | null> {
    // "guild_raid" is the closest existing PvE scope ("all_battles" bonuses apply to it); dragon HP is not added.
    const loaded = await loadDuelParticipant(client, playerId, "guild_raid").catch((error: unknown) => {
      if (error instanceof DuelDeckInvalidError) return null;
      throw error;
    });
    if (!loaded) return null;
    const bonusPct = await this.powerBonusPct(client, playerId);
    const guildCard = toGuildDuelCard(loaded.guildCard);
    const cards = [...loaded.snapshot.cards, ...(guildCard ? [guildCard] : [])].map((card) => applyInvasionPowerPct(card, bonusPct));
    const modifiers = loaded.snapshot.modifiers;
    const deckPower = getEffectiveDeckPower(cards.reduce((sum, card) => sum + card.finalPower, 0), modifiers.deckPowerPct);
    return {
      cards,
      deckPower,
      hp: getStartingHp(deckPower, modifiers.battleHpPct),
      modifiers: {
        battleDamagePct: modifiers.battleDamagePct,
        elementDamagePct: modifiers.elementDamagePct,
        strikeMultiplierBonus: modifiers.strikeMultiplierBonus,
        experienceRewardPct: modifiers.experienceRewardPct,
        silverRewardPct: modifiers.silverRewardPct,
      },
    };
  }

  /** Takes the player's row lock up front, so every writer locks players before participant rows. */
  private async lockPlayer(client: Client, playerId: string) {
    await client.query("SELECT 1 FROM players WHERE id = $1 FOR UPDATE", [playerId]);
  }

  private async chargeGold(client: Client, playerId: string, gold: number) {
    if (gold <= 0) return;
    const paid = await client.query("UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1 AND gold >= $2 RETURNING gold", [playerId, gold]);
    if (!paid.rows.length) throw new InvasionDomainError("insufficient_gold", "Not enough gold");
  }

  // ---------------------------------------------------------------- damage, kills, rewards

  /**
   * The event row must be locked. Counts at most the boss's remaining health and kills the boss in this
   * transaction when it reaches zero. Returns the damage that really counted.
   */
  private async applyDamage(client: Client, event: EventRow, playerId: string, damage: number, superStrikes: number) {
    if (damage <= 0) return { counted: 0, killed: false };
    const updated = await client.query<{ boss_health: string }>(
      `UPDATE invasion_events SET boss_health = boss_health - LEAST($1::bigint, boss_health)
       WHERE number = $2 AND current_boss = $3 AND boss_health > 0 RETURNING boss_health`,
      [damage, event.number, event.current_boss],
    );
    if (!updated.rows[0]) return { counted: 0, killed: false };
    await client.query(
      `INSERT INTO invasion_participants (invasion_number, boss_number, player_id, damage, super_strikes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (invasion_number, boss_number, player_id)
       DO UPDATE SET damage = invasion_participants.damage + EXCLUDED.damage,
         super_strikes = invasion_participants.super_strikes + EXCLUDED.super_strikes`,
      [event.number, event.current_boss, playerId, damage, superStrikes],
    );
    const killed = toSafeNumber(updated.rows[0].boss_health, "boss health") === 0;
    if (killed) await this.killBoss(client, event);
    return { counted: damage, killed };
  }

  private async killBoss(client: Client, event: EventRow) {
    const bossNumber = event.current_boss;
    const rows = await client.query<{ player_id: string; damage: string; super_strikes: number }>(
      "SELECT player_id, damage, super_strikes FROM invasion_participants WHERE invasion_number = $1 AND boss_number = $2 AND damage > 0",
      [event.number, bossNumber],
    );
    // «Улюбленець фортуни»: 100 super strikes over all invasions.
    const totals = await client.query<{ player_id: string; total: string }>(
      "SELECT player_id, SUM(super_strikes) AS total FROM invasion_participants WHERE player_id = ANY($1::uuid[]) GROUP BY player_id",
      [rows.rows.map((row) => row.player_id)],
    );
    const fortune = new Set(totals.rows.filter((row) => hasInvasionFortuneTitle(Number(row.total))).map((row) => row.player_id));
    const prizes = resolveInvasionPrizes(bossNumber, rows.rows.map((row) => ({
      playerId: row.player_id,
      damage: toSafeNumber(row.damage, "damage"),
      superStrikes: row.super_strikes,
    })), this.random, fortune);
    for (const prize of prizes) {
      await client.query(
        `INSERT INTO invasion_prizes (id, player_id, invasion_number, boss_number, kind, card_id, level, bonus_power)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), prize.playerId, event.number, bossNumber, prize.kind, pickRandom(PRIZE_CARD_IDS, this.random), prize.level, prize.bonusPower],
      );
    }
    const nowMs = this.now();
    if (bossNumber >= INVASION_BOSS_COUNT) {
      await client.query("UPDATE invasion_events SET finished_at = $2 WHERE number = $1", [event.number, new Date(nowMs)]);
      return;
    }
    const next = getInvasionBoss(bossNumber + 1);
    const deck = await this.rollBossDeck(client, next.number, event.number);
    await client.query(
      "UPDATE invasion_events SET current_boss = $2, boss_health = $3, boss_appears_at = $4, boss_deck = $5 WHERE number = $1",
      [event.number, next.number, next.health, new Date(nowMs + getInvasionPauseAfterBoss(bossNumber)), JSON.stringify(deck)],
    );
  }

  /** XP and silver for one attack (reference: XP = damage / 2, silver = damage / deck power × K), with the player's bonuses. */
  private async grantAttackRewards(
    client: Client, playerId: string, invasionNumber: number, bossNumber: number, state: StoredInvasionState, bossKilled: boolean, sourceId: string,
  ): Promise<InvasionAttackResultView> {
    const damage = state.core.damageDealt;
    const result: InvasionAttackResultView = { bossNumber, damage, superStrikes: state.core.superStrikes, xp: 0, silver: 0, diamonds: 0, bossKilled };
    if (damage > 0) {
      const nowDate = new Date(this.now());
      const player = (await client.query<PlayerRow>("SELECT level, account_xp FROM players WHERE id = $1 FOR UPDATE", [playerId])).rows[0];
      if (player) {
        const boost = await getAccountBoostStatus(client, playerId, nowDate);
        const currency = await getCurrencyBoostStatus(client, playerId, nowDate);
        const reward = calculateBattleReward(
          getInvasionAttackXp(damage),
          getInvasionAttackSilver(damage, state.deckPower, bossNumber),
          state.modifiers,
          boost.multiplier,
        );
        result.xp = reward.xp;
        result.silver = reward.silver * currency.multiplier;
        const progression = applyAccountXp({ level: player.level, xp: Number(player.account_xp), gainedXp: result.xp });
        await client.query(
          "UPDATE players SET level = $2, account_xp = $3, silver = silver + $4, gold = gold + $5, updated_at = NOW() WHERE id = $1",
          [playerId, progression.newLevel, progression.remainingXp, result.silver, progression.goldReward],
        );
      }
    }
    await this.grantAttackDiamonds(client, playerId, result);
    if (result.xp > 0) await this.guildActivity?.recordActivity(client, playerId, "invasion_attack", sourceId, result.xp, new Date(this.now()));
    await client.query(
      "UPDATE invasion_participants SET last_xp = $4, last_silver = $5 WHERE invasion_number = $1 AND boss_number = $2 AND player_id = $3",
      [invasionNumber, bossNumber, playerId, result.xp, result.silver],
    );
    return result;
  }

  /** Diamonds for one finished attack, once: the daily norm part is tracked per UTC day. The player row is already locked. */
  private async grantAttackDiamonds(client: Client, playerId: string, result: InvasionAttackResultView) {
    const nowMs = this.now();
    const diamonds = getInvasionAttackDiamonds({
      normDiamondsToday: await this.normDiamondsToday(client, playerId, nowMs),
      hasTreasureHunters: await this.hasTreasureHunters(client, playerId),
      random: this.random,
    });
    if (diamonds.norm > 0) {
      await client.query(
        `INSERT INTO invasion_daily_diamonds (player_id, day, norm_diamonds) VALUES ($1, $2::date, $3)
         ON CONFLICT (player_id, day) DO UPDATE SET norm_diamonds = invasion_daily_diamonds.norm_diamonds + EXCLUDED.norm_diamonds`,
        [playerId, this.utcDay(nowMs), diamonds.norm],
      );
    }
    if (diamonds.total > 0) {
      await client.query(
        `INSERT INTO player_battle_pass_state (player_id, season_id, diamonds) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, season_id) DO UPDATE SET diamonds = player_battle_pass_state.diamonds + EXCLUDED.diamonds, updated_at = NOW()`,
        [playerId, getSeasonWindow(new Date(nowMs)).seasonId, diamonds.total],
      );
    }
    result.diamonds = diamonds.total;
  }

  /** The boss died under someone else's strike: end the battle and pay for the damage already dealt. */
  private async finishDeadBattle(client: Client, battle: BattleRow) {
    await client.query("UPDATE invasion_battles SET finished = TRUE, version = version + 1 WHERE id = $1", [battle.id]);
    return this.grantAttackRewards(client, battle.player_id, battle.invasion_number, battle.boss_number, battle.state, true, `invasion:${battle.id}`);
  }

  private async lockOpenBattle(client: Client, playerId: string) {
    const result = await client.query<BattleRow>(
      `SELECT ${BATTLE_COLUMNS} FROM invasion_battles WHERE player_id = $1 AND finished = FALSE FOR UPDATE`,
      [playerId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Finishes the player's open battle when its boss is already dead. Looks without locks first; only when the
   * boss really is dead does it open a short transaction (event, then battle, then player) and re-check.
   */
  private async settleStaleBattle(playerId: string) {
    const peek = await this.read(async (client) => {
      const battle = (await client.query<BattleRow>(`SELECT ${BATTLE_COLUMNS} FROM invasion_battles WHERE player_id = $1 AND finished = FALSE`, [playerId])).rows[0];
      if (!battle) return null;
      const event = (await client.query<EventRow>("SELECT * FROM invasion_events WHERE number = $1", [battle.invasion_number])).rows[0];
      return event && isBossAlive(event, battle) ? null : battle;
    });
    if (!peek) return null;
    return this.transaction(async (client) => {
      const event = await this.lockEvent(client, peek.invasion_number);
      const battle = await this.lockOpenBattle(client, playerId);
      if (!battle || battle.id !== peek.id || isBossAlive(event, battle)) return null;
      await this.lockPlayer(client, playerId);
      return this.finishDeadBattle(client, battle);
    });
  }

  // ---------------------------------------------------------------- defeats and prizes

  /** Shows each dead boss the player fought once and creates the prize card instances. */
  private async claimDefeats(playerId: string): Promise<InvasionBossDefeatView[]> {
    const pending = await this.read(async (client) => (await client.query(
      `SELECT 1 FROM invasion_participants p INNER JOIN invasion_events e ON e.number = p.invasion_number
       WHERE p.player_id = $1 AND p.defeat_seen_at IS NULL AND p.attacks > 0
         AND (e.current_boss > p.boss_number OR e.finished_at IS NOT NULL) LIMIT 1`,
      [playerId],
    )).rows.length > 0);
    if (!pending) return [];
    return this.transaction((client) => this.claimDefeatsLocked(client, playerId));
  }

  /** No event lock; players row first (same order as every writer), then participants and prizes. */
  private async claimDefeatsLocked(client: PoolClient, playerId: string): Promise<InvasionBossDefeatView[]> {
    await this.lockPlayer(client, playerId);
    const rows = await client.query<{ invasion_number: number; boss_number: number; attacks: number; last_xp: string; last_silver: string }>(
      `SELECT p.invasion_number, p.boss_number, p.attacks, p.last_xp, p.last_silver
       FROM invasion_participants p INNER JOIN invasion_events e ON e.number = p.invasion_number
       WHERE p.player_id = $1 AND p.defeat_seen_at IS NULL AND p.attacks > 0
         AND (e.current_boss > p.boss_number OR e.finished_at IS NOT NULL)
       ORDER BY p.invasion_number, p.boss_number LIMIT ${MAX_DEFEATS_PER_VIEW}
       FOR UPDATE OF p`,
      [playerId],
    );
    const defeats: InvasionBossDefeatView[] = [];
    let created = false;
    for (const row of rows.rows) {
      const prizeRows = await client.query<{ id: string; kind: InvasionPrizeKindView; card_id: string; level: number; bonus_power: number | null }>(
        `SELECT id, kind, card_id, level, bonus_power FROM invasion_prizes
         WHERE player_id = $1 AND invasion_number = $2 AND boss_number = $3 AND seen_at IS NULL ORDER BY created_at, id FOR UPDATE`,
        [playerId, row.invasion_number, row.boss_number],
      );
      const prizes: InvasionPrizeView[] = [];
      for (const prize of prizeRows.rows) {
        const definition = CARD_DEFINITIONS.get(prize.card_id);
        if (!definition) {
          console.error(`Invasion prize card ${prize.card_id} is not in the catalog`);
          await client.query("UPDATE invasion_prizes SET seen_at = NOW() WHERE id = $1", [prize.id]);
          continue;
        }
        const instance = await createStandardCardInstance(client, playerId, definition, prize.level, this.cardRandom, prize.bonus_power ?? undefined);
        await recordCardDiscovery(client, playerId, definition.id);
        created = true;
        await client.query("UPDATE invasion_prizes SET instance_id = $2, seen_at = NOW() WHERE id = $1", [prize.id, instance.instanceId]);
        prizes.push({ bossNumber: row.boss_number, kind: prize.kind, cardId: definition.id, cardName: definition.displayName ?? definition.id, level: prize.level, finalPower: instance.finalPower });
      }
      await client.query(
        "UPDATE invasion_participants SET defeat_seen_at = NOW() WHERE invasion_number = $1 AND boss_number = $2 AND player_id = $3",
        [row.invasion_number, row.boss_number, playerId],
      );
      defeats.push({
        bossNumber: row.boss_number,
        bossName: CARD_DEFINITIONS.get(getInvasionBoss(row.boss_number).cardId)?.displayName ?? `Бос ${row.boss_number}`,
        attacks: row.attacks,
        lastAttack: { xp: toSafeNumber(row.last_xp, "xp"), silver: toSafeNumber(row.last_silver, "silver") },
        prizes,
      });
    }
    if (created) await recalculateAutomaticDeck(client, playerId);
    return defeats;
  }

  // ---------------------------------------------------------------- view

  private lockedView(nowMs: number): InvasionView {
    return {
      serverNow: new Date(nowMs).toISOString(),
      unlocked: false,
      requiredLeagueName: LEAGUE_NAME,
      invasionNumber: 0,
      startsAt: new Date(nowMs).toISOString(),
      boss: null,
      gold: null,
      deckPower: 0,
      powerBonusPct: 0,
      attacksMade: 0,
      quote: null,
      standing: null,
      top: [],
      battle: null,
      lastResult: null,
      defeats: [],
      huntingPermit: { owned: 0, activeOnBoss: false },
      diamondsToday: { norm: 0, limit: INVASION_DAILY_DIAMONDS },
    };
  }

  private async buildView(client: PoolClient, playerId: string, event: EventRow, options: ViewOptions): Promise<InvasionView> {
    const nowMs = this.now();
    const definition = getInvasionBoss(event.current_boss);
    const bossCard = (await client.query<InvasionCardRow>("SELECT id, code, display_name, art_key FROM cards WHERE id = $1", [definition.cardId])).rows[0];
    const boss: InvasionBossView = {
      number: definition.number,
      total: INVASION_BOSS_COUNT,
      cardId: definition.cardId,
      name: bossCard?.display_name ?? CARD_DEFINITIONS.get(definition.cardId)?.displayName ?? `Бос ${definition.number}`,
      artKey: bossCard?.art_key ?? null,
      health: toSafeNumber(event.boss_health, "boss health"),
      maxHealth: definition.health,
      appearsAt: toIso(event.boss_appears_at),
    };
    const participant = (await client.query<ParticipantRow>(
      `SELECT ${PARTICIPANT_COLUMNS} FROM invasion_participants WHERE invasion_number = $1 AND boss_number = $2 AND player_id = $3`,
      [event.number, event.current_boss, playerId],
    )).rows[0];
    const attacksMade = participant?.attacks ?? 0;
    const huntingPermit = await this.permitState(client, playerId, event.number, event.current_boss);
    const quote = quoteInvasionAttack({
      attacksMade,
      lastAttackAt: participant?.last_attack_at ? new Date(participant.last_attack_at).getTime() : null,
      now: nowMs,
      huntingPermit: huntingPermit.activeOnBoss,
    });
    const battle = options.battle !== undefined
      ? options.battle
      : (await client.query<BattleRow>(`SELECT ${BATTLE_COLUMNS} FROM invasion_battles WHERE player_id = $1 AND finished = FALSE`, [playerId])).rows[0] ?? null;
    // An invalid deck must not break the page: only attacking is refused.
    const context = await this.loadContext(client, playerId);
    const hand = battle && !battle.finished
      ? battle.state.core.playerSlots.map((slot) => slot.card.finalPower)
      : (context?.cards.map((card) => card.finalPower) ?? []);
    const damages = (await client.query<{ damage: string }>(
      "SELECT damage FROM invasion_participants WHERE invasion_number = $1 AND boss_number = $2 AND damage > 0",
      [event.number, event.current_boss],
    )).rows.map((row) => toSafeNumber(row.damage, "damage"));
    const top = (await client.query<{ player_id: string; damage: string; name: string }>(
      `SELECT p.player_id, p.damage, ${DISPLAY_NAME_SQL} AS name
       FROM invasion_participants p INNER JOIN players ON players.id = p.player_id
       WHERE p.invasion_number = $1 AND p.boss_number = $2 AND p.damage > 0
       ORDER BY p.damage DESC, p.player_id LIMIT ${TOP_SIZE}`,
      [event.number, event.current_boss],
    )).rows;
    const goldRow = (await client.query<{ gold: number | string }>("SELECT gold FROM players WHERE id = $1", [playerId])).rows[0];
    return {
      serverNow: new Date(nowMs).toISOString(),
      unlocked: true,
      requiredLeagueName: LEAGUE_NAME,
      invasionNumber: event.number,
      startsAt: toIso(event.starts_at),
      boss,
      gold: goldRow ? Number(goldRow.gold) : null,
      deckPower: context?.deckPower ?? 0,
      powerBonusPct: await this.powerBonusPct(client, playerId),
      attacksMade,
      quote: {
        attackNumber: quote.attackNumber,
        readyAt: quote.readyAt === null ? null : new Date(quote.readyAt).toISOString(),
        gold: quote.gold,
        autoGold: quote.autoGold,
      },
      standing: getInvasionStanding(damages, participant ? toSafeNumber(participant.damage, "damage") : 0, hand.length ? Math.max(...hand) : 1),
      top: top.map((row, index) => ({ place: index + 1, playerId: row.player_id, name: row.name, damage: toSafeNumber(row.damage, "damage") })),
      battle: battle ? toBattleView(toStored(battle), nowMs) : null,
      lastResult: options.lastResult ?? null,
      defeats: [],
      huntingPermit,
      diamondsToday: {
        norm: await this.normDiamondsToday(client, playerId, nowMs),
        limit: INVASION_DAILY_DIAMONDS * ((await this.hasTreasureHunters(client, playerId)) ? 2 : 1),
      },
    };
  }

  /**
   * Full view: creates the next invasion if needed, settles a stale battle, claims defeats and prizes (each in its
   * own short transaction), then reads the state without holding any lock.
   */
  private async fullView(playerId: string, options: ViewOptions = {}): Promise<InvasionView> {
    const unlocked = await this.read(async (client) => this.isUnlocked(await this.loadPlayer(client, playerId)));
    if (!unlocked) return this.lockedView(this.now());
    const latest = await this.read((client) => this.latestEvent(client));
    if (!latest || latest.finished_at) await this.transaction((client) => this.ensureEvent(client));
    const settled = options.battle === undefined ? await this.settleStaleBattle(playerId) : null;
    const defeats = await this.claimDefeats(playerId);
    return this.read(async (client) => {
      // Read the event after settling: a kill meanwhile has already advanced it.
      const event = await this.latestEvent(client);
      const view = await this.buildView(client, playerId, event!, { ...options, lastResult: options.lastResult ?? settled });
      return { ...view, defeats };
    });
  }

  async getView(playerId: string): Promise<InvasionView> {
    return this.fullView(playerId);
  }

  // ---------------------------------------------------------------- attack

  async attack(playerId: string, input: InvasionAttackRequest, auto = false): Promise<InvasionView> {
    const expectedGold = input.expectedGold;
    if (!Number.isSafeInteger(expectedGold) || expectedGold < 0) throw new InvasionDomainError("invasion_price_changed", "expectedGold must be a non-negative whole number", 400);
    const done = await this.transaction(async (client): Promise<ViewOptions> => {
      const player = await this.loadPlayer(client, playerId);
      if (!this.isUnlocked(player)) throw new InvasionDomainError("invasion_locked", "The invasion opens in a higher league", 403);
      const context = await this.loadContext(client, playerId);
      if (!context) throw new InvasionDomainError("invasion_deck_invalid", "Потрібна повна бойова колода 3/2/2/2");
      const created = await this.ensureEvent(client);
      const event = await this.lockEvent(client, created.number);
      const nowMs = this.now();
      if (event.finished_at) throw new InvasionDomainError("invasion_not_active", "The invasion is over");
      if (new Date(event.boss_appears_at).getTime() > nowMs) throw new InvasionDomainError("invasion_boss_not_ready", "The boss has not appeared yet");
      const open = await this.lockOpenBattle(client, playerId);
      if (open) {
        if (isBossAlive(event, open)) throw new InvasionDomainError("invasion_battle_active", "Finish the current battle first");
      }
      await this.lockPlayer(client, playerId);
      // A battle whose boss already died is paid out here; its result is shown unless this attack brings a newer one.
      const settled = open && !isBossAlive(event, open) ? await this.finishDeadBattle(client, open) : null;
      const participant = (await client.query<ParticipantRow>(
        `SELECT ${PARTICIPANT_COLUMNS} FROM invasion_participants WHERE invasion_number = $1 AND boss_number = $2 AND player_id = $3`,
        [event.number, event.current_boss, playerId],
      )).rows[0];
      const quote = quoteInvasionAttack({
        attacksMade: participant?.attacks ?? 0,
        lastAttackAt: participant?.last_attack_at ? new Date(participant.last_attack_at).getTime() : null,
        now: nowMs,
        huntingPermit: (await this.permitState(client, playerId, event.number, event.current_boss)).activeOnBoss,
      });
      const price = auto ? quote.autoGold : quote.gold;
      if (price > expectedGold) throw new InvasionDomainError("invasion_price_changed", "The attack price changed");
      await this.chargeGold(client, playerId, price);
      await client.query(
        `INSERT INTO invasion_participants (invasion_number, boss_number, player_id, attacks, last_attack_at)
         VALUES ($1, $2, $3, 1, $4)
         ON CONFLICT (invasion_number, boss_number, player_id)
         DO UPDATE SET attacks = invasion_participants.attacks + 1, last_attack_at = EXCLUDED.last_attack_at`,
        [event.number, event.current_boss, playerId, new Date(nowMs)],
      );
      const core = createInvasionBattle({
        startedAt: nowMs,
        playerHp: context.hp,
        playerCards: shuffleCards(context.cards, this.random),
        bossCards: shuffleCards(event.boss_deck, this.random),
      });
      const state: StoredInvasionState = { core, modifiers: context.modifiers, deckPower: context.deckPower };
      if (!auto) {
        await client.query(
          "INSERT INTO invasion_battles (id, player_id, invasion_number, boss_number, state) VALUES ($1, $2, $3, $4, $5)",
          [randomUUID(), playerId, event.number, event.current_boss, JSON.stringify(state)],
        );
        return settled ? { lastResult: settled } : {};
      }
      const outcome = runInvasionAutobattle({
        state: core,
        modifiers: context.modifiers,
        bossHealthLeft: toSafeNumber(event.boss_health, "boss health"),
        random: this.random,
      });
      const dealt = await this.applyDamage(client, event, playerId, outcome.state.damageDealt, outcome.state.superStrikes);
      const finalState: StoredInvasionState = { ...state, core: { ...outcome.state, damageDealt: dealt.counted } };
      const lastResult = await this.grantAttackRewards(client, playerId, event.number, event.current_boss, finalState, dealt.killed, `invasion:auto:${randomUUID()}`);
      return { battle: null, lastResult };
    });
    return this.fullView(playerId, done);
  }

  async autoBattle(playerId: string, input: InvasionAttackRequest) {
    return this.attack(playerId, input, true);
  }

  // ---------------------------------------------------------------- battle actions

  private requireVersion(version: unknown) {
    if (!Number.isSafeInteger(version) || Number(version) < 1) throw new InvasionDomainError("invasion_state_conflict", "Battle version is invalid", 400);
  }

  /** Locks event, then battle. */
  private async lockBattle(client: Client, playerId: string, battleId: string, expectedVersion: number) {
    const peek = (await client.query<BattleRow>(`SELECT ${BATTLE_COLUMNS} FROM invasion_battles WHERE id = $1 AND player_id = $2`, [battleId, playerId])).rows[0];
    if (!peek) throw new InvasionDomainError("invasion_battle_not_found", "Invasion battle does not exist", 404);
    const event = await this.lockEvent(client, peek.invasion_number);
    const battle = (await client.query<BattleRow>(`SELECT ${BATTLE_COLUMNS} FROM invasion_battles WHERE id = $1 AND player_id = $2 FOR UPDATE`, [battleId, playerId])).rows[0];
    if (!battle) throw new InvasionDomainError("invasion_battle_not_found", "Invasion battle does not exist", 404);
    if (battle.finished) throw new InvasionDomainError("invasion_battle_finished", "This battle is over");
    if (battle.version !== expectedVersion) throw new InvasionDomainError("invasion_state_conflict", "Invasion battle state is stale");
    return { event, battle };
  }

  async strike(playerId: string, input: InvasionStrikeRequest): Promise<InvasionView> {
    if (input.slotIndex !== 0 && input.slotIndex !== 1 && input.slotIndex !== 2) throw new InvasionDomainError("invasion_slot_not_ready", "Card slot is invalid", 400);
    this.requireVersion(input.expectedVersion);
    const done = await this.transaction(async (client): Promise<ViewOptions> => {
      const { event, battle } = await this.lockBattle(client, playerId, input.battleId, input.expectedVersion);
      await this.lockPlayer(client, playerId);
      if (!isBossAlive(event, battle)) {
        const lastResult = await this.finishDeadBattle(client, battle);
        return { battle: null, lastResult };
      }
      let resolved;
      try {
        resolved = resolveInvasionStrike({
          state: battle.state.core,
          slotIndex: input.slotIndex,
          now: this.now(),
          modifiers: battle.state.modifiers,
          bossHealthLeft: toSafeNumber(event.boss_health, "boss health"),
          random: this.random,
        });
      } catch (error) {
        if (error instanceof RangeError) throw new InvasionDomainError("invasion_slot_not_ready", "This card is not ready yet");
        throw error;
      }
      const dealt = await this.applyDamage(client, event, playerId, resolved.countedDamage, resolved.strike.superStrike ? 1 : 0);
      const core = { ...resolved.state, damageDealt: battle.state.core.damageDealt + dealt.counted };
      const finished = dealt.killed || core.playerHp <= 0;
      const state: StoredInvasionState = { ...battle.state, core };
      const log = appendLog(battle.log, [toLogEntry({ ...resolved.strike, playerDamage: dealt.counted })]);
      await client.query(
        "UPDATE invasion_battles SET state = $2, log = $3, version = version + 1, finished = $4 WHERE id = $1",
        [battle.id, JSON.stringify(state), JSON.stringify(log), finished],
      );
      const lastResult = finished ? await this.grantAttackRewards(client, playerId, event.number, battle.boss_number, state, dealt.killed, `invasion:${battle.id}`) : null;
      // A finished battle is shown once more, in its final state, so the client can play the last strike.
      return { battle: { ...battle, state, log, version: battle.version + 1, finished }, lastResult };
    });
    return this.fullView(playerId, done);
  }

  /** «Змінити карти» for 10 gold, any number of times. */
  async swap(playerId: string, input: InvasionSwapRequest): Promise<InvasionView> {
    this.requireVersion(input.expectedVersion);
    const done = await this.transaction(async (client): Promise<ViewOptions> => {
      const { event, battle } = await this.lockBattle(client, playerId, input.battleId, input.expectedVersion);
      await this.lockPlayer(client, playerId);
      if (!isBossAlive(event, battle)) {
        const lastResult = await this.finishDeadBattle(client, battle);
        return { battle: null, lastResult };
      }
      if (battle.state.core.playerQueue.length === 0) throw new InvasionDomainError("invasion_nothing_to_swap", "There are no other cards to bring in");
      await this.chargeGold(client, playerId, INVASION_CARD_SWAP_GOLD);
      const state: StoredInvasionState = { ...battle.state, core: swapInvasionCards(battle.state.core, this.now()) };
      await client.query("UPDATE invasion_battles SET state = $2, version = version + 1 WHERE id = $1", [battle.id, JSON.stringify(state)]);
      return { battle: { ...battle, state, version: battle.version + 1 } };
    });
    return this.fullView(playerId, done);
  }

  // ---------------------------------------------------------------- hunting permit

  /** Spends one «Дозвіл на полювання» on the living boss: its attacks and autobattles cost half until it dies. */
  async activatePermit(playerId: string): Promise<InvasionView> {
    await this.transaction(async (client) => {
      const player = await this.loadPlayer(client, playerId);
      if (!this.isUnlocked(player)) throw new InvasionDomainError("invasion_locked", "The invasion opens in a higher league", 403);
      const created = await this.ensureEvent(client);
      const event = await this.lockEvent(client, created.number);
      if (event.finished_at || new Date(event.boss_appears_at).getTime() > this.now() || toSafeNumber(event.boss_health, "boss health") <= 0) {
        throw new InvasionDomainError("invasion_boss_not_ready", "There is no boss to hunt right now");
      }
      await this.lockPlayer(client, playerId);
      const state = await this.permitState(client, playerId, event.number, event.current_boss);
      if (state.activeOnBoss) throw new InvasionDomainError("invasion_permit_active", "The permit is already active on this boss");
      const spent = await client.query(
        "UPDATE player_invasion_items SET hunting_permits = hunting_permits - 1 WHERE player_id = $1 AND hunting_permits > 0 RETURNING hunting_permits",
        [playerId],
      );
      if (!spent.rows.length) throw new InvasionDomainError("invasion_permit_none", "No hunting permit to use");
      await client.query(
        "INSERT INTO invasion_permit_activations (player_id, invasion_number, boss_number) VALUES ($1, $2, $3)",
        [playerId, event.number, event.current_boss],
      );
    });
    return this.fullView(playerId);
  }

  // ---------------------------------------------------------------- guild rating

  async getGuildRating(): Promise<InvasionGuildRatingResponse> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw new InvasionPersistenceError({ cause: error });
    }
    try {
      const event = await this.latestEvent(client);
      if (!event) return { invasionNumber: 0, rows: [] };
      const result = await client.query<{ guild_id: string; name: string; damage: string }>(
        `SELECT guilds.id AS guild_id, guilds.name, SUM(p.damage) AS damage
         FROM invasion_participants p
         INNER JOIN guild_members members ON members.player_id = p.player_id
         INNER JOIN guilds ON guilds.id = members.guild_id
         WHERE p.invasion_number = $1
         GROUP BY guilds.id, guilds.name HAVING SUM(p.damage) > 0
         ORDER BY damage DESC, guilds.id LIMIT ${GUILD_TOP_SIZE}`,
        [event.number],
      );
      return {
        invasionNumber: event.number,
        rows: result.rows.map((row, index) => ({ place: index + 1, guildId: row.guild_id, name: row.name, damage: toSafeNumber(row.damage, "guild damage") })),
      };
    } catch (error) {
      throw new InvasionPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
