import type { CurrencyBoostStatus } from "@cardastika/shared";
import type { PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

export const CURRENCY_BOOST_DURATION_MS = 24 * 60 * 60 * 1_000;

export async function getCurrencyBoostStatus(
  database: Queryable,
  playerId: string,
  now: Date = new Date(),
): Promise<CurrencyBoostStatus> {
  const result = await database.query<{ expires_at: Date | string }>(
    `
      SELECT expires_at
      FROM player_boosts
      WHERE player_id = $1
        AND boost_type = 'currency_x2'
        AND starts_at <= $2
        AND expires_at > $2
      ORDER BY expires_at DESC
      LIMIT 1
    `,
    [playerId, now],
  );
  const expiresAt = result.rows[0]?.expires_at;
  if (!expiresAt) {
    return { active: false, expiresAt: null, multiplier: 1, type: "currency_x2" };
  }
  return {
    active: true,
    expiresAt: new Date(expiresAt).toISOString(),
    multiplier: 2,
    type: "currency_x2",
  };
}
