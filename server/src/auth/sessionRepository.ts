import { createHash, randomBytes } from "node:crypto";
import type { AuthProvider } from "@cardastika/shared";
import type { Pool } from "pg";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export interface CreatedSession {
  playerId: string;
  provider: AuthProvider;
  token: string;
  expiresAt: string;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class SessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(playerId: string, provider: AuthProvider): Promise<CreatedSession> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await this.pool.query(
      `
        INSERT INTO player_sessions (token_hash, player_id, provider, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [hashToken(token), playerId, provider, expiresAt],
    );
    return { playerId, provider, token, expiresAt: expiresAt.toISOString() };
  }

  async findActive(token: string): Promise<{ playerId: string; provider: AuthProvider } | null> {
    if (!token.trim()) return null;
    const result = await this.pool.query<{ player_id: string; provider: AuthProvider }>(
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
}
