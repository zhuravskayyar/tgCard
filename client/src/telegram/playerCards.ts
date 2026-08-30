import type {
  AbsorbCardsRequest,
  AbsorptionCandidatesResponse,
  AbsorptionPreviewResponse,
  CardProgressionActionResponse,
  PlayerCardDetailResponse,
  WeakPlayerCardsResponse,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";
import { isPlayerCardInstance, PlayerDataError } from "./playerDeck";

function isPagination(value: unknown): value is WeakPlayerCardsResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<WeakPlayerCardsResponse>;
  return Array.isArray(response.cards)
    && response.cards.every(isPlayerCardInstance)
    && Number.isSafeInteger(response.page) && Number(response.page) >= 1
    && response.pageSize === 9
    && Number.isSafeInteger(response.totalCards) && Number(response.totalCards) >= 0
    && Number.isSafeInteger(response.totalPages) && Number(response.totalPages) >= 0;
}

function isDetail(value: unknown): value is PlayerCardDetailResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<PlayerCardDetailResponse>;
  const progression = response.progression as Record<string, unknown> | undefined;
  return isPlayerCardInstance(response.card)
    && typeof response.inActiveDeck === "boolean"
    && Boolean(progression)
    && Number.isFinite(progression?.percent)
    && Number(progression?.percent) >= 0
    && Number(progression?.percent) <= 100
    && typeof progression?.availability === "string";
}

async function request(
  initData: string,
  path: string,
  signal?: AbortSignal,
  body?: AbsorbCardsRequest,
  method?: "GET" | "POST",
) {
  const response = await fetch(getApiEndpoint(path), {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      Authorization: getPlayerAuthHeader(initData),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const value = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const code = (value as { error?: { code?: unknown } } | null)?.error?.code;
    throw new PlayerDataError(response.status, typeof code === "string" ? code : undefined);
  }
  return value;
}

export async function loadWeakCards(initData: string, page: number, signal?: AbortSignal) {
  const value = await request(initData, `/api/player/cards/weak?page=${page}&limit=9`, signal);
  if (!isPagination(value)) throw new PlayerDataError(502);
  return value;
}

export async function loadCardDetail(initData: string, instanceId: string, signal?: AbortSignal) {
  const value = await request(initData, `/api/player/cards/${encodeURIComponent(instanceId)}`, signal);
  if (!isDetail(value)) throw new PlayerDataError(502);
  return value;
}

export async function loadAbsorptionCandidates(
  initData: string,
  instanceId: string,
  page: number,
  signal?: AbortSignal,
) {
  const value = await request(
    initData,
    `/api/player/cards/${encodeURIComponent(instanceId)}/absorption-candidates?page=${page}&limit=9`,
    signal,
  );
  if (!isPagination(value)) throw new PlayerDataError(502);
  return value as AbsorptionCandidatesResponse;
}

export async function previewCardAbsorption(
  initData: string,
  instanceId: string,
  fodderInstanceIds: string[],
  signal?: AbortSignal,
) {
  const value = await request(
    initData,
    `/api/player/cards/${encodeURIComponent(instanceId)}/absorption-preview`,
    signal,
    { fodderInstanceIds },
  );
  const preview = value as Partial<AbsorptionPreviewResponse>;
  if (
    !value || typeof value !== "object"
    || !Number.isFinite(preview.beforePercent)
    || !Number.isFinite(preview.afterPercent)
    || !Number.isFinite(preview.beforeElements)
    || !Number.isFinite(preview.afterElements)
    || !Number.isFinite(preview.requiredElements)
    || !Number.isSafeInteger(preview.selectedCards)
    || !Number.isFinite(preview.resultingStoredElements)
  ) throw new PlayerDataError(502);
  return value as AbsorptionPreviewResponse;
}

function parseAction(value: unknown) {
  if (!isDetail(value)) throw new PlayerDataError(502);
  const action = value as Partial<CardProgressionActionResponse>;
  if (
    !Array.isArray(action.consumedInstanceIds)
    || !Number.isSafeInteger(action.playerGold)
    || (action.deckPower !== undefined && (!Number.isSafeInteger(action.deckPower) || action.deckPower < 0))
  ) {
    throw new PlayerDataError(502);
  }
  return value as CardProgressionActionResponse;
}

export async function absorbCards(initData: string, instanceId: string, fodderInstanceIds: string[]) {
  return parseAction(await request(
    initData,
    `/api/player/cards/${encodeURIComponent(instanceId)}/absorb`,
    undefined,
    { fodderInstanceIds },
  ));
}

export async function levelUpCard(initData: string, instanceId: string) {
  const response = await fetch(getApiEndpoint(`/api/player/cards/${encodeURIComponent(instanceId)}/level-up`), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
  });
  const value = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const code = (value as { error?: { code?: unknown } } | null)?.error?.code;
    throw new PlayerDataError(response.status, typeof code === "string" ? code : undefined);
  }
  return parseAction(value);
}

export async function toggleCardProtection(initData: string, instanceId: string) {
  return parseAction(await request(
    initData,
    `/api/player/cards/${encodeURIComponent(instanceId)}/protection`,
    undefined,
    undefined,
    "POST",
  ));
}
