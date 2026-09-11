import { getPlayerDisplayName, type AdminIdentity } from "@cardastika/shared";
import type { IncomingMessage } from "node:http";
import type { Pool } from "pg";
import type { PlayerAuthService } from "../auth/playerAuth.js";
import type { PlayerRepository } from "../users/playerRepository.js";

export class AdminAccessDeniedError extends Error {
  constructor() {
    super("Administrator access is required");
    this.name = "AdminAccessDeniedError";
  }
}

export class AdminAuthService {
  private readonly allowedTelegramUserIds: ReadonlySet<string>;

  constructor(
    private readonly auth: Pick<PlayerAuthService, "authenticateRequest">,
    private readonly players: PlayerRepository,
    private readonly pool: Pick<Pool, "query">,
    allowedTelegramUserIds: readonly string[],
  ) {
    this.allowedTelegramUserIds = new Set(allowedTelegramUserIds);
  }

  async requireAdmin(request: IncomingMessage): Promise<AdminIdentity> {
    const authenticated = await this.auth.authenticateRequest(request, this.players);
    if (this.allowedTelegramUserIds.size === 0) throw new AdminAccessDeniedError();

    const result = await this.pool.query<{ provider_user_id: string }>(
      `
        SELECT provider_user_id
        FROM auth_identities
        WHERE player_id = $1 AND provider = 'telegram'
        ORDER BY created_at
        LIMIT 1
      `,
      [authenticated.player.id],
    );
    const telegramUserId = result.rows[0]?.provider_user_id;
    if (!telegramUserId || !this.allowedTelegramUserIds.has(telegramUserId)) {
      throw new AdminAccessDeniedError();
    }

    return {
      displayName: getPlayerDisplayName(authenticated.player),
      playerId: authenticated.player.id,
      telegramUserId,
    };
  }
}
