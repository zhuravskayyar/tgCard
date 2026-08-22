import { useCallback, useEffect, useRef, useState } from "react";
import type { ShopCatalogResponse, ShopPurchaseResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadShopCatalog, purchaseShopOffer, ShopApiError } from "../telegram/shop";

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
  const purchaseControllerRef = useRef<AbortController | null>(null);
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

  useEffect(() => () => purchaseControllerRef.current?.abort(), []);

  const purchase = useCallback(async (offerId: string): Promise<ShopPurchaseResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || purchaseInFlightRef.current) return null;

    purchaseInFlightRef.current = true;
    const controller = new AbortController();
    purchaseControllerRef.current = controller;
    setPurchaseErrorCode(null);
    setPurchasingOfferId(offerId);
    try {
      return await purchaseShopOffer(initData, offerId, controller.signal);
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

  return {
    catalogState,
    purchase,
    purchaseErrorCode,
    purchasingOfferId,
    retryCatalog,
  };
}
