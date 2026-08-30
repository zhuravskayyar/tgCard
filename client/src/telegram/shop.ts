import {
  CARD_ELEMENTS,
  CARD_RARITIES,
  type LimitedCardRedeemResponse,
  type LimitedShopEvent,
  SHOP_CURRENCIES,
  type PlayerCard,
  type ShopCatalogResponse,
  type ShopOffer,
  type ShopPurchaseResponse,
} from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";
import { getPlayerAuthHeader } from "./index";

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

function isPercentage(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isPlayerCard(value: unknown): value is PlayerCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.cardId === "string" &&
    typeof card.instanceId === "string" &&
    typeof card.code === "string" &&
    (card.displayName === null || typeof card.displayName === "string") &&
    (card.artKey === null || typeof card.artKey === "string") &&
    (card.collectionId === null || typeof card.collectionId === "string") &&
    typeof card.element === "string" && CARD_ELEMENTS.some((element) => element === card.element) &&
    typeof card.rarity === "string" && CARD_RARITIES.some((rarity) => rarity === card.rarity) &&
    isPositiveInteger(card.level) && Number(card.level) <= 180 &&
    isPositiveInteger(card.basePower) &&
    isNonNegativeInteger(card.bonusPower) &&
    isPositiveInteger(card.finalPower) &&
    Number(card.finalPower) === Number(card.basePower) + Number(card.bonusPower) &&
    (card.limited === undefined || typeof card.limited === "boolean")
  );
}

function isLimitedShopEvent(value: unknown): value is LimitedShopEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<LimitedShopEvent>;
  return typeof event.id === "string"
    && typeof event.displayName === "string"
    && typeof event.description === "string"
    && (event.artKey === null || typeof event.artKey === "string")
    && typeof event.element === "string" && CARD_ELEMENTS.some((element) => element === event.element)
    && typeof event.rarity === "string" && CARD_RARITIES.some((rarity) => rarity === event.rarity)
    && typeof event.endsAt === "string"
    && event.limited === true
    && typeof event.redeemed === "boolean";
}

function isShopOffer(value: unknown): value is ShopOffer {
  if (!value || typeof value !== "object") return false;
  const offer = value as Record<string, unknown>;
  return (
    typeof offer.id === "string" &&
    typeof offer.currency === "string" && SHOP_CURRENCIES.some((currency) => currency === offer.currency) &&
    isPositiveInteger(offer.price) &&
    typeof offer.guaranteedRarity === "string" &&
    CARD_RARITIES.some((rarity) => rarity === offer.guaranteedRarity) &&
    typeof offer.canAfford === "boolean" &&
    Array.isArray(offer.upgrades) &&
    offer.upgrades.length > 0 &&
    offer.upgrades.every((value) => {
      if (!value || typeof value !== "object") return false;
      const upgrade = value as Record<string, unknown>;
      return (
        typeof upgrade.rarity === "string" &&
        CARD_RARITIES.some((rarity) => rarity === upgrade.rarity) &&
        isPercentage(upgrade.chance) &&
        isPercentage(upgrade.increment) &&
        Number(upgrade.increment) > 0
      );
    })
  );
}

function parseCatalog(value: unknown): ShopCatalogResponse {
  if (!value || typeof value !== "object") throw new ShopApiError(502, "invalid_response");
  const catalog = value as Partial<ShopCatalogResponse>;
  if (!Array.isArray(catalog.offers) || !catalog.offers.every(isShopOffer)) {
    throw new ShopApiError(502, "invalid_response");
  }
  if (catalog.limitedEvent !== undefined && !isLimitedShopEvent(catalog.limitedEvent)) {
    throw new ShopApiError(502, "invalid_response");
  }
  return {
    offers: catalog.offers,
    ...(catalog.limitedEvent ? { limitedEvent: catalog.limitedEvent } : {}),
  };
}

function parsePurchase(value: unknown): ShopPurchaseResponse {
  if (!value || typeof value !== "object") throw new ShopApiError(502, "invalid_response");
  const purchase = value as Partial<ShopPurchaseResponse>;
  if (
    !isPlayerCard(purchase.reward) ||
    !purchase.updatedBalance ||
    !isNonNegativeInteger(purchase.updatedBalance.silver) ||
    !isNonNegativeInteger(purchase.updatedBalance.gold) ||
    !Array.isArray(purchase.updatedChances) ||
    !purchase.updatedChances.every((state) => (
      state &&
      typeof state.rarity === "string" &&
      CARD_RARITIES.some((rarity) => rarity === state.rarity) &&
      isPercentage(state.chance)
    )) ||
    typeof purchase.deckChanged !== "boolean" ||
    typeof purchase.newDiscovery !== "boolean" ||
    (purchase.deckPower !== undefined && !isNonNegativeInteger(purchase.deckPower)) ||
    (purchase.previousDeckPower !== undefined && !isNonNegativeInteger(purchase.previousDeckPower))
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
  const response = await fetch(getApiEndpoint("/api/shop/cards"), {
    headers: { Authorization: getPlayerAuthHeader(initData) },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  return parseCatalog(await response.json());
}

export async function purchaseShopOffer(initData: string, offerId: string, signal: AbortSignal) {
  const response = await fetch(getApiEndpoint("/api/shop/cards/purchase"), {
    method: "POST",
    headers: {
      Authorization: getPlayerAuthHeader(initData),
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

export async function redeemLimitedCard(
  initData: string,
  eventId: string,
  promoCode: string,
  signal: AbortSignal,
): Promise<LimitedCardRedeemResponse> {
  const response = await fetch(getApiEndpoint("/api/shop/limited/redeem"), {
    method: "POST",
    headers: {
      Authorization: getPlayerAuthHeader(initData),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ eventId, promoCode }),
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return parseError(response);
  const value = await response.json() as Partial<LimitedCardRedeemResponse>;
  if (
    !isPlayerCard(value.reward) ||
    value.message !== "Лімітовану карту отримано" ||
    typeof value.deckChanged !== "boolean" ||
    (value.deckPower !== undefined && !isNonNegativeInteger(value.deckPower)) ||
    (value.previousDeckPower !== undefined && !isNonNegativeInteger(value.previousDeckPower))
  ) {
    throw new ShopApiError(502, "invalid_response");
  }
  return value as LimitedCardRedeemResponse;
}
