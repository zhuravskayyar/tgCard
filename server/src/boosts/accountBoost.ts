import type { AccountBoostStatus } from "@cardastika/shared";
import type { PoolClient } from "pg";

type Queryable = Pick<PoolClient, "query">;

interface BoostRow {
  expires_at: Date | string;
}

export async function getAccountBoostStatus(
  database: Queryable,
  playerId: string,
  now: Date = new Date(),
): Promise<AccountBoostStatus> {
  const result = await database.query<BoostRow>(
    `
      SELECT expires_at
      FROM player_boosts
      WHERE player_id = $1
        AND boost_type = 'account_x2'
        AND starts_at <= $2
        AND expires_at > $2
      ORDER BY expires_at DESC
      LIMIT 1
    `,
    [playerId, now],
  );
  const expiresAt = result.rows[0]?.expires_at;
  if (!expiresAt) {
    return { active: false, expiresAt: null, multiplier: 1, type: "account_x2" };
  }
  return {
    active: true,
    expiresAt: new Date(expiresAt).toISOString(),
    multiplier: 2,
    type: "account_x2",
  };
}
