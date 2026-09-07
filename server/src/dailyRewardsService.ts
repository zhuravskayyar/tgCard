import type {
  LariskaDailyRewardGrant,
  LariskaDailyRewardPlayerState,
  LariskaDailyRewardView,
} from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";
import { getSeasonWindow } from "./battlePassConfig.js";
import { getLariskaDailyReward } from "./dailyRewardsConfig.js";

type Database = Pick<Pool | PoolClient, "query">;
interface DailyStateRow {
  current_streak: number;
  last_claim_date: string | null;
  total_claims: number;
}
interface PlayerRewardRow {
  account_xp: number | string;
  arena_tokens: number | string;
  gold: number | string;
  level: number;
  silver: number | string;
}
interface DailyRewardClaimResult {
  claimedCycle: number;
  claimedDay: number;
  grant: LariskaDailyRewardGrant;
  rewardPlayer: LariskaDailyRewardPlayerState;
  streakBonus?: LariskaDailyRewardGrant;
}
export class DailyRewardNotClaimableError extends Error {
  constructor() { super("Lariska daily reward is not claimable"); this.name = "DailyRewardNotClaimableError"; }
}
// Retained for older clients that still send a reward choice.
export class DailyRewardChoiceRequiredError extends Error {
  constructor() { super("A daily reward choice is required"); this.name = "DailyRewardChoiceRequiredError"; }
}
function toInteger(value: number | string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid daily reward state");
  return parsed;
}
function utcDate(now: Date) { return now.toISOString().slice(0, 10); }
function position(dayNumber: number) {
  return { cycle: Math.floor((dayNumber - 1) / 7) + 1, day: (dayNumber - 1) % 7 + 1 };
}
function rewardStreak(state: DailyStateRow, now: Date) {
  const today = utcDate(now);
  const yesterday = utcDate(new Date(now.getTime() - 86_400_000));
  if (state.last_claim_date === today) return Math.max(1, toInteger(state.current_streak));
  return state.last_claim_date === yesterday ? toInteger(state.current_streak) + 1 : 1;
}
async function ensureState(database: Database, playerId: string) {
  await database.query("INSERT INTO player_lariska_daily_state (player_id) VALUES ($1) ON CONFLICT (player_id) DO NOTHING", [playerId]);
}
async function loadState(database: Database, playerId: string, lock = false) {
  const result = await database.query<DailyStateRow>(
    `SELECT total_claims, current_streak, last_claim_date::text AS last_claim_date
     FROM player_lariska_daily_state WHERE player_id = $1${lock ? " FOR UPDATE" : ""}`, [playerId],
  );
  if (!result.rows[0]) throw new Error("Lariska daily reward state is missing");
  return result.rows[0];
}
export class LariskaDailyRewardService {
  constructor(private readonly pool: Pool) {}

  async getView(database: Database, playerId: string, now: Date): Promise<LariskaDailyRewardView> {
    await ensureState(database, playerId);
    const state = await loadState(database, playerId);
    const claimDate = utcDate(now);
    const claimable = state.last_claim_date !== claimDate;
    const streak = rewardStreak(state, now);
    const { cycle, day } = position(streak);
    return {
      claimDate, claimable, cycle, day, streak,
      totalClaims: toInteger(state.total_claims),
      reward: getLariskaDailyReward(cycle, day),
      streakRewards: [],
      calendar: Array.from({ length: 7 }, (_, index) => ({
        day: index + 1,
        claimed: index + 1 < day || (index + 1 === day && !claimable),
        isCurrent: index + 1 === day,
        reward: getLariskaDailyReward(cycle, index + 1),
      })),
      dialogue: !claimable
        ? { emotion: "happy", text: "Усе твоє! Приходь завтра — я підготую ще." }
        : streak >= 30
          ? { emotion: "happy", text: "Оце витримка! Найбільша нагорода тепер твоя — тільки не зникай." }
          : streak > 1
            ? { emotion: "sly", text: "Знову тут? Люблю постійних гостей. Сьогодні твоя частка більша!" }
            : { emotion: "neutral", text: "Срібло, золото й трохи блиску. Заходь щодня — принесу більше!" },
    };
  }

  async claim(playerId: string, _choiceIndex: number | undefined, now: Date = new Date()): Promise<DailyRewardClaimResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureState(client, playerId);
      const state = await loadState(client, playerId, true);
      const claimDate = utcDate(now);
      if (state.last_claim_date === claimDate) throw new DailyRewardNotClaimableError();
      const streak = rewardStreak(state, now);
      const { cycle, day } = position(streak);
      const reward = getLariskaDailyReward(cycle, day);
      const season = getSeasonWindow(now);
      // Lock season balance before player balance, matching milestone claims.
      await client.query(
        `INSERT INTO player_battle_pass_state (player_id, season_id, diamonds)
         VALUES ($1, $2, $3)
         ON CONFLICT (player_id, season_id) DO UPDATE
         SET diamonds = player_battle_pass_state.diamonds + EXCLUDED.diamonds, updated_at = $4`,
        [playerId, season.seasonId, reward.diamonds, now],
      );
      const updatedResult = await client.query<PlayerRewardRow>(
        `UPDATE players SET silver = silver + $2, gold = gold + $3, updated_at = $4
         WHERE id = $1 RETURNING level, account_xp, silver, gold, arena_tokens`,
        [playerId, reward.silver, reward.gold, now],
      );
      const updated = updatedResult.rows[0];
      if (!updated) throw new Error("Lariska reward player update failed");
      const grant = { kind: "currencies" as const, label: reward.label, silver: reward.silver, gold: reward.gold, diamonds: reward.diamonds };
      // Ledger positions remain lifetime-based to preserve the existing unique key
      // and old claim history when a streak resets; reward tiers use the streak.
      const ledger = position(toInteger(state.total_claims) + 1);
      await client.query(
        `INSERT INTO player_lariska_daily_claims (player_id, claim_date, cycle_number, day, reward)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [playerId, claimDate, ledger.cycle, ledger.day, JSON.stringify({ definition: reward, grant, streak })],
      );
      await client.query(
        `UPDATE player_lariska_daily_state SET total_claims = total_claims + 1,
         current_streak = $2, last_claim_date = $3, updated_at = $4 WHERE player_id = $1`,
        [playerId, streak, claimDate, now],
      );
      await client.query("COMMIT");
      return {
        claimedCycle: cycle, claimedDay: day, grant,
        rewardPlayer: {
          accountXp: toInteger(updated.account_xp), arenaTokens: toInteger(updated.arena_tokens),
          gold: toInteger(updated.gold), level: updated.level, silver: toInteger(updated.silver),
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}
