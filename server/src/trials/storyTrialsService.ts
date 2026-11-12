import { getCardPower, getRarityForLevel, isMagicSourceCode } from "@cardastika/game-core";
import type { CardRarity, StoryTrialClaimResponse, StoryTrialState, StoryTrialsView } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { CAMPAIGN_LOCATIONS, type LocationTrial } from "../campaign/campaignLocations.js";
import { SAVE_PROFILE_GOLD_REWARD, SAVE_PROFILE_TRIAL_ID } from "./storyTrialsConfig.js";

type Queryable = Pick<PoolClient, "query">;
const rarityRank: Record<CardRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
export class StoryTrialMissingError extends Error { constructor() { super("Story trial does not exist in the current location"); this.name = "StoryTrialMissingError"; } }
export class StoryTrialNotClaimableError extends Error { constructor() { super("Story trial is not completed"); this.name = "StoryTrialNotClaimableError"; } }
export class StoryTrialsPersistenceError extends Error { constructor(options?: ErrorOptions) { super("Story trials persistence is unavailable", options); this.name = "StoryTrialsPersistenceError"; } }

async function loadSaveProfileState(database: Queryable, playerId: string) {
  const result = await database.query<{ has_identity: boolean; rewarded: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM auth_identities WHERE player_id = $1) AS has_identity,
      EXISTS (SELECT 1 FROM player_account_link_rewards AS rewards WHERE rewards.player_id = $1
        OR EXISTS (SELECT 1 FROM auth_identities AS identities WHERE identities.player_id = $1
          AND identities.provider = rewards.linked_provider AND identities.provider_user_id = rewards.linked_provider_user_id)) AS rewarded
  `, [playerId]);
  return result.rows[0]!;
}

export async function loadLocationProgress(database: Queryable, playerId: string) {
  const result = await database.query<{ location_number: number; first_win_at: Date | string; last_win_at: Date | string }>("SELECT location_number, first_win_at, last_win_at FROM player_campaign_locations WHERE player_id = $1 ORDER BY location_number", [playerId]);
  const current = CAMPAIGN_LOCATIONS.find(location => !result.rows.some(row => row.location_number === location.number)) ?? null;
  return { current, wins: result.rows };
}

async function scalar(database: Queryable, sql: string, values: unknown[]) {
  return Number((await database.query<{ value: string | number }>(sql, values)).rows[0]?.value ?? 0);
}

async function measure(database: Queryable, playerId: string, trial: LocationTrial, since: Date | string | null) {
  if (!trial.available || trial.metric === "pending" || (trial.sincePrevious && !since)) return 0;
  const from = trial.sincePrevious ? since : null;
  switch (trial.metric) {
    case "event": return scalar(database, `SELECT COALESCE(SUM(CASE WHEN event_type = 'CARD_ABSORBED' THEN COALESCE((payload->>'absorbedCards')::integer, 0) ELSE 1 END), 0) AS value FROM player_campaign_events WHERE player_id = $1 AND ($2::timestamptz IS NULL OR occurred_at > $2) AND event_type = $3`, [playerId, from, trial.param]);
    case "duel_gold": return scalar(database, `SELECT COALESCE(SUM((payload->>'gold')::integer), 0) AS value FROM player_campaign_events WHERE player_id = $1 AND event_type = 'DUEL_FINISHED'`, [playerId]);
    case "collection": return scalar(database, `SELECT COUNT(*) AS value FROM player_collection_completions p JOIN collections c ON c.id = p.collection_id WHERE p.player_id = $1 AND c.code = $2`, [playerId, trial.param]);
    case "collection_cards": return scalar(database, `SELECT COUNT(*) AS value FROM player_card_instances p JOIN cards c ON c.id = p.card_id JOIN collections col ON col.id = c.collection_id WHERE p.player_id = $1 AND col.code = $2`, [playerId, trial.param]);
    case "deck_power":
    case "deck_rarity": {
      const deck = await database.query<{ level: number; bonus_power: number; card_id: string }>(`SELECT p.level, p.bonus_power, p.card_id FROM player_card_instances p JOIN deck_slots s ON s.card_instance_id = p.id JOIN player_decks d ON d.id = s.deck_id WHERE d.player_id = $1`, [playerId]);
      return trial.metric === "deck_power" ? deck.rows.reduce((sum, card) => sum + getCardPower({ level: card.level, bonusPower: card.bonus_power, magicSource: isMagicSourceCode(card.card_id) }), 0) : deck.rows.filter(card => rarityRank[getRarityForLevel(card.level)] >= rarityRank[trial.param as CardRarity]).length;
    }
    case "duel_rating": return from
      ? scalar(database, `SELECT COALESCE(MAX((payload->>'duelRating')::integer), 0) AS value FROM player_campaign_events WHERE player_id = $1 AND occurred_at > $2 AND event_type = 'DUEL_FINISHED'`, [playerId, from])
      : scalar(database, "SELECT duel_rating AS value FROM players WHERE id = $1", [playerId]);
    case "arena_rating": return scalar(database, "SELECT arena_rating AS value FROM players WHERE id = $1", [playerId]);
    case "level": return scalar(database, "SELECT level AS value FROM players WHERE id = $1", [playerId]);
    case "daily_tasks": return scalar(database, "SELECT COUNT(*) AS value FROM player_daily_task_claims WHERE player_id = $1", [playerId]);
    case "guild_xp": return scalar(database, "SELECT COALESCE(SUM(xp), 0) AS value FROM guild_xp_contributions WHERE player_id = $1", [playerId]);
    case "guild_contribution": return scalar(database, "SELECT COALESCE(SUM(amount), 0) AS value FROM guild_treasury_contributions WHERE player_id = $1 AND contribution_type = $2", [playerId, trial.param]);
    case "save_profile": { const state = await loadSaveProfileState(database, playerId); return Number(state.has_identity || state.rewarded); }
  }
}

export async function buildStoryTrials(database: Queryable, playerId: string, progress?: Awaited<ReturnType<typeof loadLocationProgress>>): Promise<StoryTrialsView> {
  const { current, wins } = progress ?? await loadLocationProgress(database, playerId);
  const location = current ?? CAMPAIGN_LOCATIONS.at(-1)!;
  const previousWin = wins.find(row => row.location_number === location.number - 1)?.first_win_at ?? null;
  const claims = await database.query<{ trial_id: string }>("SELECT trial_id FROM player_story_trial_claims WHERE player_id = $1", [playerId]);
  const claimed = new Set(claims.rows.map(row => row.trial_id));
  const save = await loadSaveProfileState(database, playerId);
  const trials = await Promise.all(location.trials.map(async definition => {
    const isClaimed = claimed.has(definition.id) || (definition.id === SAVE_PROFILE_TRIAL_ID && save.rewarded);
    const measured = isClaimed ? definition.target : await measure(database, playerId, definition, previousWin);
    const state: StoryTrialState = isClaimed ? "claimed" : definition.available && measured >= definition.target ? "completed" : "active";
    return { id: definition.id, kind: "campaign" as const, title: definition.title, navigation: definition.navigation, available: definition.available, target: definition.target, progress: Math.min(definition.target, measured), state, reward: definition.id === SAVE_PROFILE_TRIAL_ID ? { gold: SAVE_PROFILE_GOLD_REWARD, silver: 0 } : location.trialReward };
  }));
  const portrait = await database.query<{ id: string; art_key: string | null }>("SELECT id, art_key FROM cards WHERE code = $1", [location.giverCode]);
  return {
    campaignUnlocked: wins.length > 0 || trials.every(trial => trial.state === "claimed"),
    completedCount: trials.filter(trial => trial.state === "claimed").length,
    location: { number: location.number, giverName: location.giverName, giverCardId: portrait.rows[0]?.id ?? null, giverArtKey: portrait.rows[0]?.art_key ?? null },
    story: { caveName: location.name, title: location.name, text: location.plea }, totalCount: trials.length, trials,
  };
}

export class StoryTrialsService {
  constructor(private readonly pool: Pool) {}
  async getTrials(playerId: string) {
    try { return await buildStoryTrials(this.pool, playerId); }
    catch (error) { throw new StoryTrialsPersistenceError({ cause: error }); }
  }
  async claim(playerId: string, trialId: string): Promise<StoryTrialClaimResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT id FROM players WHERE id = $1 FOR UPDATE", [playerId]);
      if (locked.rowCount !== 1) throw new Error("Story trial player does not exist");
      const progress = await loadLocationProgress(client, playerId);
      if (!progress.current) throw new StoryTrialMissingError();
      const before = await buildStoryTrials(client, playerId, progress);
      const trial = before.trials.find(trial => trial.id === trialId);
      if (!trial) throw new StoryTrialMissingError();
      if (trial.state === "active" || !trial.available) throw new StoryTrialNotClaimableError();
      const alreadyClaimed = trial.state === "claimed";
      if (!alreadyClaimed) {
        if (trialId === SAVE_PROFILE_TRIAL_ID) {
          await client.query(`INSERT INTO player_account_link_rewards (player_id, diamonds_awarded, gold_awarded, linked_provider, linked_provider_user_id) SELECT $1, 0, $2, provider, provider_user_id FROM auth_identities WHERE player_id = $1 ORDER BY created_at, id LIMIT 1`, [playerId, SAVE_PROFILE_GOLD_REWARD]);
        }
        await client.query("INSERT INTO player_story_trial_claims (player_id, trial_id) VALUES ($1, $2)", [playerId, trialId]);
        await client.query("UPDATE players SET gold = gold + $2, silver = silver + $3, updated_at = NOW() WHERE id = $1", [playerId, trial.reward.gold, trial.reward.silver]);
      }
      const balance = (await client.query<{ gold: string; silver: string }>("SELECT gold, silver FROM players WHERE id = $1", [playerId])).rows[0]!;
      const trials = await buildStoryTrials(client, playerId);
      await client.query("COMMIT");
      return { alreadyClaimed, player: { gold: Number(balance.gold), silver: Number(balance.silver) }, trials };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof StoryTrialMissingError || error instanceof StoryTrialNotClaimableError) throw error;
      throw new StoryTrialsPersistenceError({ cause: error });
    } finally { client.release(); }
  }
}
