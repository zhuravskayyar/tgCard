import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PlayerAuthService } from "../auth/playerAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import type { PlayerRepository } from "../users/playerRepository.js";

export const DEV_ACCOUNT_IDS = Object.freeze({
  player_regular: "00000000-0000-4000-8000-000000000001",
  guild_leader: "00000000-0000-4000-8000-000000000002",
  guild_officer: "00000000-0000-4000-8000-000000000003",
  guild_veteran: "00000000-0000-4000-8000-000000000004",
  guild_member: "00000000-0000-4000-8000-000000000005",
  guild_newbie: "00000000-0000-4000-8000-000000000006",
  player_locked: "00000000-0000-4000-8000-000000000007",
} as const);

export type DevAccountKey = keyof typeof DEV_ACCOUNT_IDS;

const DEV_ACCOUNT_LABELS: Record<DevAccountKey, string> = {
  player_regular: "Вільний гравець",
  guild_leader: "Лідер гільдії",
  guild_officer: "Офіцер гільдії",
  guild_veteran: "Ветеран гільдії",
  guild_member: "Учасник гільдії",
  guild_newbie: "Новачок гільдії",
  player_locked: "Гравець до 10 рівня",
};

interface DevAuthDependencies {
  auth: Pick<PlayerAuthService, "createSession">;
  enabled: boolean;
  players: Pick<PlayerRepository, "findSummaryById">;
  responseHeaders?: OutgoingHttpHeaders;
}

function isAccountKey(value: unknown): value is DevAccountKey {
  return typeof value === "string" && Object.hasOwn(DEV_ACCOUNT_IDS, value);
}

export async function handleDevAuthRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: DevAuthDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (!dependencies.enabled) {
    sendJson(response, 404, { error: { code: "not_found", message: "Route not found" } }, headers);
    return;
  }
  try {
    if (request.method === "GET" && request.url?.split("?", 1)[0] === "/api/dev/accounts") {
      const accounts = await Promise.all(Object.entries(DEV_ACCOUNT_IDS).map(async ([key, id]) => ({
        id,
        key,
        label: DEV_ACCOUNT_LABELS[key as DevAccountKey],
        player: await dependencies.players.findSummaryById(id),
      })));
      sendJson(response, 200, { accounts }, headers);
      return;
    }
    if (request.method === "POST" && request.url?.split("?", 1)[0] === "/api/dev/login") {
      const body = await readJsonBody(request);
      if (!body || typeof body !== "object" || Array.isArray(body) || !isAccountKey((body as Record<string, unknown>).accountKey)) {
        throw new HttpRequestError(400, "invalid_dev_account", "accountKey is invalid");
      }
      const player = await dependencies.players.findSummaryById(DEV_ACCOUNT_IDS[(body as { accountKey: DevAccountKey }).accountKey]);
      sendJson(response, 200, await dependencies.auth.createSession(player, "google"), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
      return;
    }
    console.error("Dev auth request failed", error);
    sendJson(response, 503, { error: { code: "dev_account_unavailable", message: "Dev account is unavailable" } }, headers);
  }
}
