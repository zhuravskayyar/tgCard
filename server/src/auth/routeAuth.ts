import type { IncomingMessage } from "node:http";
import type { PlayerRepository } from "../users/playerRepository.js";
import { PlayerSessionError, type AuthenticatedPlayer, type PlayerAuthService } from "./playerAuth.js";
import { TelegramInitDataError, validateTelegramInitData } from "./telegramInitData.js";

export interface RouteAuthDependencies {
  auth?: Pick<PlayerAuthService, "authenticateRequest">;
  botToken: string;
  players: Pick<PlayerRepository, "findOrCreateFromTelegram">;
}

export async function authenticateRoutePlayer(
  request: IncomingMessage,
  dependencies: RouteAuthDependencies,
): Promise<AuthenticatedPlayer> {
  if (dependencies.auth) return dependencies.auth.authenticateRequest(request, dependencies.players);
  const authorization = request.headers.authorization?.trim() ?? "";
  if (!authorization.startsWith("tma ")) throw new TelegramInitDataError("missing_init_data");
  const user = validateTelegramInitData(authorization.slice(4).trim(), dependencies.botToken);
  return { player: await dependencies.players.findOrCreateFromTelegram(user), provider: "telegram" };
}

export function isAuthFailure(error: unknown) {
  return error instanceof TelegramInitDataError || error instanceof PlayerSessionError;
}
