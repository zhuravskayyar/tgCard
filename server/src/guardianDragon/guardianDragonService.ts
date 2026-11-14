import {
  BASE_POWER_BY_LEVEL,
  GUARDIAN_DRAGON_FREE_FIGHTS_COOLDOWN_HOURS,
  GUARDIAN_DRAGON_HIKES,
  GUARDIAN_DRAGON_KEEP_MASTERY_TOP,
  GUARDIAN_DRAGON_MAX_HEALTH,
  GUARDIAN_DRAGON_PAID_FIGHTS_PER_SEND,
  GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES,
  GUARDIAN_DRAGON_START_MASTERY,
  MAGIC_SOURCE_CARD_CODES,
  MAGIC_SOURCE_POWER,
  MAX_CARD_LEVEL,
  addGuardianDragonHealth,
  canStartGuardianDragonHike,
  getGuardianDragonFlamePower,
  getGuardianDragonFreeFights,
  getGuardianDragonHike,
  getGuardianDragonMonthKey,
  getGuardianDragonPaidSendPrice,
  getGuardianDragonStage,
  isGuardianDragonFreeSendReady,
  resolveGuardianDragonFights,
  selectGuardianDragonFeed,
  type GuardianDragonHikeHours,
} from "@cardastika/game-core";
import {
  isArenaUnlocked,
  type CardElement,
  type GuardianDragonFeedResponse,
  type GuardianDragonFightResponse,
  type GuardianDragonRatingResponse,
  type GuardianDragonView,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";

/** Reference: the dragon belongs to mages who reached the third epic duel league, the same gate as the arena. */
const isGuardianDragonUnlocked = isArenaUnlocked;
/** Reference rating list: five dragons a page, twenty pages (the top 100). */
export const GUARDIAN_DRAGON_RATING_PAGE_SIZE = 5;
export const GUARDIAN_DRAGON_RATING_PAGES = 20;
const START_MASTERY_TENTHS = GUARDIAN_DRAGON_START_MASTERY * 10;

export class GuardianDragonLockedError extends Error {
  constructor() { super("The guardian dragon opens in the third epic duel league"); this.name = "GuardianDragonLockedError"; }
}
export class GuardianDragonStateError extends Error {
  constructor(readonly code: "hike_running" | "not_enough_progress" | "no_hike" | "progress_full" | "nothing_to_feed" | "card_not_feedable" | "insufficient_gold" | "price_changed", message: string) {
    super(message);
    this.name = "GuardianDragonStateError";
  }
}
export class GuardianDragonPersistenceError extends Error {
  constructor(options?: { cause?: unknown }) { super("Guardian dragon storage failed", options); this.name = "GuardianDragonPersistenceError"; }
}

interface DragonRow {
  month_key: string;
  health: number;
  mastery_tenths: number;
  progress_minutes: number;
  hike_hours: number | null;
  hike_health_gain: number | null;
  hike_ends_at: Date | null;
  rating: number;
  fights_cooldown_until: Date | null;
  paid_sends: number;
  prev_month_key: string | null;
  prev_rating: number | null;
  flame_level: number;
}

const COLUMNS = "month_key, health, mastery_tenths, progress_minutes, hike_hours, hike_health_gain, hike_ends_at, rating, fights_cooldown_until, paid_sends, prev_month_key, prev_rating, flame_level";

interface PlayerGateRow { duel_rating: number; duel_highest_league_index: number; gold: number }

function nextMonthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

const masteryOf = (row: Pick<DragonRow, "mastery_tenths"> | null) => Math.floor((row?.mastery_tenths ?? START_MASTERY_TENTHS) / 10);

export class GuardianDragonService {
  constructor(private readonly pool: Pool, private readonly options: { now?: () => Date; random?: () => number } = {}) {}

  private now() { return this.options.now?.() ?? new Date(); }

  async getDragon(playerId: string) {
    return this.transaction(async (client, now) => {
      const { row, unlocked } = await this.load(client, playerId, now);
      return this.view(client, playerId, row, unlocked, now);
    });
  }

  async feed(playerId: string, instanceIds?: readonly string[], element?: CardElement): Promise<GuardianDragonFeedResponse> {
    return this.transaction(async (client, now) => {
      const { row } = await this.loadUnlocked(client, playerId, now);
      if (row.progress_minutes >= GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES) {
        throw new GuardianDragonStateError("progress_full", "The progress scale is already full");
      }
      const candidates = await loadFeedableCards(client, playerId, instanceIds, element);
      if (instanceIds && candidates.length !== new Set(instanceIds).size) {
        throw new GuardianDragonStateError("card_not_feedable", "Only your weak cards outside the deck can be fed");
      }
      // Feeding everything starts from the weakest cards, so a full scale never eats a strong one.
      const ordered = instanceIds ? candidates : [...candidates].sort((left, right) => left.power - right.power || left.id.localeCompare(right.id));
      const selection = selectGuardianDragonFeed(row.progress_minutes, ordered);
      if (!selection.cards.length) throw new GuardianDragonStateError("nothing_to_feed", "No weak cards to feed");
      const ids = selection.cards.map(({ id }) => id);
      const deleted = await client.query("DELETE FROM player_card_instances WHERE player_id = $1 AND id = ANY($2::uuid[])", [playerId, ids]);
      if (deleted.rowCount !== ids.length) throw new GuardianDragonPersistenceError();
      const updated = await this.save(client, playerId, { ...row, progress_minutes: selection.progressMinutes });
      return { dragon: await this.view(client, playerId, updated, true, now), consumedInstanceIds: ids };
    });
  }

  async startHike(playerId: string, hours: GuardianDragonHikeHours) {
    return this.transaction(async (client, now) => {
      const { row } = await this.loadUnlocked(client, playerId, now);
      if (row.hike_ends_at) throw new GuardianDragonStateError("hike_running", "The dragon is already on a hike");
      if (!canStartGuardianDragonHike(row.progress_minutes, hours, false)) {
        throw new GuardianDragonStateError("not_enough_progress", "Feed the dragon before this hike");
      }
      const hike = getGuardianDragonHike(hours);
      const updated = await this.save(client, playerId, {
        ...row,
        progress_minutes: row.progress_minutes - hike.minutes,
        hike_hours: hike.hours,
        hike_health_gain: hike.health,
        hike_ends_at: new Date(now.getTime() + hike.minutes * 60_000),
      });
      return this.view(client, playerId, updated, true, now);
    });
  }

  /** Reference: health stays, the fed progress comes back, the hike time is lost. */
  async cancelHike(playerId: string) {
    return this.transaction(async (client, now) => {
      const { row } = await this.loadUnlocked(client, playerId, now);
      if (!row.hike_ends_at || !row.hike_hours) throw new GuardianDragonStateError("no_hike", "The dragon is not on a hike");
      const updated = await this.save(client, playerId, {
        ...row,
        progress_minutes: Math.min(GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES, row.progress_minutes + row.hike_hours * 60),
        hike_hours: null,
        hike_health_gain: null,
        hike_ends_at: null,
      });
      return this.view(client, playerId, updated, true, now);
    });
  }

  /**
   * Reference: the free send plays the health-based number of fights once every 10 hours; while that
   * cooldown runs, every send costs gold, plays 100 fights and the price climbs the ladder.
   */
  async fight(playerId: string, expectedPrice?: number): Promise<GuardianDragonFightResponse> {
    return this.transaction(async (client, now) => {
      const { row, gold } = await this.loadUnlocked(client, playerId, now);
      const free = isGuardianDragonFreeSendReady(row.fights_cooldown_until, now);
      const fights = free ? getGuardianDragonFreeFights(row.health) : GUARDIAN_DRAGON_PAID_FIGHTS_PER_SEND;
      const price = free ? 0 : getGuardianDragonPaidSendPrice(row.paid_sends);
      // The client sends the price it showed, so a retry or a second device never pays without seeing it.
      if (expectedPrice !== undefined && expectedPrice !== price) throw new GuardianDragonStateError("price_changed", "The send price has changed");
      if (price > gold) throw new GuardianDragonStateError("insufficient_gold", "Not enough gold for this send");
      if (price) await client.query("UPDATE players SET gold = gold - $2, updated_at = NOW() WHERE id = $1", [playerId, price]);
      const outcome = resolveGuardianDragonFights(fights, row.mastery_tenths, this.options.random ?? Math.random);
      const updated = await this.save(client, playerId, {
        ...row,
        mastery_tenths: outcome.masteryTenths,
        rating: row.rating + outcome.ratingGain,
        fights_cooldown_until: free ? new Date(now.getTime() + GUARDIAN_DRAGON_FREE_FIGHTS_COOLDOWN_HOURS * 3_600_000) : row.fights_cooldown_until,
        paid_sends: free ? 0 : row.paid_sends + 1,
      });
      return {
        dragon: await this.view(client, playerId, updated, true, now),
        result: {
          fights,
          wins: outcome.wins,
          ratingGain: outcome.ratingGain,
          masteryGain: masteryOf(updated) - masteryOf(row),
          goldSpent: price,
          playerGold: gold - price,
        },
      };
    });
  }

  /** This month's dragon rating, five a page, with the viewer's own place under it. */
  async getRating(playerId: string, page: number): Promise<GuardianDragonRatingResponse> {
    const monthKey = getGuardianDragonMonthKey(this.now());
    const ranked = await this.pool.query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM guardian_dragons WHERE month_key = $1 AND rating > 0",
      [monthKey],
    );
    const totalPages = Math.max(1, Math.min(GUARDIAN_DRAGON_RATING_PAGES, Math.ceil(Number(ranked.rows[0]?.total ?? 0) / GUARDIAN_DRAGON_RATING_PAGE_SIZE)));
    const current = Math.min(Math.max(1, page), totalPages);
    const offset = (current - 1) * GUARDIAN_DRAGON_RATING_PAGE_SIZE;
    const rows = await this.pool.query<{ player_id: string; rating: number; nickname: string | null; username: string | null; first_name: string }>(
      `SELECT dragons.player_id, dragons.rating, players.nickname, players.username, players.first_name
       FROM guardian_dragons dragons INNER JOIN players ON players.id = dragons.player_id
       WHERE dragons.month_key = $1 AND dragons.rating > 0
       ORDER BY dragons.rating DESC, dragons.player_id
       LIMIT $2 OFFSET $3`,
      [monthKey, GUARDIAN_DRAGON_RATING_PAGE_SIZE, offset],
    );
    const viewer = await this.pool.query<{ rating: number; month_key: string; nickname: string | null; username: string | null; first_name: string }>(
      `SELECT dragons.rating, dragons.month_key, players.nickname, players.username, players.first_name
       FROM players LEFT JOIN guardian_dragons dragons ON dragons.player_id = players.id WHERE players.id = $1`,
      [playerId],
    );
    const me = viewer.rows[0];
    const myRating = me && me.month_key === monthKey ? Number(me.rating) : 0;
    return {
      page: current,
      totalPages,
      rows: rows.rows.map((row, index) => ({
        place: offset + index + 1,
        playerId: row.player_id,
        displayName: displayName(row),
        rating: Number(row.rating),
      })),
      viewer: me ? { place: myRating > 0 ? await placeIn(this.pool, monthKey, myRating, playerId) : null, displayName: displayName(me), rating: myRating } : null,
    };
  }

  private async view(client: PoolClient, playerId: string, row: DragonRow | null, unlocked: boolean, now: Date): Promise<GuardianDragonView> {
    const health = row?.health ?? 0;
    const onHike = Boolean(row?.hike_ends_at);
    const mastery = masteryOf(row);
    const collections = await client.query<{ code: string }>(
      `SELECT collections.code FROM player_collection_completions completions
       INNER JOIN collections ON collections.id = completions.collection_id
       WHERE completions.player_id = $1 AND collections.code = ANY($2::text[])`,
      [playerId, ["dragon_fans", "magic_1", "dragon_whisperers"]],
    );
    const codes = new Set(collections.rows.map(({ code }) => code));
    const bonus = { dragonFans: codes.has("dragon_fans") || codes.has("magic_1"), dragonWhisperers: codes.has("dragon_whisperers") };
    const flameLevel = row?.flame_level ?? 90;
    const freeReady = isGuardianDragonFreeSendReady(row?.fights_cooldown_until ?? null, now);
    const rating = row?.rating ?? 0;
    return {
      unlocked,
      monthKey: row?.month_key ?? getGuardianDragonMonthKey(now),
      rebirthAt: nextMonthStart(now).toISOString(),
      health,
      maxHealth: GUARDIAN_DRAGON_MAX_HEALTH,
      stage: getGuardianDragonStage(health),
      mastery,
      progressMinutes: row?.progress_minutes ?? 0,
      progressMaxMinutes: GUARDIAN_DRAGON_PROGRESS_MAX_MINUTES,
      hike: row?.hike_ends_at && row.hike_hours && row.hike_health_gain
        ? { hours: row.hike_hours as GuardianDragonHikeHours, healthGain: row.hike_health_gain, endsAt: row.hike_ends_at.toISOString() }
        : null,
      battleHealthBonus: unlocked && !onHike ? health : 0,
      hikes: GUARDIAN_DRAGON_HIKES.map(({ hours, health: healthGain }) => ({ hours, healthGain })),
      fights: {
        place: row && rating > 0 ? await placeIn(client, row.month_key, rating, playerId) : null,
        rating,
        freeFights: getGuardianDragonFreeFights(health),
        freeReady,
        cooldownUntil: !freeReady && row?.fights_cooldown_until ? row.fights_cooldown_until.toISOString() : null,
        nextPaidPrice: getGuardianDragonPaidSendPrice(freeReady ? 0 : row?.paid_sends ?? 0),
        fightsPerPaidSend: GUARDIAN_DRAGON_PAID_FIGHTS_PER_SEND,
      },
      flame: {
        level: flameLevel,
        power: getGuardianDragonFlamePower(flameLevel, mastery, bonus),
        maxLevel: MAX_CARD_LEVEL,
        powerAtMaxLevel: getGuardianDragonFlamePower(MAX_CARD_LEVEL, mastery, bonus),
        ...bonus,
      },
    };
  }

  private async loadUnlocked(client: PoolClient, playerId: string, now: Date) {
    const { row, unlocked, gold } = await this.load(client, playerId, now);
    if (!unlocked || !row) throw new GuardianDragonLockedError();
    return { row, gold };
  }

  /** Locks the player, creates this month's dragon, finishes a hike that is over and handles rebirth. */
  private async load(client: PoolClient, playerId: string, now: Date): Promise<{ row: DragonRow | null; unlocked: boolean; gold: number }> {
    const player = await client.query<PlayerGateRow>("SELECT duel_rating, duel_highest_league_index, gold FROM players WHERE id = $1 FOR UPDATE", [playerId]);
    const gate = player.rows[0];
    if (!gate) throw new GuardianDragonPersistenceError();
    const gold = Number(gate.gold);
    const unlocked = isGuardianDragonUnlocked(Number(gate.duel_rating), Number(gate.duel_highest_league_index));
    const monthKey = getGuardianDragonMonthKey(now);
    const existing = await client.query<DragonRow>(`SELECT ${COLUMNS} FROM guardian_dragons WHERE player_id = $1 FOR UPDATE`, [playerId]);
    let row = existing.rows[0] ?? null;
    if (!row) {
      if (!unlocked) return { row: null, unlocked, gold };
      const created = await client.query<DragonRow>(
        `INSERT INTO guardian_dragons (player_id, month_key, mastery, mastery_tenths) VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
        [playerId, monthKey, GUARDIAN_DRAGON_START_MASTERY, START_MASTERY_TENTHS],
      );
      return { row: created.rows[0]!, unlocked, gold };
    }
    let changed = false;
    // A hike that ended in the old month still counts for that month, before the rebirth.
    if (row.hike_ends_at && row.hike_ends_at.getTime() <= now.getTime()) {
      row = { ...row, health: addGuardianDragonHealth(row.health, row.hike_health_gain ?? 0), hike_hours: null, hike_health_gain: null, hike_ends_at: null };
      changed = true;
    }
    if (row.month_key !== monthKey) {
      // Reference: the top 100 of the month's rating keep their mastery, everyone else starts again at 45.
      const place = row.rating > 0 ? await placeIn(client, row.month_key, row.rating, playerId) : null;
      const keep = place !== null && place <= GUARDIAN_DRAGON_KEEP_MASTERY_TOP;
      row = {
        ...row,
        month_key: monthKey,
        health: 0,
        mastery_tenths: keep ? row.mastery_tenths : START_MASTERY_TENTHS,
        progress_minutes: 0,
        hike_hours: null,
        hike_health_gain: null,
        hike_ends_at: null,
        prev_month_key: row.month_key,
        prev_rating: row.rating,
        rating: 0,
      };
      changed = true;
    }
    if (changed) row = await this.save(client, playerId, row);
    return { row, unlocked, gold };
  }

  private async save(client: PoolClient, playerId: string, row: DragonRow) {
    const result = await client.query<DragonRow>(
      `UPDATE guardian_dragons
       SET month_key = $2, health = $3, mastery_tenths = $4, mastery = $4 / 10, progress_minutes = $5,
           hike_hours = $6, hike_health_gain = $7, hike_ends_at = $8, rating = $9, fights_cooldown_until = $10,
           paid_sends = $11, prev_month_key = $12, prev_rating = $13, flame_level = $14, updated_at = NOW()
       WHERE player_id = $1
       RETURNING ${COLUMNS}`,
      [playerId, row.month_key, row.health, row.mastery_tenths, row.progress_minutes, row.hike_hours, row.hike_health_gain, row.hike_ends_at,
        row.rating, row.fights_cooldown_until, row.paid_sends, row.prev_month_key, row.prev_rating, row.flame_level],
    );
    return result.rows[0]!;
  }

  private async transaction<T>(work: (client: PoolClient, now: Date) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client, this.now());
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof GuardianDragonLockedError || error instanceof GuardianDragonStateError || error instanceof GuardianDragonPersistenceError) throw error;
      throw new GuardianDragonPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}

function displayName(row: { nickname: string | null; username: string | null; first_name: string }) {
  return row.nickname?.trim() || row.username?.trim() || row.first_name;
}

/**
 * Place in a month's rating. Dragons already reborn into the next month keep that month's rating in
 * \`prev_rating\`, so the old ranking still counts them.
 */
async function placeIn(database: Pick<PoolClient, "query">, monthKey: string, rating: number, playerId: string) {
  const result = await database.query<{ ahead: string }>(
    `SELECT COUNT(*) AS ahead FROM guardian_dragons
     WHERE player_id <> $3 AND (
       (month_key = $1 AND (rating > $2 OR (rating = $2 AND player_id < $3)))
       OR (prev_month_key = $1 AND (prev_rating > $2 OR (prev_rating = $2 AND player_id < $3)))
     )`,
    [monthKey, rating, playerId],
  );
  return Number(result.rows[0]?.ahead ?? 0) + 1;
}

/** The same weak cards as the «Слабкі карти» screen: outside the battle deck and not protected. */
async function loadFeedableCards(client: PoolClient, playerId: string, instanceIds?: readonly string[], element?: CardElement) {
  const parameters: unknown[] = [playerId, BASE_POWER_BY_LEVEL, Object.values(MAGIC_SOURCE_CARD_CODES)];
  let filter = "";
  if (instanceIds) {
    parameters.push([...new Set(instanceIds)]);
    filter += ` AND player_card_instances.id = ANY($${parameters.length}::uuid[])`;
  }
  if (element) {
    parameters.push(element);
    filter += ` AND cards.element = $${parameters.length}`;
  }
  const result = await client.query<{ id: string; power: number }>(
    `SELECT player_card_instances.id,
            (CASE WHEN cards.code = ANY($3::text[]) THEN ${MAGIC_SOURCE_POWER}
              ELSE ($2::integer[])[player_card_instances.level] + player_card_instances.bonus_power END) AS power
     FROM player_card_instances
     INNER JOIN cards ON cards.id = player_card_instances.card_id
     LEFT JOIN player_decks ON player_decks.player_id = player_card_instances.player_id
     LEFT JOIN deck_slots ON deck_slots.deck_id = player_decks.id AND deck_slots.card_instance_id = player_card_instances.id
     WHERE player_card_instances.player_id = $1
       AND deck_slots.card_instance_id IS NULL
       AND player_card_instances.protected_from_absorption = FALSE
       ${filter}
     ORDER BY player_card_instances.id
     FOR UPDATE OF player_card_instances`,
    parameters,
  );
  return result.rows.map((row) => ({ id: row.id, power: Number(row.power) }));
}
