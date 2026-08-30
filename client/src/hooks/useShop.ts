import { useCallback, useEffect, useRef, useState } from "react";
import type { LimitedCardRedeemResponse, ShopCatalogResponse, ShopPurchaseResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadShopCatalog, purchaseShopOffer, redeemLimitedCard, ShopApiError } from "../telegram/shop";

export type ShopCatalogState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; catalog: ShopCatalogResponse };

export function useShop() {
  const [attempt, setAttempt] = useState(0);
  const [catalogState, setCatalogState] = useState<ShopCatalogState>({ status: "loading" });
  const [purchaseErrorCode, setPurchaseErrorCode] = useState<string | null>(null);
  const [purchasingOfferId, setPurchasingOfferId] = useState<string | null>(null);
  const [limitedRedeemErrorCode, setLimitedRedeemErrorCode] = useState<string | null>(null);
  const [redeemingLimited, setRedeemingLimited] = useState(false);
  const purchaseControllerRef = useRef<AbortController | null>(null);
  const limitedControllerRef = useRef<AbortController | null>(null);
  const purchaseInFlightRef = useRef(false);

  const retryCatalog = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setCatalogState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setCatalogState({ status: "loading" });
    void loadShopCatalog(initData, controller.signal)
      .then((catalog) => setCatalogState({ status: "ready", catalog }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => {
    purchaseControllerRef.current?.abort();
    limitedControllerRef.current?.abort();
  }, []);

  const purchase = useCallback(async (offerId: string): Promise<ShopPurchaseResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || purchaseInFlightRef.current) return null;

    purchaseInFlightRef.current = true;
    const controller = new AbortController();
    purchaseControllerRef.current = controller;
    setPurchaseErrorCode(null);
    setPurchasingOfferId(offerId);
    try {
      const result = await purchaseShopOffer(initData, offerId, controller.signal);
      setCatalogState((current) => current.status === "ready"
        ? {
            status: "ready",
            catalog: {
              offers: current.catalog.offers.map((offer) => ({
                ...offer,
                canAfford: result.updatedBalance[offer.currency] >= offer.price,
                upgrades: offer.id === offerId
                  ? offer.upgrades.map((upgrade) => ({
                      ...upgrade,
                      chance: result.updatedChances.find(({ rarity }) => rarity === upgrade.rarity)?.chance
                        ?? upgrade.chance,
                    }))
                  : offer.upgrades,
              })),
            },
          }
        : current);
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setPurchaseErrorCode(error instanceof ShopApiError ? error.code : "shop_request_failed");
      }
      return null;
    } finally {
      if (purchaseControllerRef.current === controller) purchaseControllerRef.current = null;
      purchaseInFlightRef.current = false;
      setPurchasingOfferId(null);
    }
  }, []);

  const redeemLimited = useCallback(async (eventId: string, promoCode: string): Promise<LimitedCardRedeemResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || limitedControllerRef.current) return null;

    const controller = new AbortController();
    limitedControllerRef.current = controller;
    setLimitedRedeemErrorCode(null);
    setRedeemingLimited(true);
    try {
      const result = await redeemLimitedCard(initData, eventId, promoCode, controller.signal);
      setCatalogState((current) => current.status === "ready" && current.catalog.limitedEvent
        ? {
            status: "ready",
            catalog: {
              ...current.catalog,
              limitedEvent: { ...current.catalog.limitedEvent, redeemed: true },
            },
          }
        : current);
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setLimitedRedeemErrorCode(error instanceof ShopApiError ? error.code : "limited_card_request_failed");
      }
      return null;
    } finally {
      if (limitedControllerRef.current === controller) limitedControllerRef.current = null;
      setRedeemingLimited(false);
    }
  }, []);

  return {
    catalogState,
    limitedRedeemErrorCode,
    purchase,
    purchaseErrorCode,
    purchasingOfferId,
    redeemLimited,
    redeemingLimited,
    retryCatalog,
  };
}
