import type { CurrencyBoostStatus } from "@cardastika/shared";
import type { PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

export const CURRENCY_BOOST_DURATION_MS = 24 * 60 * 60 * 1_000;

export async function getCurrencyBoostStatus(
  database: Queryable,
  playerId: string,
  now: Date = new Date(),
): Promise<CurrencyBoostStatus> {
  // Battle pass circles grant ×2, ×3 or ×4; overlapping boosts do not add up, the strongest one counts.
  const result = await database.query<{ boost_type: string; expires_at: Date | string }>(
    `
      SELECT boost_type, expires_at
      FROM player_boosts
      WHERE player_id = $1
        AND boost_type IN ('currency_x2', 'currency_x3', 'currency_x4')
        AND starts_at <= $2
        AND expires_at > $2
      ORDER BY boost_type DESC, expires_at DESC
      LIMIT 1
    `,
    [playerId, now],
  );
  const row = result.rows[0];
  if (!row) {
    return { active: false, expiresAt: null, multiplier: 1, type: "currency_x2" };
  }
  return {
    active: true,
    expiresAt: new Date(row.expires_at).toISOString(),
    multiplier: Number(row.boost_type.slice("currency_x".length)) as 2 | 3 | 4,
    type: "currency_x2",
  };
}
