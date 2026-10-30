import { createHash, randomBytes } from "node:crypto";
import type { AuthSessionProvider } from "@cardastika/shared";
import type { Pool, PoolClient } from "pg";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export interface CreatedSession {
  playerId: string;
  provider: AuthSessionProvider;
  token: string;
  expiresAt: string;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class SessionRepository {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createInTransaction(client: PoolClient, playerId: string, provider: AuthSessionProvider): Promise<CreatedSession> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await client.query(
      `
        INSERT INTO player_sessions (token_hash, player_id, provider, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [hashToken(token), playerId, provider, expiresAt],
    );
    return { playerId, provider, token, expiresAt: expiresAt.toISOString() };
  }

  async create(playerId: string, provider: AuthSessionProvider): Promise<CreatedSession> {
    return this.withTransaction((client) => this.createInTransaction(client, playerId, provider));
  }

  async findActive(token: string): Promise<{ playerId: string; provider: AuthSessionProvider } | null> {
    if (!token.trim()) return null;
    const result = await this.pool.query<{ player_id: string; provider: AuthSessionProvider }>(
      `
        SELECT player_id, provider
        FROM player_sessions
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
      `,
      [hashToken(token)],
    );
    const row = result.rows[0];
    return row ? { playerId: row.player_id, provider: row.provider } : null;
  }

  async revoke(token: string) {
    await this.pool.query(
      "UPDATE player_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
      [hashToken(token)],
    );
  }

  async extendActive(token: string) {
    const result = await this.pool.query(
      `
        UPDATE player_sessions
        SET expires_at = GREATEST(expires_at, NOW() + $2::double precision * INTERVAL '1 millisecond')
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
        RETURNING token_hash
      `,
      [hashToken(token), SESSION_LIFETIME_MS],
    );
    return result.rowCount === 1;
  }
}
