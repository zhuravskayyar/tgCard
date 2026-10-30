import type { StoryTrialClaimResponse, StoryTrialState, StoryTrialsView } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import {
  SAVE_PROFILE_GOLD_REWARD,
  SAVE_PROFILE_TRIAL_ID,
  STORY_TRIALS,
  STORY_TRIALS_INTRO,
} from "./storyTrialsConfig.js";

type Queryable = Pick<PoolClient, "query">;

export class StoryTrialMissingError extends Error {
  constructor() {
    super("Story trial does not exist");
    this.name = "StoryTrialMissingError";
  }
}

export class StoryTrialNotClaimableError extends Error {
  constructor() {
    super("Story trial is not completed");
    this.name = "StoryTrialNotClaimableError";
  }
}

export class StoryTrialsPersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Story trials persistence is unavailable", options);
    this.name = "StoryTrialsPersistenceError";
  }
}

async function loadSaveProfileState(database: Queryable, playerId: string) {
  const result = await database.query<{ has_identity: boolean; rewarded: boolean }>(
    `
      SELECT
        EXISTS (SELECT 1 FROM auth_identities WHERE player_id = $1) AS has_identity,
        EXISTS (
          SELECT 1
          FROM player_account_link_rewards AS rewards
          WHERE rewards.player_id = $1
            OR EXISTS (
              SELECT 1 FROM auth_identities AS identities
              WHERE identities.player_id = $1
                AND identities.provider = rewards.linked_provider
                AND identities.provider_user_id = rewards.linked_provider_user_id
            )
        ) AS rewarded
    `,
    [playerId],
  );
  return result.rows[0]!;
}

async function buildView(database: Queryable, playerId: string): Promise<StoryTrialsView> {
  const events = await database.query<{ event_type: string; value: string }>(
    `
      SELECT event_type, COUNT(*) AS value
      FROM player_campaign_events
      WHERE player_id = $1
        AND event_type IN ('DUEL_WON', 'DUEL_FINISHED', 'SHOP_CARD_PURCHASED', 'CARD_LEVEL_UP')
      GROUP BY event_type
    `,
    [playerId],
  );
  const claims = await database.query<{ trial_id: string }>("SELECT trial_id FROM player_story_trial_claims WHERE player_id = $1", [playerId]);
  const grandfathered = await database.query(
    "SELECT 1 FROM player_campaign_quest_progress WHERE player_id = $1 AND claimed_at IS NOT NULL LIMIT 1",
    [playerId],
  );
  const saveProfile = await loadSaveProfileState(database, playerId);
  const counts = new Map(events.rows.map((row) => [row.event_type, Number(row.value)]));
  const claimed = new Set(claims.rows.map((row) => row.trial_id));
  const trials = STORY_TRIALS.map((definition) => {
    const isSaveProfile = definition.id === SAVE_PROFILE_TRIAL_ID;
    const rawProgress = isSaveProfile
      ? Number(saveProfile.has_identity || saveProfile.rewarded)
      : counts.get(definition.eventType!) ?? 0;
    const progress = Math.min(definition.target, rawProgress);
    const isClaimed = isSaveProfile ? saveProfile.rewarded : claimed.has(definition.id);
    const state: StoryTrialState = isClaimed ? "claimed" : progress >= definition.target ? "completed" : "active";
    return {
      id: definition.id,
      navigation: definition.navigation,
      progress,
      reward: definition.reward,
      state,
      target: definition.target,
      title: definition.title,
    };
  });
  return {
    campaignUnlocked: (grandfathered.rowCount ?? 0) > 0 || trials.every(({ state }) => state === "claimed"),
    completedCount: trials.filter(({ state }) => state !== "active").length,
    story: STORY_TRIALS_INTRO,
    totalCount: trials.length,
    trials,
  };
}

export class StoryTrialsService {
  constructor(private readonly pool: Pool) {}

  async getTrials(playerId: string) {
    try {
      return await buildView(this.pool, playerId);
    } catch (error) {
      throw new StoryTrialsPersistenceError({ cause: error });
    }
  }

  async claim(playerId: string, trialId: string): Promise<StoryTrialClaimResponse> {
    const definition = STORY_TRIALS.find(({ id }) => id === trialId);
    if (!definition) throw new StoryTrialMissingError();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      if (locked.rowCount !== 1) throw new Error("Story trial player does not exist");
      const before = await buildView(client, playerId);
      const trial = before.trials.find(({ id }) => id === trialId)!;
      if (trial.state === "active") throw new StoryTrialNotClaimableError();
      const alreadyClaimed = trial.state === "claimed";
      if (!alreadyClaimed) {
        if (trialId === SAVE_PROFILE_TRIAL_ID) {
          await client.query(
            `
              INSERT INTO player_account_link_rewards (
                player_id, diamonds_awarded, gold_awarded, linked_provider, linked_provider_user_id
              )
              SELECT $1, 0, $2, provider, provider_user_id
              FROM auth_identities
              WHERE player_id = $1
              ORDER BY created_at, id
              LIMIT 1
            `,
            [playerId, SAVE_PROFILE_GOLD_REWARD],
          );
        } else {
          await client.query(
            "INSERT INTO player_story_trial_claims (player_id, trial_id) VALUES ($1, $2)",
            [playerId, trialId],
          );
        }
        await client.query(
          "UPDATE players SET gold = gold + $2, silver = silver + $3, updated_at = NOW() WHERE id = $1",
          [playerId, definition.reward.gold, definition.reward.silver],
        );
      }
      const balance = await client.query<{ gold: string | number; silver: string | number }>(
        "SELECT gold, silver FROM players WHERE id = $1",
        [playerId],
      );
      const trials = await buildView(client, playerId);
      await client.query("COMMIT");
      return {
        alreadyClaimed,
        player: { gold: Number(balance.rows[0]!.gold), silver: Number(balance.rows[0]!.silver) },
        trials,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof StoryTrialNotClaimableError) throw error;
      throw new StoryTrialsPersistenceError({ cause: error });
    } finally {
      client.release();
    }
  }
}
