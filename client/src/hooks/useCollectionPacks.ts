import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionPackPurchaseResponse, CollectionPacksResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadCollectionPacks, purchaseCollectionPack, ShopApiError } from "../telegram/shop";

export type CollectionPacksState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; data: CollectionPacksResponse };

export function useCollectionPacks() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CollectionPacksState>({ status: "loading" });
  const [purchasingOfferId, setPurchasingOfferId] = useState<string | null>(null);
  const [purchaseErrorCode, setPurchaseErrorCode] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadCollectionPacks(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const purchase = useCallback(async (offerId: string, expectedPrice?: number): Promise<CollectionPackPurchaseResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || controllerRef.current) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPurchaseErrorCode(null);
    setPurchasingOfferId(offerId);
    try {
      const result = await purchaseCollectionPack(initData, offerId, controller.signal, expectedPrice);
      // Discovered cards, counters and affordability change together, so take the fresh catalog without a loading flash.
      void loadCollectionPacks(initData, controller.signal)
        .then((data) => setState({ status: "ready", data }))
        .catch(() => undefined);
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setPurchaseErrorCode(error instanceof ShopApiError ? error.code : "shop_request_failed");
        // A changed price or an already collected set means the catalog is stale: show the fresh one.
        if (error instanceof ShopApiError && (error.code === "price_changed" || error.code === "collection_complete")) {
          void loadCollectionPacks(initData, controller.signal)
            .then((data) => setState({ status: "ready", data }))
            .catch(() => undefined);
        }
      }
      return null;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setPurchasingOfferId(null);
    }
  }, []);

  return { purchase, purchaseErrorCode, purchasingOfferId, retry, state };
}
