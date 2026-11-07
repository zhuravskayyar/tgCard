import type { TutorialCompletionResponse } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export async function completeTutorial(initData: string, signal?: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/player/tutorial/complete"), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("Tutorial completion failed");
  const body = await response.json() as Partial<TutorialCompletionResponse>;
  if (!body.player || body.player.tutorialEligible !== false) {
    throw new Error("Tutorial completion response is invalid");
  }
  return { player: body.player, rewardCard: body.rewardCard ?? null };
}
