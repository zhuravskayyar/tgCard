import type {
  DungeonCompleteResponse,
  DungeonStartResponse,
  DungeonTile,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class DungeonApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Dungeon request failed");
    this.name = "DungeonApiError";
  }
}

function isNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseErrorBody(body: unknown) {
  const code = body && typeof body === "object" && "error" in body
    && body.error && typeof body.error === "object" && "code" in body.error
    && typeof body.error.code === "string"
    ? body.error.code
    : "dungeon_request_failed";
  return code;
}

async function parseResponseError(response: Response): Promise<never> {
  let body: unknown;
  try { body = await response.json(); } catch { /* status remains authoritative */ }
  throw new DungeonApiError(response.status, parseErrorBody(body));
}

function isDungeonTile(value: unknown): value is DungeonTile {
  if (!value || typeof value !== "object") return false;
  const tile = value as Record<string, unknown>;
  return typeof tile.id === "string" && typeof tile.pairId === "string" && typeof tile.assetKey === "string";
}

function parseStart(value: unknown): DungeonStartResponse {
  if (!value || typeof value !== "object") throw new DungeonApiError(502, "invalid_response");
  const result = value as Partial<DungeonStartResponse>;
  if (
    typeof result.runId !== "string" ||
    !Array.isArray(result.board) ||
    result.board.length !== 16 ||
    !result.board.every(isDungeonTile) ||
    !isNonNegativeInteger(result.cardShards) ||
    !isNonNegativeInteger(result.maxMoves) ||
    !isNonNegativeInteger(result.matchedPairs) ||
    !isNonNegativeInteger(result.movesUsed)
  ) throw new DungeonApiError(502, "invalid_response");
  return result as DungeonStartResponse;
}

function parseComplete(value: unknown): DungeonCompleteResponse {
  if (!value || typeof value !== "object") throw new DungeonApiError(502, "invalid_response");
  const result = value as Partial<DungeonCompleteResponse>;
  if (
    typeof result.runId !== "string" ||
    typeof result.success !== "boolean" ||
    (result.status !== "completed" && result.status !== "failed") ||
    !isNonNegativeInteger(result.cardShards) ||
    !isNonNegativeInteger(result.matchedPairs) ||
    !isNonNegativeInteger(result.maxMoves) ||
    !isNonNegativeInteger(result.movesUsed) ||
    !isNonNegativeInteger(result.shardsEarned) ||
    !isNonNegativeInteger(result.stars)
  ) throw new DungeonApiError(502, "invalid_response");
  return result as DungeonCompleteResponse;
}

export async function startDungeon(initData: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/dungeon/start"), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseResponseError(response);
  return parseStart(await response.json());
}

export async function completeDungeon(initData: string, runId: string, moves: string[], signal: AbortSignal) {
  const response = await fetch(getApiEndpoint(`/api/dungeon/${encodeURIComponent(runId)}/complete`), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(initData), "Content-Type": "application/json" },
    body: JSON.stringify({ moves }),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseResponseError(response);
  return parseComplete(await response.json());
}
