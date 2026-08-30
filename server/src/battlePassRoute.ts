import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { BattlePassClaimResponse, BattlePassPageResponse, DailyLoginClaimResponse, DailyTaskClaimResponse } from "@cardastika/shared";
import { authenticateRoutePlayer, isAuthFailure, type RouteAuthDependencies } from "./auth/routeAuth.js";
import { HttpRequestError, readJsonBody, sendJson } from "./http/json.js";
import {
  BattlePassMilestoneNotClaimableError,
  BattlePassService,
  DailyTaskNotClaimableError,
} from "./battlePassService.js";
import { DailyRewardChoiceRequiredError, DailyRewardNotClaimableError } from "./dailyRewardsService.js";

interface BattlePassOperations {
  claimDailyTask(playerId: string, taskId: string): Promise<DailyTaskClaimResponse>;
  claimDailyLogin(playerId: string, choiceIndex?: number): Promise<DailyLoginClaimResponse>;
  claimMilestone(playerId: string, milestoneId: string): Promise<BattlePassClaimResponse>;
  getPage(playerId: string): Promise<BattlePassPageResponse>;
}

interface BattlePassRouteDependencies extends RouteAuthDependencies {
  battlePass: Pick<BattlePassService, "claimDailyTask" | "claimMilestone" | "getPage"> & BattlePassOperations;
  responseHeaders?: OutgoingHttpHeaders;
}

export async function handleBattlePassRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: BattlePassRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  const url = new URL(request.url ?? "/api/player/battle-pass", "http://localhost");
  const milestoneMatch = url.pathname.match(/^\/api\/player\/battle-pass\/milestones\/([^/]+)\/claim$/);
  const dailyMatch = url.pathname.match(/^\/api\/player\/battle-pass\/daily\/([^/]+)\/claim$/);
  const dailyLoginMatch = url.pathname === "/api/player/battle-pass/daily-login/claim";
  try {
    const { player } = await authenticateRoutePlayer(request, dependencies);
    if (request.method === "GET" && url.pathname === "/api/player/battle-pass") {
      sendJson(response, 200, await dependencies.battlePass.getPage(player.id), headers);
      return;
    }
    if (request.method === "POST" && milestoneMatch) {
      sendJson(response, 200, await dependencies.battlePass.claimMilestone(player.id, decodeURIComponent(milestoneMatch[1]!)), headers);
      return;
    }
    if (request.method === "POST" && dailyMatch) {
      sendJson(response, 200, await dependencies.battlePass.claimDailyTask(player.id, decodeURIComponent(dailyMatch[1]!)), headers);
      return;
    }
    if (request.method === "POST" && dailyLoginMatch) {
      const body = await readJsonBody(request);
      if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
        throw new HttpRequestError(400, "invalid_daily_reward_choice", "Daily reward choice must be an object");
      }
      const rawChoiceIndex = (body as { choiceIndex?: unknown } | null)?.choiceIndex;
      if (rawChoiceIndex !== undefined && rawChoiceIndex !== null && (typeof rawChoiceIndex !== "number" || !Number.isSafeInteger(rawChoiceIndex) || rawChoiceIndex < 0 || rawChoiceIndex > 2)) {
        throw new HttpRequestError(400, "invalid_daily_reward_choice", "choiceIndex must be between 0 and 2");
      }
      sendJson(response, 200, await dependencies.battlePass.claimDailyLogin(player.id, rawChoiceIndex as number | undefined), headers);
      return;
    }
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
  } catch (error) {
    if (isAuthFailure(error)) {
      sendJson(response, 401, { error: { code: error.code, message: "Telegram authentication failed" } }, headers);
      return;
    }
    if (error instanceof BattlePassMilestoneNotClaimableError || error instanceof DailyTaskNotClaimableError) {
      sendJson(response, 409, { error: { code: "battle_pass_not_claimable", message: error.message } }, headers);
      return;
    }
    if (error instanceof DailyRewardChoiceRequiredError) {
      sendJson(response, 409, { error: { code: "daily_reward_choice_required", message: "Choose one reward before claiming" } }, headers);
      return;
    }
    if (error instanceof DailyRewardNotClaimableError) {
      sendJson(response, 409, { error: { code: "daily_reward_not_claimable", message: "Daily reward is already claimed or unavailable" } }, headers);
      return;
    }
    if (error instanceof HttpRequestError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } }, headers);
      return;
    }
    console.error("Unexpected Battle pass request failure", error);
    sendJson(response, 503, { error: { code: "battle_pass_unavailable", message: "Battle pass is unavailable" } }, headers);
  }
}
