import type { TournamentAwardsView, TournamentChatMessage, TournamentChatView, TournamentLobbyView, TournamentRunAction, TournamentRunView } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class TournamentRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TournamentRequestError";
  }
}

export async function loadTournament(initData: string, signal?: AbortSignal): Promise<TournamentLobbyView> {
  const response = await fetch(getApiEndpoint("/api/tournament"), {
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error("Tournament is unavailable");
  return response.json() as Promise<TournamentLobbyView>;
}

async function tournamentRequest<T>(initData: string, path: string, options: { body?: unknown; method?: "GET" | "POST"; signal?: AbortSignal } = {}) {
  const response = await fetch(getApiEndpoint(path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: getPlayerAuthHeader(initData),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
    const code = payload?.error && "code" in payload.error && typeof payload.error.code === "string" ? payload.error.code : "request_failed";
    const message = payload?.error?.message;
    throw new TournamentRequestError(code, typeof message === "string" ? message : "Tournament request failed");
  }
  return response.json() as Promise<T>;
}

export function loadTournamentRun(initData: string, signal?: AbortSignal) {
  return tournamentRequest<TournamentRunView | null>(initData, "/api/tournament/run", { signal });
}

export function loadTournamentAwards(initData: string, signal?: AbortSignal) {
  return tournamentRequest<TournamentAwardsView>(initData, "/api/tournament/awards", { signal });
}

export function loadTournamentChat(initData: string, signal?: AbortSignal) {
  return tournamentRequest<TournamentChatView>(initData, "/api/tournament/chat", { signal });
}

export function sendTournamentChatMessage(initData: string, body: string) {
  return tournamentRequest<TournamentChatMessage>(initData, "/api/tournament/chat", { method: "POST", body: { body } });
}

export function registerTournament(initData: string) {
  return tournamentRequest<TournamentLobbyView>(initData, "/api/tournament/register", { method: "POST", body: {} });
}

export function unregisterTournament(initData: string) {
  return tournamentRequest<TournamentLobbyView>(initData, "/api/tournament/unregister", { method: "POST", body: {} });
}

/** Local development only. */
export function scheduleTournamentTest(initData: string) {
  return tournamentRequest<TournamentLobbyView>(initData, "/api/tournament/dev/schedule", { method: "POST", body: {} });
}

export function submitTournamentAction(initData: string, input: TournamentRunAction, signal?: AbortSignal) {
  return tournamentRequest<TournamentRunView>(initData, "/api/tournament/run/action", { method: "POST", body: input, signal });
}
