import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { StoryTrialClaimResponse, StoryTrialsView } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "../auth/routeAuth.js";
import { sendJson } from "../http/json.js";
import { PlayerPersistenceError } from "../users/playerRepository.js";
import {
  StoryTrialMissingError,
  StoryTrialNotClaimableError,
  StoryTrialsPersistenceError,
} from "./storyTrialsService.js";

interface StoryTrialsRouteDependencies extends RouteAuthDependencies {
  responseHeaders?: OutgoingHttpHeaders;
  trials: {
    claim(playerId: string, trialId: string): Promise<StoryTrialClaimResponse>;
    getTrials(playerId: string): Promise<StoryTrialsView>;
  };
}

export async function handleStoryTrialsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: StoryTrialsRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/player/trials", "http://localhost");
  const claimMatch = url.pathname.match(/^\/api\/player\/trials\/([^/]+)\/claim$/);
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    if (request.method === "GET" && url.pathname === "/api/player/trials") {
      sendJson(response, 200, await dependencies.trials.getTrials(player.id), headers);
      return;
    }
    if (request.method === "POST" && claimMatch) {
      sendJson(response, 200, await dependencies.trials.claim(player.id, decodeURIComponent(claimMatch[1]!)), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
      return;
    }
    if (error instanceof StoryTrialMissingError) {
      sendJson(response, 404, { error: { code: "story_trial_not_found", message: error.message } }, headers);
      return;
    }
    if (error instanceof StoryTrialNotClaimableError) {
      sendJson(response, 409, { error: { code: "story_trial_not_claimable", message: error.message } }, headers);
      return;
    }
    if (error instanceof StoryTrialsPersistenceError || error instanceof PlayerPersistenceError) {
      sendJson(response, 503, { error: { code: "story_trials_unavailable", message: "Story trials are unavailable" } }, headers);
      return;
    }
    console.error("Unexpected story trials request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}
