import type { StoryTrialClaimResponse, StoryTrialsView } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export const SAVE_PROFILE_TRIAL_ID = "save-profile";

async function request<T>(initData: string, path: string, method: "GET" | "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(getApiEndpoint(path), {
    method,
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("Story trials request failed");
  return response.json() as Promise<T>;
}

export function loadStoryTrials(initData: string, signal?: AbortSignal) {
  return request<StoryTrialsView>(initData, "/api/player/trials", "GET", signal);
}

export function claimStoryTrial(initData: string, trialId: string, signal?: AbortSignal) {
  return request<StoryTrialClaimResponse>(initData, `/api/player/trials/${encodeURIComponent(trialId)}/claim`, "POST", signal);
}
