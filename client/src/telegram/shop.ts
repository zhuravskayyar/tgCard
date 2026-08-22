import {
  CARD_ELEMENTS,
  CARD_RARITIES,
  SHOP_CURRENCIES,
  type PlayerCard,
  type ShopCatalogResponse,
  type ShopOffer,
  type ShopPurchaseResponse,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";

export class ShopApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Shop request failed");
    this.name = "ShopApiError";
  }
}

function isNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isPlayerCard(value: unknown): value is PlayerCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.cardId === "string" &&
    typeof card.code === "string" &&
    (card.displayName === null || typeof card.displayName === "string") &&
    (card.artKey === null || typeof card.artKey === "string") &&
    (card.collectionId === null || typeof card.collectionId === "string") &&
    typeof card.element === "string" && CARD_ELEMENTS.some((element) => element === card.element) &&
    typeof card.rarity === "string" && CARD_RARITIES.some((rarity) => rarity === card.rarity) &&
    isPositiveInteger(card.power) &&
    isPositiveInteger(card.quantity)
  );
}

function isShopOffer(value: unknown): value is ShopOffer {
  if (!value || typeof value !== "object") return false;
  const offer = value as Record<string, unknown>;
  return (
    typeof offer.id === "string" &&
    typeof offer.currency === "string" && SHOP_CURRENCIES.some((currency) => currency === offer.currency) &&
    isPositiveInteger(offer.price) &&
    typeof offer.minimumRarity === "string" &&
    CARD_RARITIES.some((rarity) => rarity === offer.minimumRarity) &&
    Array.isArray(offer.allowedRarities) &&
    offer.allowedRarities.length > 0 &&
    offer.allowedRarities.every(
      (value) => typeof value === "string" && CARD_RARITIES.some((rarity) => rarity === value),
    ) &&
    offer.allowedRarities.includes(offer.minimumRarity)
  );
}

function parseCatalog(value: unknown): ShopCatalogResponse {
  if (!value || typeof value !== "object") throw new ShopApiError(502, "invalid_response");
  const catalog = value as Partial<ShopCatalogResponse>;
  if (!Array.isArray(catalog.offers) || !catalog.offers.every(isShopOffer)) {
    throw new ShopApiError(502, "invalid_response");
  }
  return { offers: catalog.offers };
}

function parsePurchase(value: unknown): ShopPurchaseResponse {
  if (!value || typeof value !== "object") throw new ShopApiError(502, "invalid_response");
  const purchase = value as Partial<ShopPurchaseResponse>;
  if (
    !isPlayerCard(purchase.reward) ||
    !purchase.balance ||
    !isNonNegativeInteger(purchase.balance.silver) ||
    !isNonNegativeInteger(purchase.balance.gold) ||
    typeof purchase.deckChanged !== "boolean" ||
    (purchase.deckPower !== undefined && !isNonNegativeInteger(purchase.deckPower))
  ) {
    throw new ShopApiError(502, "invalid_response");
  }
  return purchase as ShopPurchaseResponse;
}

async function parseError(response: Response): Promise<never> {
  let code = "shop_request_failed";
  try {
    const body = await response.json() as { error?: { code?: unknown } };
    if (typeof body.error?.code === "string") code = body.error.code;
  } catch {
    // Status still carries the authoritative failure when the body is malformed.
  }
  throw new ShopApiError(response.status, code);
}

export async function loadShopCatalog(initData: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/shop"), {
    headers: { Authorization: `tma ${initData}` },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseCatalog(await response.json());
}

export async function purchaseShopOffer(initData: string, offerId: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/shop/purchase"), {
    method: "POST",
    headers: {
      Authorization: `tma ${initData}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ offerId }),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parsePurchase(await response.json());
}
