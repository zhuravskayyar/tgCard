import { Pool } from "pg";
import { PlayerRepository } from "../users/playerRepository.js";
import { CAMPAIGN_LOCATIONS } from "./campaignLocations.js";

let sequence = 0n;
export const databaseUrl = process.env.DATABASE_URL?.trim();
export async function withCampaignPlayer(run: (pool: Pool, playerId: string) => Promise<void>) {
  if (!databaseUrl) return;
  if (!["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) throw new Error("Campaign tests require a local database");
  const pool = new Pool({ connectionString: databaseUrl });
  const player = await new PlayerRepository(pool).findOrCreateFromTelegram({
    id: String(BigInt(Date.now()) * 1000000n + BigInt(process.pid) * 100n + ++sequence),
    username: null, firstName: "Campaign test", lastName: null, photoUrl: null,
  });
  try { await run(pool, player.id); }
  finally { await pool.query("DELETE FROM players WHERE id = $1", [player.id]); await pool.end(); }
}
export async function unlockTrials(pool: Pool, playerId: string, number = 1) {
  for (const trial of CAMPAIGN_LOCATIONS[number - 1]!.trials) {
    await pool.query("INSERT INTO player_story_trial_claims (player_id, trial_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [playerId, trial.id]);
  }
}
export async function passLocations(pool: Pool, playerId: string, count: number, when = new Date("2026-11-01T10:00:00Z")) {
  for (let n = 1; n <= count; n++) {
    await unlockTrials(pool, playerId, n);
    await pool.query("INSERT INTO player_campaign_locations (player_id, location_number, first_win_at, last_win_at) VALUES ($1, $2, $3, $3)", [playerId, n, when]);
  }
}
