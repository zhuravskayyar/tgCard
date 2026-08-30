import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { LeaderboardKind, LeaderboardResponse } from "@cardastika/shared";
import { LEADERBOARD_REQUIRED_DUEL_WINS } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import { LeaderboardPersistenceError, type LeaderboardPage } from "./leaderboardRepository.js";

interface LeaderboardLookup {
  find(kind: LeaderboardKind, page: number): Promise<LeaderboardPage>;
}

interface LeaderboardRouteDependencies extends RouteAuthDependencies {
  leaderboards: LeaderboardLookup;
  responseHeaders?: OutgoingHttpHeaders;
}

function readKind(value: string | null): LeaderboardKind {
  if (value === "duels" || value === "deck") return value;
  throw new Error("invalid_leaderboard_kind");
}

function readPage(value: string | null) {
  const page = Number(value ?? "1");
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function sendLeaderboardError(response: ServerResponse, error: unknown, headers: OutgoingHttpHeaders) {
  if (isAuthFailure(error)) {
    sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
    return true;
  }
  if (error instanceof PlayerPersistenceError || error instanceof LeaderboardPersistenceError) {
    sendJson(response, 503, { error: { code: "database_unavailable", message: "Leaderboard service is unavailable" } }, headers);
    return true;
  }
  if (error instanceof Error && error.message === "invalid_leaderboard_kind") {
    sendJson(response, 400, { error: { code: "invalid_leaderboard_kind", message: "kind must be duels or deck" } }, headers);
    return true;
  }
  return false;
}

export async function handleLeaderboardRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: LeaderboardRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }

  try {
    const url = new URL(request.url ?? "/api/player/leaderboards", "http://localhost");
    const kind = readKind(url.searchParams.get("kind"));
    const { player } = await authenticateRoutePlayer(request, dependencies);
    const duelWins = player.duelWins ?? 0;
    const eligible = duelWins >= LEADERBOARD_REQUIRED_DUEL_WINS;
    const page = eligible
      ? await dependencies.leaderboards.find(kind, readPage(url.searchParams.get("page")))
      : { entries: [], page: 1, pageSize: 10, totalEntries: 0 };
    const body: LeaderboardResponse = {
      ...page,
      kind,
      totalPages: Math.max(1, Math.ceil(page.totalEntries / page.pageSize)),
      duelWins,
      requiredDuelWins: LEADERBOARD_REQUIRED_DUEL_WINS,
      eligible,
    };
    sendJson(response, 200, body, headers);
  } catch (error) {
    if (sendLeaderboardError(response, error, headers)) return;
    console.error("Unexpected leaderboard request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}
