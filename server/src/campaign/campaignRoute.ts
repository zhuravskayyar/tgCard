import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type {
  CampaignMapView,
  StoryTrialsView,
} from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  CampaignPersistenceError,
} from "./campaignService.js";

interface CampaignOperations {
  getCampaign(playerId: string): Promise<CampaignMapView>;
}

interface CampaignRouteDependencies extends RouteAuthDependencies {
  campaign: CampaignOperations;
  responseHeaders?: OutgoingHttpHeaders;
  trials?: { getTrials(playerId: string): Promise<Pick<StoryTrialsView, "campaignUnlocked">> };
}

export async function handleCampaignRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: CampaignRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/player/campaign", "http://localhost");
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    if (request.method === "GET" && url.pathname === "/api/player/campaign") {
      sendJson(response, 200, await dependencies.campaign.getCampaign(player.id), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
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
