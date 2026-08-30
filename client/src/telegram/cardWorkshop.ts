import { CARD_ELEMENTS, CARD_RARITIES, type CardWorkshopCard, type CardWorkshopCraftResponse, type CardWorkshopResponse } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

export class CardWorkshopApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super("Card workshop request failed");
    this.name = "CardWorkshopApiError";
  }
}

function isNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseErrorBody(body: unknown) {
  const error = body && typeof body === "object" && "error" in body ? body.error : null;
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "workshop_request_failed";
}

async function parseError(response: Response): Promise<never> {
  let body: unknown;
  try { body = await response.json(); } catch { /* status remains authoritative */ }
  throw new CardWorkshopApiError(response.status, parseErrorBody(body));
}

function isWorkshopCard(value: unknown): value is CardWorkshopCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return typeof card.cardId === "string"
    && (card.displayName === null || typeof card.displayName === "string")
    && (card.artKey === null || typeof card.artKey === "string")
    && typeof card.element === "string" && CARD_ELEMENTS.includes(card.element as typeof CARD_ELEMENTS[number])
    && typeof card.rarity === "string" && CARD_RARITIES.includes(card.rarity as typeof CARD_RARITIES[number])
    && isNonNegativeInteger(card.cost)
    && isNonNegativeInteger(card.ownedQuantity);
}

function parseCatalog(value: unknown): CardWorkshopResponse {
  if (!value || typeof value !== "object") throw new CardWorkshopApiError(502, "invalid_response");
  const catalog = value as Partial<CardWorkshopResponse>;
  if (
    !isNonNegativeInteger(catalog.cardShards) ||
    typeof catalog.rotationEndsAt !== "string" ||
    !Array.isArray(catalog.cards) ||
    catalog.cards.length !== 6 ||
    !catalog.cards.every(isWorkshopCard)
  ) throw new CardWorkshopApiError(502, "invalid_response");
  return catalog as CardWorkshopResponse;
}

function parseCraft(value: unknown): CardWorkshopCraftResponse {
  if (!value || typeof value !== "object") throw new CardWorkshopApiError(502, "invalid_response");
  const result = value as Partial<CardWorkshopCraftResponse>;
  if (
    result.success !== true ||
    typeof result.cardId !== "string" ||
    !isNonNegativeInteger(result.cardShards) ||
    !isNonNegativeInteger(result.quantity) ||
    !isNonNegativeInteger(result.shardsSpent)
  ) throw new CardWorkshopApiError(502, "invalid_response");
  return result as CardWorkshopCraftResponse;
}

export async function loadCardWorkshop(initData: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/shop/card-workshop"), {
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseCatalog(await response.json());
}

export async function craftCardWorkshopCard(initData: string, cardId: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/shop/card-workshop/craft"), {
    method: "POST",
    headers: { Authorization: getPlayerAuthHeader(initData), "Content-Type": "application/json" },
    body: JSON.stringify({ cardId }),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseCraft(await response.json());
}
