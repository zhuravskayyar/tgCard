import { randomUUID } from "node:crypto";
import { createStandardCardInstance, CryptoCardRandomSource } from "./cards/cardInstanceCreator.js";
import { recordCardDiscovery } from "./collections/discoveryService.js";
import {
  getNextBattlePassThreshold,
  isBattlePassCircleComplete,
} from "@cardastika/game-core";
import type {
  BattlePassClaimResponse,
  DailyLoginClaimResponse,
  BattlePassPageResponse,
  BattlePassReward,
  BattlePassView,
  DailyTaskClaimResponse,
  PlayerBalance,
  PlayerCardInstance,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { CURRENCY_BOOST_DURATION_MS, getCurrencyBoostStatus } from "./boosts/currencyBoost.js";
import {
  BATTLE_PASS_CIRCLES,
  BATTLE_PASS_MILESTONES,
  DAILY_TASKS,
  getBattlePassMilestone,
  getDailyTask,
  getDayWindow,
  getSeasonWindow,
  type BattlePassMilestoneConfig,
} from "./battlePassConfig.js";
import { LariskaDailyRewardService } from "./dailyRewardsService.js";

type Database = Pick<Pool | PoolClient, "query">;

interface BattlePassStateRow {
  diamonds: number | string;
}

interface EventProgressRow {
  amount: number | string;
  event_type: string;
  event_count: number | string;
}

interface CardDefinitionRow {
  art_key: string | null;
  code: string;
  collection_id: string | null;
  description: string;
  display_name: string | null;
  element: "air" | "earth" | "fire" | "water";
  id: string;
  limited: boolean;
  min_rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
}

interface BalanceRow {
  gold: number | string;
  silver: number | string;
}

interface LowestDeckCardLevelRow {
  level: number | string | null;
}

export class BattlePassMilestoneNotClaimableError extends Error {
  constructor() {
    super("Battle pass milestone is not claimable");
    this.name = "BattlePassMilestoneNotClaimableError";
  }
}

export class DailyTaskNotClaimableError extends Error {
  constructor() {
    super("Daily task is not claimable");
    this.name = "DailyTaskNotClaimableError";
  }
}

function toInteger(value: number | string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Battle pass stored integer is invalid");
  return parsed;
}

function multiplierForCompletedTasks(completedCount: number): 1 | 2 | 3 {
  if (completedCount >= 7) return 3;
  if (completedCount >= 6) return 2;
  return 1;
}

function milestoneNeedsPreviousClaims(milestone: BattlePassMilestoneConfig) {
  const circle = BATTLE_PASS_CIRCLES.find(({ circle }) => circle === milestone.circle);
  return circle?.thresholds.at(-1) === milestone.threshold;
}

function isCircleComplete(circle: number, claimedIds: Set<string>) {
  return BATTLE_PASS_MILESTONES
    .filter((milestone) => milestone.circle === circle)
    .every((milestone) => milestone.reward === null || claimedIds.has(milestone.id));
}

function getActiveCircle(claimedIds: Set<string>) {
  return BATTLE_PASS_CIRCLES.find(({ circle }) => !isCircleComplete(circle, claimedIds))?.circle ?? null;
}

async function ensureState(database: Database, playerId: string, seasonId: string) {
  await database.query(
    `
      INSERT INTO player_battle_pass_state (player_id, season_id)
      VALUES ($1, $2)
      ON CONFLICT (player_id, season_id) DO NOTHING
    `,
    [playerId, seasonId],
  );
}

async function loadState(database: Database, playerId: string, seasonId: string) {
  const result = await database.query<BattlePassStateRow>(
    "SELECT diamonds FROM player_battle_pass_state WHERE player_id = $1 AND season_id = $2",
    [playerId, seasonId],
  );
  const state = result.rows[0];
  if (!state) throw new Error("Battle pass state is missing");
  return { diamonds: toInteger(state.diamonds) };
}

async function loadEventProgress(database: Database, playerId: string, startsAt: Date, endsAt: Date) {
  const eventTypes = DAILY_TASKS.map((task) => task.eventType);
  const result = await database.query<EventProgressRow>(
    `
      SELECT
        event_type,
        COUNT(*)::integer AS event_count,
        COALESCE(SUM(
          CASE WHEN event_type = 'CARD_ABSORBED'
            THEN COALESCE((payload->>'absorbedCards')::integer, 0)
            ELSE 0
          END
        ), 0)::integer AS amount
      FROM player_campaign_events
      WHERE player_id = $1
        AND occurred_at >= $2
        AND occurred_at < $3
        AND event_type = ANY($4::text[])
      GROUP BY event_type
    `,
    [playerId, startsAt, endsAt, eventTypes],
  );
  const byType = new Map(result.rows.map((row) => [row.event_type, row]));
  return new Map(DAILY_TASKS.map((task) => {
    const row = byType.get(task.eventType);
    return [task.id, row
      ? task.eventType === "CARD_ABSORBED" ? toInteger(row.amount) : toInteger(row.event_count)
      : 0];
  }));
}

async function loadDailyClaims(database: Database, playerId: string, taskDate: string) {
  const result = await database.query<{ task_id: string }>(
    "SELECT task_id FROM player_daily_task_claims WHERE player_id = $1 AND task_date = $2",
    [playerId, taskDate],
  );
  return new Set(result.rows.map(({ task_id }) => task_id));
}

async function loadMilestoneClaims(database: Database, playerId: string, seasonId: string) {
  const result = await database.query<{ milestone_id: string }>(
    "SELECT milestone_id FROM player_battle_pass_claims WHERE player_id = $1 AND season_id = $2",
    [playerId, seasonId],
  );
  return new Set(result.rows.map(({ milestone_id }) => milestone_id));
}

async function loadCompletedTaskCount(database: Database, playerId: string, now: Date) {
  const day = getDayWindow(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
  const progress = await loadEventProgress(database, playerId, day.startsAt, day.endsAt);
  return DAILY_TASKS.filter((task) => (progress.get(task.id) ?? 0) >= task.target).length;
}

function toBalance(row: BalanceRow): PlayerBalance {
  return { gold: toInteger(row.gold), silver: toInteger(row.silver) };
}

async function loadBalance(database: Database, playerId: string) {
  const result = await database.query<BalanceRow>("SELECT gold, silver FROM players WHERE id = $1", [playerId]);
  const row = result.rows[0];
  if (!row) throw new Error("Battle pass player is missing");
  return toBalance(row);
}

async function loadLowestDeckCardLevel(database: Database, playerId: string) {
  const result = await database.query<LowestDeckCardLevelRow>(
    `
      SELECT MIN(player_card_instances.level)::integer AS level
      FROM player_decks
      INNER JOIN deck_slots ON deck_slots.deck_id = player_decks.id
      INNER JOIN player_card_instances ON player_card_instances.id = deck_slots.card_instance_id
      WHERE player_decks.player_id = $1
    `,
    [playerId],
  );
  const level = result.rows[0]?.level;
  if (level === null || level === undefined) throw new Error("Player deck has no cards for the battle pass reward");
  return toInteger(level);
}

async function loadRewardCardDefinition(database: Database) {
  const result = await database.query<CardDefinitionRow>(
    `
      SELECT id, code, display_name, art_key, element, collection_id, description, limited, min_rarity
      FROM cards
      WHERE shop_eligible = TRUE AND limited = FALSE
      ORDER BY random()
      LIMIT 1
    `,
  );
  const row = result.rows[0];
  if (!row) throw new Error("No free battle pass card reward is configured");
  return {
    artKey: row.art_key,
    code: row.code,
    collectionId: row.collection_id,
    description: row.description,
    displayName: row.display_name,
    element: row.element,
    id: row.id,
    limited: row.limited,
    minRarity: row.min_rarity,
    shopEligible: true,
  } as const;
}

async function grantReward(
  database: PoolClient,
  playerId: string,
  reward: BattlePassReward,
  seasonId: string,
  now: Date,
): Promise<{ balance: PlayerBalance; card?: PlayerCardInstance }> {
  let card: PlayerCardInstance | undefined;
  if (reward.kind === "boost") {
    const startsAt = now;
    const expiresAt = new Date(startsAt.getTime() + CURRENCY_BOOST_DURATION_MS);
    await database.query(
      `
        INSERT INTO player_boosts (id, player_id, boost_type, starts_at, expires_at, source)
        VALUES ($1, $2, 'currency_x2', $3, $4, $5)
      `,
      [randomUUID(), playerId, startsAt, expiresAt, `battle_pass:${seasonId}`],
    );
    return { balance: await loadBalance(database, playerId) };
  }
  if (reward.kind === "silver" || reward.kind === "gold") {
    const result = await database.query<BalanceRow>(
      `UPDATE players SET ${reward.kind} = ${reward.kind} + $2, updated_at = NOW() WHERE id = $1 RETURNING gold, silver`,
      [playerId, reward.amount],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Battle pass player is missing");
    return { balance: toBalance(row) };
  }

  const level = await loadLowestDeckCardLevel(database, playerId);
  const definition = await loadRewardCardDefinition(database);
  card = await createStandardCardInstance(database, playerId, definition, level, new CryptoCardRandomSource());
  await recordCardDiscovery(database, playerId, definition.id);
  return { balance: await loadBalance(database, playerId), card };
}

export class BattlePassService {
  private readonly dailyRewards: LariskaDailyRewardService;

  constructor(private readonly pool: Pool) {
    this.dailyRewards = new LariskaDailyRewardService(pool);
  }

  private async buildPage(database: Database, playerId: string, now: Date): Promise<BattlePassPageResponse> {
    const season = getSeasonWindow(now);
    await ensureState(database, playerId, season.seasonId);
    const state = await loadState(database, playerId, season.seasonId);
    const currencyBoost = await getCurrencyBoostStatus(database, playerId, now);
    const milestoneClaims = await loadMilestoneClaims(database, playerId, season.seasonId);
    const day = getDayWindow(now);
    const dailyLogin = await this.dailyRewards.getView(database, playerId, now);
    const dailyClaims = await loadDailyClaims(database, playerId, day.taskDate);
    const progress = await loadEventProgress(database, playerId, day.startsAt, day.endsAt);
    const completedCount = DAILY_TASKS.filter((task) => (progress.get(task.id) ?? 0) >= task.target).length;
    const currentRewardMultiplier = multiplierForCompletedTasks(await loadCompletedTaskCount(database, playerId, now));
    const allThresholds = BATTLE_PASS_CIRCLES.flatMap(({ thresholds }) => thresholds);
    const allCircleViews = BATTLE_PASS_CIRCLES.map(({ circle, thresholds }) => {
      const milestones = thresholds.map((threshold) => {
        const config = BATTLE_PASS_MILESTONES.find((milestone) => milestone.circle === circle && milestone.threshold === threshold);
        if (!config) throw new Error("Battle pass milestone configuration is incomplete");
        const claimed = milestoneClaims.has(config.id);
        const previousRewardsPending = milestoneNeedsPreviousClaims(config)
          && BATTLE_PASS_MILESTONES.some((candidate) => candidate.circle === circle && candidate.reward !== null && candidate.id !== config.id && !milestoneClaims.has(candidate.id));
        return {
          claimable: config.reward !== null && !claimed && state.diamonds >= threshold && !previousRewardsPending,
          claimed,
          circle,
          id: config.id,
          reward: config.reward,
          threshold,
        };
      });
      return {
        completed: isBattlePassCircleComplete(milestones),
        circle,
        milestones,
        threshold: thresholds.at(-1)!,
      };
    });
    const activeCircleIndex = allCircleViews.findIndex(({ completed }) => !completed);
    const visibleCircles = activeCircleIndex >= 0
      ? [allCircleViews[activeCircleIndex]!]
      : allCircleViews.length ? [allCircleViews[allCircleViews.length - 1]!] : [];
    const battlePass: BattlePassView = {
      circles: visibleCircles,
      currencyBoost,
      currentCircle: visibleCircles.find(({ completed }) => !completed)?.circle ?? null,
      diamonds: state.diamonds,
      endsAt: season.endsAt.toISOString(),
      nextThreshold: getNextBattlePassThreshold(state.diamonds, allThresholds.map((threshold, index) => ({
        circle: index,
        threshold,
      }))),
      seasonId: season.seasonId,
      startsAt: season.startsAt.toISOString(),
    };
    return {
      battlePass,
      daily: {
        completedCount,
        currentRewardMultiplier,
        multiplierForTomorrow: multiplierForCompletedTasks(completedCount),
        taskDate: day.taskDate,
        tasks: DAILY_TASKS.map((task) => {
          const taskProgress = Math.min(task.target, progress.get(task.id) ?? 0);
          return {
            claimed: dailyClaims.has(task.id),
            completed: taskProgress >= task.target,
            id: task.id,
            progress: taskProgress,
            rewardDiamonds: task.rewardDiamonds * currentRewardMultiplier,
            target: task.target,
            title: task.title,
          };
        }),
      },
      dailyLogin,
    };
  }

  async getPage(playerId: string, now: Date = new Date()) {
    return this.buildPage(this.pool, playerId, now);
  }

  async claimMilestone(playerId: string, milestoneId: string, now: Date = new Date()): Promise<BattlePassClaimResponse> {
    const milestone = getBattlePassMilestone(milestoneId);
    if (!milestone?.reward) throw new BattlePassMilestoneNotClaimableError();
    const season = getSeasonWindow(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureState(client, playerId, season.seasonId);
      const stateResult = await client.query<BattlePassStateRow>(
        "SELECT diamonds FROM player_battle_pass_state WHERE player_id = $1 AND season_id = $2 FOR UPDATE",
        [playerId, season.seasonId],
      );
      const state = stateResult.rows[0];
      if (!state || toInteger(state.diamonds) < milestone.threshold) throw new BattlePassMilestoneNotClaimableError();
      const claimsResult = await client.query<{ milestone_id: string }>(
        "SELECT milestone_id FROM player_battle_pass_claims WHERE player_id = $1 AND season_id = $2",
        [playerId, season.seasonId],
      );
      const claimedIds = new Set(claimsResult.rows.map(({ milestone_id }) => milestone_id));
      if (getActiveCircle(claimedIds) !== milestone.circle) throw new BattlePassMilestoneNotClaimableError();
      if (milestoneNeedsPreviousClaims(milestone)) {
        const requiredIds = BATTLE_PASS_MILESTONES
          .filter((candidate) => candidate.circle === milestone.circle && candidate.reward !== null && candidate.id !== milestone.id)
          .map((candidate) => candidate.id);
        if (requiredIds.some((id) => !claimedIds.has(id))) throw new BattlePassMilestoneNotClaimableError();
      }
      const claim = await client.query(
        `
          INSERT INTO player_battle_pass_claims (player_id, season_id, milestone_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (player_id, season_id, milestone_id) DO NOTHING
        `,
        [playerId, season.seasonId, milestone.id],
      );
      if (claim.rowCount !== 1) throw new BattlePassMilestoneNotClaimableError();
      const granted = await grantReward(client, playerId, milestone.reward, season.seasonId, now);
      await client.query("COMMIT");
      return {
        ...(await this.getPage(playerId, now)),
        ...(granted.card ? { card: granted.card } : {}),
        reward: milestone.reward,
        updatedBalance: granted.balance,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDailyTask(playerId: string, taskId: string, now: Date = new Date()): Promise<DailyTaskClaimResponse> {
    const task = getDailyTask(taskId);
    if (!task) throw new DailyTaskNotClaimableError();
    const season = getSeasonWindow(now);
    const day = getDayWindow(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const progress = await loadEventProgress(client, playerId, day.startsAt, day.endsAt);
      if ((progress.get(task.id) ?? 0) < task.target) throw new DailyTaskNotClaimableError();
      const previousCompletedCount = await loadCompletedTaskCount(client, playerId, now);
      const rewardDiamonds = task.rewardDiamonds * multiplierForCompletedTasks(previousCompletedCount);
      const claim = await client.query(
        `
          INSERT INTO player_daily_task_claims (player_id, task_date, task_id, reward_diamonds)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (player_id, task_date, task_id) DO NOTHING
        `,
        [playerId, day.taskDate, task.id, rewardDiamonds],
      );
      if (claim.rowCount !== 1) throw new DailyTaskNotClaimableError();
      await ensureState(client, playerId, season.seasonId);
      await client.query(
        `
          UPDATE player_battle_pass_state
          SET diamonds = diamonds + $3, updated_at = NOW()
          WHERE player_id = $1 AND season_id = $2
        `,
        [playerId, season.seasonId, rewardDiamonds],
      );
      await client.query("COMMIT");
      return {
        ...(await this.getPage(playerId, now)),
        claimedTaskId: task.id,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDailyLogin(playerId: string, choiceIndex?: number, now: Date = new Date()): Promise<DailyLoginClaimResponse> {
    const claimed = await this.dailyRewards.claim(playerId, choiceIndex, now);
    return {
      ...(await this.getPage(playerId, now)),
      claimedCycle: claimed.claimedCycle,
      claimedDay: claimed.claimedDay,
      grant: claimed.grant,
      rewardPlayer: claimed.rewardPlayer,
      ...(claimed.streakBonus ? { streakBonus: claimed.streakBonus } : {}),
    };
  }
}
