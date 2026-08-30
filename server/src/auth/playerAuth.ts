import type { IncomingMessage } from "node:http";
import type { AuthIdentityView, AuthProvider, PlayerSummary } from "@cardastika/shared";
import { PlayerPersistenceError, type PlayerRepository } from "../users/playerRepository.js";
import { validateTelegramInitData } from "./telegramInitData.js";
import { SessionRepository } from "./sessionRepository.js";

export class PlayerSessionError extends Error {
  constructor(public readonly code: "missing_session" | "invalid_session") {
    super(code);
    this.name = "PlayerSessionError";
  }
}

export interface AuthenticatedPlayer {
  player: PlayerSummary;
  provider: AuthProvider;
  sessionToken?: string;
}

function readAuthorization(request: IncomingMessage) {
  return request.headers.authorization?.trim() ?? "";
}

export class PlayerAuthService {
  constructor(
    private readonly players: PlayerRepository,
    private readonly sessions: SessionRepository,
    private readonly botToken: string,
  ) {}

  async authenticateRequest(
    request: IncomingMessage,
    legacyPlayers: Pick<PlayerRepository, "findOrCreateFromTelegram"> = this.players,
  ): Promise<AuthenticatedPlayer> {
    const authorization = readAuthorization(request);
    if (authorization.startsWith("Bearer ")) {
      const token = authorization.slice(7).trim();
      const session = await this.sessions.findActive(token);
      if (!session) throw new PlayerSessionError("invalid_session");
      return {
        player: await this.players.findSummaryById(session.playerId),
        provider: session.provider,
        sessionToken: token,
      };
    }

    if (!authorization.startsWith("tma ")) throw new PlayerSessionError("missing_session");
    const initData = authorization.slice(4).trim();
    const telegramUser = validateTelegramInitData(initData, this.botToken);
    return {
      player: await legacyPlayers.findOrCreateFromTelegram(telegramUser),
      provider: "telegram",
    };
  }

  async createSession(player: PlayerSummary, provider: AuthProvider) {
    const session = await this.sessions.create(player.id, provider);
    return { player, sessionToken: session.token, identities: await this.players.listAuthIdentities(player.id) };
  }

  async revokeSession(token: string) {
    await this.sessions.revoke(token);
  }

  async identities(playerId: string): Promise<AuthIdentityView[]> {
    return this.players.listAuthIdentities(playerId);
  }
}
