import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  CampaignQuestClaimResponse,
  CampaignStageView,
  CampaignView,
  PlayerSummary,
} from "@cardastika/shared";
import { TelegramInitDataError, validateTelegramInitData } from "../auth/telegramInitData.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  CampaignPersistenceError,
  CampaignQuestMissingError,
  CampaignQuestNotClaimableError,
} from "./campaignService.js";

interface CampaignOperations {
  claim(playerId: string, questId: string): Promise<CampaignQuestClaimResponse>;
  getCampaign(playerId: string): Promise<CampaignView>;
  getStage(playerId: string, stageId: string): Promise<CampaignStageView>;
}

interface PlayerLookup {
  findOrCreateFromTelegram(user: ReturnType<typeof validateTelegramInitData>): Promise<PlayerSummary>;
}

interface CampaignRouteDependencies {
  botToken: string;
  campaign: CampaignOperations;
  players: PlayerLookup;
  responseHeaders?: OutgoingHttpHeaders;
}

function readTelegramInitData(request: IncomingMessage) {
  const authorization = request.headers.authorization?.trim();
  if (!authorization?.startsWith("tma ")) throw new TelegramInitDataError("missing_init_data");
  return authorization.slice(4).trim();
}

export async function handleCampaignRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CampaignRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/player/campaign", "http://localhost");
  const stageMatch = url.pathname.match(/^\/api\/player\/campaign\/stages\/([^/]+)$/);
  const claimMatch = url.pathname.match(/^\/api\/player\/campaign\/quests\/([^/]+)\/claim$/);
  try {
    const user = validateTelegramInitData(readTelegramInitData(request), dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(user);
    if (request.method === "GET" && url.pathname === "/api/player/campaign") {
      sendJson(response, 200, await dependencies.campaign.getCampaign(player.id), headers);
      return;
    }
    if (request.method === "GET" && stageMatch) {
      sendJson(response, 200, await dependencies.campaign.getStage(player.id, decodeURIComponent(stageMatch[1]!)), headers);
      return;
    }
    if (request.method === "POST" && claimMatch) {
      sendJson(response, 200, await dependencies.campaign.claim(player.id, decodeURIComponent(claimMatch[1]!)), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (error instanceof TelegramInitDataError) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
      return;
    }
    if (error instanceof CampaignQuestMissingError) {
      sendJson(response, 404, { error: { code: "campaign_quest_not_found", message: error.message } }, headers);
      return;
    }
    if (error instanceof CampaignQuestNotClaimableError) {
      sendJson(response, 409, { error: { code: "campaign_quest_not_claimable", message: error.message } }, headers);
      return;
    }
    if (error instanceof CampaignPersistenceError || error instanceof PlayerPersistenceError) {
      sendJson(response, 503, { error: { code: "campaign_unavailable", message: "Campaign is unavailable" } }, headers);
      return;
    }
    console.error("Unexpected Campaign request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}
