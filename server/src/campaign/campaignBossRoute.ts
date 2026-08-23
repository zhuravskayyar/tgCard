import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  ActiveCampaignBossResponse,
  CampaignBossView,
  DuelActionRequest,
  PlayerSummary,
} from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  CampaignBossAlreadyCompletedError,
  CampaignBossBattleConflictError,
  CampaignBossBattleMissingError,
  CampaignBossConfigurationError,
  CampaignBossLockedError,
} from "./campaignBossService.js";

interface BossOperations {
  action(playerId: string, battleId: string, input: DuelActionRequest): Promise<CampaignBossView>;
  findActive(playerId: string): Promise<CampaignBossView | null>;
  findById(playerId: string, battleId: string): Promise<CampaignBossView>;
  start(playerId: string): Promise<CampaignBossView>;
}

interface PlayerLookup {
  findOrCreateFromTelegram(user: ReturnType<typeof validateTelegramInitData>): Promise<PlayerSummary>;
}

interface CampaignBossRouteDependencies {
  boss: BossOperations;
  botToken: string;
  players: PlayerLookup;
  responseHeaders?: OutgoingHttpHeaders;
}

function readTelegramInitData(request: IncomingMessage) {
  const authorization = request.headers.authorization?.trim();
  if (!authorization?.startsWith("tma ")) throw new TelegramInitDataError("missing_init_data");
  return authorization.slice(4).trim();
}

function isActionRequest(value: unknown): value is DuelActionRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (body.slotIndex === 0 || body.slotIndex === 1 || body.slotIndex === 2)
    && Number.isSafeInteger(body.expectedVersion)
    && Number(body.expectedVersion) >= 1;
}

export async function handleCampaignBossRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CampaignBossRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/player/campaign/boss", "http://localhost");
  const battleMatch = url.pathname.match(/^\/api\/player\/campaign\/boss\/([^/]+)$/);
  const actionMatch = url.pathname.match(/^\/api\/player\/campaign\/boss\/([^/]+)\/action$/);
  try {
    const user = validateTelegramInitData(readTelegramInitData(request), dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(user);
    if (request.method === "POST" && url.pathname === "/api/player/campaign/boss/start") {
      sendJson(response, 201, await dependencies.boss.start(player.id), headers);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/player/campaign/boss/active") {
      const body: ActiveCampaignBossResponse = { battle: await dependencies.boss.findActive(player.id) };
      sendJson(response, 200, body, headers);
      return;
    }
    if (request.method === "POST" && actionMatch) {
      const body = await readJsonBody(request);
      if (!isActionRequest(body)) {
        throw new HttpRequestError(400, "invalid_campaign_boss_action", "slotIndex and expectedVersion are required");
      }
      sendJson(
        response,
        200,
        await dependencies.boss.action(player.id, decodeURIComponent(actionMatch[1]!), body),
        headers,
      );
      return;
    }
    if (request.method === "GET" && battleMatch && battleMatch[1] !== "active") {
      sendJson(response, 200, await dependencies.boss.findById(player.id, decodeURIComponent(battleMatch[1]!)), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
      return;
    }
    if (error instanceof TelegramInitDataError) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
      return;
    }
    if (error instanceof CampaignBossLockedError) {
      sendJson(response, 409, { error: { code: "campaign_boss_locked", message: error.message } }, headers);
      return;
    }
    if (error instanceof CampaignBossAlreadyCompletedError) {
      sendJson(response, 409, { error: { code: "campaign_already_completed", message: error.message } }, headers);
      return;
    }
    if (error instanceof CampaignBossBattleConflictError) {
      sendJson(response, 409, { error: { code: "campaign_boss_state_conflict", message: error.message } }, headers);
      return;
    }
    if (error instanceof CampaignBossBattleMissingError) {
      sendJson(response, 404, { error: { code: "campaign_boss_battle_not_found", message: error.message } }, headers);
      return;
    }
    if (error instanceof CampaignBossConfigurationError) {
      sendJson(response, 503, { error: { code: "campaign_boss_unavailable", message: error.message } }, headers);
      return;
    }
    if (error instanceof PlayerPersistenceError) {
      sendJson(response, 503, { error: { code: "campaign_unavailable", message: "Campaign is unavailable" } }, headers);
      return;
    }
    console.error("Unexpected Campaign boss request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}
