import { applyAccountXp } from "@cardastika/game-core";
import type {
  CampaignQuestClaimResponse,
  CampaignQuestState,
  CampaignStageState,
  CampaignStageView,
  CampaignView,
  CardRarity,
  PlayerSummary,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { getAccountBoostStatus } from "../boosts/accountBoost.js";
import {
  BOSS_UNLOCKED_DIALOGUE,
  BOSS_VICTORY_DIALOGUES,
  CAMPAIGN_ID,
  CAMPAIGN_STAGES,
  getCampaignQuest,
  getCampaignStage,
  getQuestDialogue,
  type CampaignMetric,
  type CampaignQuestDefinition,
} from "./campaignConfig.js";

export type CampaignEventType =
  | "DECK_OPENED"
  | "CARD_DETAIL_OPENED"
  | "DUEL_FINISHED"
  | "DUEL_WON"
  | "DUEL_STRONG_HIT"
  | "DUEL_NEUTRAL_HIT"
  | "SHOP_CARD_PURCHASED"
  | "CARD_DISCOVERED"
  | "COLLECTION_OPENED"
  | "CARD_ABSORBED"
  | "CARD_LEVEL_UP"
  | "CARD_ACQUIRED"
  | "REFERRAL_ACCEPTED"
  | "FRIEND_CREATED";

export interface CampaignEventPayload {
  absorbedCards?: number;
  collectionScope?: "detail" | "list";
  duelId?: string;
  neutralHits?: number;
  outcome?: "win" | "loss";
  rarity?: CardRarity;
  rarityRank?: number;
  strongHits?: number;
  winStreak?: number;
}

type Queryable = Pick<PoolClient, "query">;

interface CampaignStateRow {
  boss_reward_granted_at: Date | string | null;
  completed_at: Date | string | null;
  current_stage: number;
  current_stage_started_at: Date | string;
  player_id: string;
}

interface QuestProgressRow {
  claimed_at: Date | string | null;
  completed_at: Date | string | null;
  metadata: Record<string, unknown>;
  progress: number;
  quest_id: string;
  stage_number: number;
}

interface PlayerRewardRow {
  account_xp: number;
  first_name: string;
  gold: string | number;
  id: string;
  level: number;
  photo_url: string | null;
  referral_code: string;
  silver: string | number;
  username: string | null;
}

interface ScalarRow {
  value: string | number | null;
}

const RARITY_RANK: Readonly<Record<CardRarity, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export class CampaignQuestMissingError extends Error {
  constructor() {
    super("Campaign quest does not exist");
    this.name = "CampaignQuestMissingError";
  }
}

export class CampaignQuestNotClaimableError extends Error {
  constructor() {
    super("Campaign quest is not completed or is still locked");
    this.name = "CampaignQuestNotClaimableError";
  }
}

export class CampaignPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Campaign persistence is unavailable", options);
    this.name = "CampaignPersistenceError";
  }
}

function toSafeInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function toPlayerSummary(row: PlayerRewardRow): PlayerSummary {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    photoUrl: row.photo_url,
    level: row.level,
    silver: toSafeInteger(row.silver, "campaign silver"),
    gold: toSafeInteger(row.gold, "campaign gold"),
  };
}

async function ensureCampaignState(database: Queryable, playerId: string) {
  await database.query(
    `
      INSERT INTO player_campaign_state (player_id, campaign_id)
      VALUES ($1, $2)
      ON CONFLICT (player_id) DO NOTHING
    `,
    [playerId, CAMPAIGN_ID],
  );
  const stateResult = await database.query<CampaignStateRow>(
    `
      SELECT player_id, current_stage, current_stage_started_at,
        completed_at, boss_reward_granted_at
      FROM player_campaign_state
      WHERE player_id = $1
    `,
    [playerId],
  );
  const state = stateResult.rows[0];
  if (!state) throw new Error("Campaign state could not be initialized");
  await ensureStageProgress(database, playerId, state.current_stage);
  return state;
}

async function ensureStageProgress(database: Queryable, playerId: string, stageNumber: number) {
  const stage = getCampaignStage(stageNumber);
  if (!stage) throw new Error(`Campaign stage ${stageNumber} is not configured`);
  for (const definition of stage.quests) {
    await database.query(
      `
        INSERT INTO player_campaign_quest_progress (player_id, quest_id, stage_number)
        VALUES ($1, $2, $3)
        ON CONFLICT (player_id, quest_id) DO NOTHING
      `,
      [playerId, definition.id, stageNumber],
    );
  }
}

async function scalar(database: Queryable, sql: string, parameters: unknown[]) {
  const result = await database.query<ScalarRow>(sql, parameters);
  return Number(result.rows[0]?.value ?? 0);
}

async function getMetricProgress(
  database: Queryable,
  playerId: string,
  metric: CampaignMetric,
  stageStartedAt: Date,
  readyAt: Date | null,
) {
  const eventParameters = [playerId, stageStartedAt];
  switch (metric) {
    case "deck_and_card_opened":
      return scalar(database, `
        SELECT COUNT(DISTINCT event_type) AS value
        FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at >= $2
          AND event_type IN ('DECK_OPENED', 'CARD_DETAIL_OPENED')
      `, eventParameters);
    case "duel_finished":
      return scalar(database, `SELECT COUNT(*) AS value FROM player_campaign_events WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'DUEL_FINISHED'`, eventParameters);
    case "shop_purchase":
      return scalar(database, `SELECT COUNT(*) AS value FROM player_campaign_events WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'SHOP_CARD_PURCHASED'`, eventParameters);
    case "collections_and_detail_opened":
      return scalar(database, `
        SELECT COUNT(DISTINCT payload->>'collectionScope') AS value
        FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'COLLECTION_OPENED'
          AND payload->>'collectionScope' IN ('list', 'detail')
      `, eventParameters);
    case "cards_absorbed":
      return scalar(database, `
        SELECT COALESCE(SUM((payload->>'absorbedCards')::integer), 0) AS value
        FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'CARD_ABSORBED'
      `, eventParameters);
    case "card_level_up":
      return scalar(database, `SELECT COUNT(*) AS value FROM player_campaign_events WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'CARD_LEVEL_UP'`, eventParameters);
    case "duel_won":
      return scalar(database, `SELECT COUNT(*) AS value FROM player_campaign_events WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'DUEL_WON'`, eventParameters);
    case "card_discovered":
      return scalar(database, `SELECT COUNT(*) AS value FROM player_campaign_events WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'CARD_DISCOVERED'`, eventParameters);
    case "accepted_referral":
      return scalar(database, `SELECT COUNT(*) AS value FROM player_referrals WHERE inviter_player_id = $1`, [playerId]);
    case "win_streak":
      return scalar(database, `
        SELECT COALESCE(MAX((payload->>'winStreak')::integer), 0) AS value
        FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'DUEL_FINISHED'
      `, eventParameters);
    case "acquired_rare":
      return scalar(database, `
        SELECT COUNT(*) AS value FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'CARD_ACQUIRED'
          AND (payload->>'rarityRank')::integer >= $3
      `, [...eventParameters, RARITY_RANK.rare]);
    case "maximum_owned_card_level":
      return scalar(database, `SELECT COALESCE(MAX(level), 0) AS value FROM player_card_instances WHERE player_id = $1`, [playerId]);
    case "single_collection_discoveries":
      return scalar(database, `
        SELECT COALESCE(MAX(discovered), 0) AS value
        FROM (
          SELECT COUNT(*) AS discovered
          FROM player_card_discoveries
          INNER JOIN cards ON cards.id = player_card_discoveries.card_id
          WHERE player_card_discoveries.player_id = $1 AND cards.collection_id IS NOT NULL
          GROUP BY cards.collection_id
        ) progress
      `, [playerId]);
    case "duel_strong_hit":
      return scalar(database, `SELECT COUNT(*) AS value FROM player_campaign_events WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'DUEL_STRONG_HIT'`, eventParameters);
    case "neutral_hit_win":
      return scalar(database, `
        SELECT COUNT(*) AS value FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'DUEL_FINISHED'
          AND payload->>'outcome' = 'win' AND (payload->>'neutralHits')::integer >= 3
      `, eventParameters);
    case "owned_nonstarter_elements":
      return scalar(database, `
        SELECT COUNT(DISTINCT cards.element) AS value
        FROM player_card_instances
        INNER JOIN cards ON cards.id = player_card_instances.card_id
        WHERE player_card_instances.player_id = $1 AND cards.collection_id IS NOT NULL
      `, [playerId]);
    case "single_collection_percentage":
      return scalar(database, `
        SELECT COALESCE(MAX(FLOOR(discovered * 100.0 / total)), 0) AS value
        FROM (
          SELECT collections.id,
            COUNT(cards.id) AS total,
            COUNT(player_card_discoveries.card_id) AS discovered
          FROM collections
          INNER JOIN cards ON cards.collection_id = collections.id
          LEFT JOIN player_card_discoveries
            ON player_card_discoveries.card_id = cards.id
            AND player_card_discoveries.player_id = $1
          GROUP BY collections.id
        ) progress
      `, [playerId]);
    case "weak_card_count":
      return scalar(database, `
        SELECT COUNT(*) AS value
        FROM player_card_instances
        LEFT JOIN player_decks ON player_decks.player_id = player_card_instances.player_id
        LEFT JOIN deck_slots ON deck_slots.deck_id = player_decks.id
          AND deck_slots.card_instance_id = player_card_instances.id
        WHERE player_card_instances.player_id = $1 AND deck_slots.card_instance_id IS NULL
      `, [playerId]);
    case "acquired_epic":
      return scalar(database, `
        SELECT COUNT(*) AS value FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at >= $2 AND event_type = 'CARD_ACQUIRED'
          AND (payload->>'rarityRank')::integer >= $3
      `, [...eventParameters, RARITY_RANK.epic]);
    case "ready_additional_wins":
      if (!readyAt) return 0;
      return scalar(database, `
        SELECT COUNT(*) AS value FROM player_campaign_events
        WHERE player_id = $1 AND occurred_at > $2 AND event_type = 'DUEL_WON'
      `, [playerId, readyAt]);
  }
}

async function updateQuestProgress(
  database: Queryable,
  playerId: string,
  definition: CampaignQuestDefinition,
  progress: number,
  now: Date,
) {
  await database.query(
    `
      UPDATE player_campaign_quest_progress
      SET progress = GREATEST(progress, $3),
        completed_at = CASE
          WHEN GREATEST(progress, $3) >= $4 THEN COALESCE(completed_at, $5)
          ELSE completed_at
        END,
        updated_at = $5
      WHERE player_id = $1 AND quest_id = $2
    `,
    [playerId, definition.id, Math.max(0, Math.floor(progress)), definition.target, now],
  );
}

async function loadStageProgress(database: Queryable, playerId: string, stageNumber?: number) {
  const result = await database.query<QuestProgressRow>(
    `
      SELECT quest_id, stage_number, progress, metadata, completed_at, claimed_at
      FROM player_campaign_quest_progress
      WHERE player_id = $1 ${stageNumber ? "AND stage_number = $2" : ""}
      ORDER BY stage_number, quest_id
    `,
    stageNumber ? [playerId, stageNumber] : [playerId],
  );
  return result.rows;
}

async function refreshCurrentStage(
  database: Queryable,
  playerId: string,
  state: CampaignStateRow,
  now: Date,
) {
  if (state.completed_at) return;
  const stage = getCampaignStage(state.current_stage);
  if (!stage) throw new Error("Current Campaign stage is not configured");
  await ensureStageProgress(database, playerId, state.current_stage);
  let rows = await loadStageProgress(database, playerId, state.current_stage);
  const stageStartedAt = new Date(state.current_stage_started_at);
  const regularDefinitions = stage.number === 6 ? stage.quests.slice(0, 5) : stage.quests;

  for (const definition of regularDefinitions) {
    const row = rows.find(({ quest_id }) => quest_id === definition.id);
    if (row?.completed_at) continue;
    const progress = await getMetricProgress(database, playerId, definition.metric, stageStartedAt, null);
    await updateQuestProgress(database, playerId, definition, progress, now);
  }

  if (stage.number === 6) {
    rows = await loadStageProgress(database, playerId, 6);
    const readyDefinition = stage.quests[5]!;
    let readyRow = rows.find(({ quest_id }) => quest_id === readyDefinition.id);
    const firstFiveComplete = stage.quests.slice(0, 5).every((definition) => (
      rows.find(({ quest_id }) => quest_id === definition.id)?.completed_at
    ));
    if (firstFiveComplete && !readyRow?.metadata.readyAt) {
      const metadata = { ...readyRow?.metadata, readyAt: now.toISOString() };
      await database.query(
        `UPDATE player_campaign_quest_progress SET metadata = $3, updated_at = $4 WHERE player_id = $1 AND quest_id = $2`,
        [playerId, readyDefinition.id, JSON.stringify(metadata), now],
      );
      readyRow = { ...readyRow!, metadata };
    }
    const readyAtValue = readyRow?.metadata.readyAt;
    const readyAt = typeof readyAtValue === "string" ? new Date(readyAtValue) : null;
    if (!readyRow?.completed_at) {
      const progress = await getMetricProgress(database, playerId, readyDefinition.metric, stageStartedAt, readyAt);
      await updateQuestProgress(database, playerId, readyDefinition, progress, now);
    }
  }
}

async function loadPlayer(database: Queryable, playerId: string, lock = false) {
  const result = await database.query<PlayerRewardRow>(
    `
      SELECT id, username, first_name, photo_url, level, silver, gold,
        account_xp, referral_code
      FROM players
      WHERE id = $1
      ${lock ? "FOR UPDATE" : ""}
    `,
    [playerId],
  );
  const player = result.rows[0];
  if (!player) throw new Error("Campaign player does not exist");
  return player;
}

async function buildCampaignView(database: Queryable, playerId: string, now: Date): Promise<CampaignView> {
  const state = await ensureCampaignState(database, playerId);
  await refreshCurrentStage(database, playerId, state, now);
  const refreshedStateResult = await database.query<CampaignStateRow>(
    `SELECT player_id, current_stage, current_stage_started_at, completed_at, boss_reward_granted_at FROM player_campaign_state WHERE player_id = $1`,
    [playerId],
  );
  const refreshedState = refreshedStateResult.rows[0]!;
  const rows = await loadStageProgress(database, playerId);
  const progressByQuest = new Map(rows.map((row) => [row.quest_id, row]));
  const stages: CampaignStageView[] = CAMPAIGN_STAGES.map((stage) => {
    const questRows = stage.quests.map((definition) => progressByQuest.get(definition.id));
    const claimedCount = questRows.filter((row) => row?.claimed_at).length;
    const stageState: CampaignStageState = stage.number < refreshedState.current_stage || claimedCount === 6
      ? "completed"
      : stage.number === refreshedState.current_stage
        ? "active"
        : "locked";
    return {
      id: stage.id,
      number: stage.number,
      title: stage.title,
      state: stageState,
      claimedCount,
      dialogue: stage.dialogue,
      quests: stage.quests.map((definition) => {
        const row = progressByQuest.get(definition.id);
        const state: CampaignQuestState = stageState === "locked"
          ? "locked"
          : row?.claimed_at
            ? "claimed"
            : row?.completed_at
              ? "completed"
              : "active";
        return {
          id: definition.id,
          title: definition.title,
          description: definition.description,
          reward: definition.reward,
          target: definition.target,
          progress: Math.min(definition.target, row?.progress ?? 0),
          state,
          dialogue: getQuestDialogue(stage.id, definition),
          ...(definition.navigation ? { navigation: definition.navigation } : {}),
        };
      }),
    };
  });
  const stageSixClaimed = stages[5]?.claimedCount === 6;
  const completedAt = toIso(refreshedState.completed_at);
  const player = await loadPlayer(database, playerId);
  const friendCount = await scalar(database, `SELECT COUNT(*) AS value FROM player_referrals WHERE inviter_player_id = $1`, [playerId]);
  return {
    campaignId: CAMPAIGN_ID,
    title: "Кампанія 1",
    completedAt,
    stages,
    boost: await getAccountBoostStatus(database, playerId, now),
    referral: {
      code: player.referral_code,
      startParam: `ref_${player.referral_code}`,
      acceptedFriends: friendCount,
    },
    boss: {
      name: "Мантикора",
      state: completedAt ? "completed" : stageSixClaimed ? "unlocked" : "locked",
      warning: "Карти боса приховані до удару.",
      dialogue: completedAt ? BOSS_VICTORY_DIALOGUES[2]! : BOSS_UNLOCKED_DIALOGUE,
    },
  };
}

export class CampaignService {
  constructor(private readonly pool: Pool) {}

  async getCampaign(playerId: string, now: Date = new Date()) {
    try {
      return await buildCampaignView(this.pool, playerId, now);
    } catch (error) {
      throw new CampaignPersistenceError({ cause: error });
    }
  }

  async getStage(playerId: string, stageId: string, now: Date = new Date()) {
    const campaign = await this.getCampaign(playerId, now);
    const stage = campaign.stages.find(({ id, number }) => id === stageId || String(number) === stageId);
    if (!stage) throw new CampaignQuestMissingError();
    return stage;
  }

  async recordEvent(
    database: Queryable,
    playerId: string,
    eventType: CampaignEventType,
    payload: CampaignEventPayload = {},
    now: Date = new Date(),
  ) {
    const normalizedPayload = payload.rarity
      ? { ...payload, rarityRank: RARITY_RANK[payload.rarity] }
      : payload;
    await database.query(
      `INSERT INTO player_campaign_events (player_id, event_type, payload, occurred_at) VALUES ($1, $2, $3, $4)`,
      [playerId, eventType, JSON.stringify(normalizedPayload), now],
    );
    const state = await ensureCampaignState(database, playerId);
    await refreshCurrentStage(database, playerId, state, now);
  }

  async recordExternalEvent(
    playerId: string,
    eventType: CampaignEventType,
    payload: CampaignEventPayload = {},
    now: Date = new Date(),
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.recordEvent(client, playerId, eventType, payload, now);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new CampaignPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }

  async claim(playerId: string, questId: string, now: Date = new Date()): Promise<CampaignQuestClaimResponse> {
    const definition = getCampaignQuest(questId);
    if (!definition) throw new CampaignQuestMissingError();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const stateResult = await client.query<CampaignStateRow>(
        `SELECT player_id, current_stage, current_stage_started_at, completed_at, boss_reward_granted_at FROM player_campaign_state WHERE player_id = $1 FOR UPDATE`,
        [playerId],
      );
      const state = stateResult.rows[0] ?? await ensureCampaignState(client, playerId);
      await refreshCurrentStage(client, playerId, state, now);
      const progressResult = await client.query<QuestProgressRow>(
        `
          SELECT quest_id, stage_number, progress, metadata, completed_at, claimed_at
          FROM player_campaign_quest_progress
          WHERE player_id = $1 AND quest_id = $2
          FOR UPDATE
        `,
        [playerId, questId],
      );
      const progress = progressResult.rows[0];
      if (!progress || !progress.completed_at || (!progress.claimed_at && progress.stage_number !== state.current_stage)) {
        throw new CampaignQuestNotClaimableError();
      }

      let reachedLevels: number[] = [];
      let levelUpGold = 0;
      const alreadyClaimed = Boolean(progress.claimed_at);
      let player = await loadPlayer(client, playerId, true);
      if (!alreadyClaimed) {
        const progression = applyAccountXp({
          level: player.level,
          xp: player.account_xp,
          gainedXp: definition.reward.xp,
        });
        reachedLevels = progression.reachedLevels;
        levelUpGold = progression.goldReward;
        const nextSilver = toSafeInteger(player.silver, "campaign silver") + definition.reward.silver;
        const nextGold = toSafeInteger(player.gold, "campaign gold") + progression.goldReward;
        if (!Number.isSafeInteger(nextSilver) || !Number.isSafeInteger(nextGold)) {
          throw new Error("Campaign reward exceeds safe player balance limits");
        }
        const updatedPlayer = await client.query<PlayerRewardRow>(
          `
            UPDATE players
            SET level = $2, account_xp = $3, silver = $4, gold = $5, updated_at = $6
            WHERE id = $1
            RETURNING id, username, first_name, photo_url, level, silver, gold, account_xp, referral_code
          `,
          [playerId, progression.newLevel, progression.remainingXp, nextSilver, nextGold, now],
        );
        player = updatedPlayer.rows[0]!;
        await client.query(
          `UPDATE player_campaign_quest_progress SET claimed_at = $3, updated_at = $3 WHERE player_id = $1 AND quest_id = $2`,
          [playerId, questId, now],
        );
      }

      const claimedInStage = await scalar(client, `
        SELECT COUNT(*) AS value FROM player_campaign_quest_progress
        WHERE player_id = $1 AND stage_number = $2 AND claimed_at IS NOT NULL
      `, [playerId, state.current_stage]);
      if (claimedInStage === 6 && state.current_stage < 6) {
        const nextStage = state.current_stage + 1;
        await client.query(
          `UPDATE player_campaign_state SET current_stage = $2, current_stage_started_at = $3, updated_at = $3 WHERE player_id = $1`,
          [playerId, nextStage, now],
        );
        await ensureStageProgress(client, playerId, nextStage);
        const nextState: CampaignStateRow = { ...state, current_stage: nextStage, current_stage_started_at: now };
        await refreshCurrentStage(client, playerId, nextState, now);
      }

      const campaign = await buildCampaignView(client, playerId, now);
      await client.query("COMMIT");
      return {
        questId,
        alreadyClaimed,
        reward: definition.reward,
        reachedLevels,
        levelUpGold,
        player: toPlayerSummary(player),
        campaign,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof CampaignQuestMissingError || error instanceof CampaignQuestNotClaimableError) throw error;
      throw new CampaignPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
