import type { CampaignLocationView, CampaignMapView, CardRarity } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { buildStoryTrials, loadLocationProgress } from "../trials/storyTrialsService.js";
import { CAMPAIGN_LOCATIONS } from "./campaignLocations.js";

export const RARITY_RANK: Record<CardRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
export type CampaignEventType = "DECK_OPENED" | "CARD_DETAIL_OPENED" | "DUEL_FINISHED" | "DUEL_WON" | "DUEL_STRONG_HIT" | "DUEL_NEUTRAL_HIT" | "SHOP_CARD_PURCHASED" | "CARD_DISCOVERED" | "COLLECTION_OPENED" | "CARD_ABSORBED" | "CARD_LEVEL_UP" | "CARD_ACQUIRED" | "REFERRAL_ACCEPTED" | "FRIEND_CREATED" | "CAMPAIGN_CARD_DROP";
export interface CampaignEventPayload {
  absorbedCards?: number;
  collectionScope?: "detail" | "list";
  duelId?: string;
  gold?: number;
  duelRating?: number;
  location?: number;
  neutralHits?: number;
  outcome?: "win" | "loss";
  rarity?: CardRarity;
  rarityRank?: number;
  strongHits?: number;
  winStreak?: number;
}
export class CampaignPersistenceError extends Error {
  constructor(options?: ErrorOptions) { super("Campaign persistence is unavailable", options); this.name = "CampaignPersistenceError"; }
}

export async function buildCampaignMap(database: Pick<PoolClient, "query">, playerId: string, now: Date): Promise<CampaignMapView> {
  const progress = await loadLocationProgress(database, playerId);
  const trials = await buildStoryTrials(database, playerId, progress);
  const latestPassed = Math.max(0, ...progress.wins.map(row => row.location_number));
  const active = await database.query<{ campaign_id: string }>("SELECT campaign_id FROM duels WHERE challenger_id = $1 AND opponent_kind = 'campaign_boss' AND status = 'active'", [playerId]);
  return {
    activeBattleLocation: active.rows[0] ? Number(active.rows[0].campaign_id.replace("location_", "")) : null,
    totalLocations: CAMPAIGN_LOCATIONS.length,
    locations: CAMPAIGN_LOCATIONS.filter(location => location.number <= (progress.current?.number ?? CAMPAIGN_LOCATIONS.length)).map((location): CampaignLocationView => {
      const win = progress.wins.find(row => row.location_number === location.number);
      const isCurrent = progress.current?.number === location.number;
      const claimed = isCurrent ? trials.trials.filter(trial => trial.state === "claimed").length : location.trials.length;
      const readyAt = win ? new Date(win.last_win_at).getTime() + location.boss.respawnHours * 3600000 : null;
      return {
        number: location.number, name: location.name,
        state: win ? "passed" : claimed === location.trials.length ? "open" : "trials",
        trialsClaimed: claimed, trialsTotal: location.trials.length,
        claimableTrials: isCurrent ? trials.trials.filter(trial => trial.state === "completed").length : 0,
        boss: {
          name: location.boss.name, hp: location.boss.hp, drop: location.boss.drop,
          firstWinReward: location.boss.firstWin, respawnHours: location.boss.respawnHours,
          availableAt: readyAt !== null && readyAt > now.getTime() ? new Date(readyAt).toISOString() : null,
          canFight: win ? location.number > latestPassed - 3 && readyAt! <= now.getTime() : claimed === location.trials.length,
        },
      };
    }).reverse(),
  };
}

export class CampaignService {
  constructor(private readonly pool: Pool) {}
  async getCampaign(playerId: string, now = new Date()) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const view = await buildCampaignMap(client, playerId, now);
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new CampaignPersistenceError({ cause: error });
    } finally { client.release(); }
  }
  async recordEvent(database: Pick<PoolClient, "query">, playerId: string, eventType: CampaignEventType, payload: CampaignEventPayload = {}, now = new Date()) {
    await database.query("INSERT INTO player_campaign_events (player_id, event_type, payload, occurred_at) VALUES ($1, $2, $3, $4)", [playerId, eventType, JSON.stringify(payload.rarity ? { ...payload, rarityRank: RARITY_RANK[payload.rarity] } : payload), now]);
  }
  async recordExternalEvent(playerId: string, eventType: CampaignEventType, payload: CampaignEventPayload = {}, now = new Date()) {
    try { await this.recordEvent(this.pool, playerId, eventType, payload, now); }
    catch (error) { throw new CampaignPersistenceError({ cause: error }); }
  }
}
