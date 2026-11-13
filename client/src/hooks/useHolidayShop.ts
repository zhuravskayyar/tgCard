import { useCallback, useEffect, useRef, useState } from "react";
import type { HolidayBundlePurchaseResponse, HolidayShopResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadHolidayShop, purchaseHolidayBundle, ShopApiError } from "../telegram/shop";

export type HolidayShopState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; data: HolidayShopResponse };

export function useHolidayShop() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HolidayShopState>({ status: "loading" });
  const [purchasingBundleId, setPurchasingBundleId] = useState<string | null>(null);
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
    void loadHolidayShop(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const purchase = useCallback(async (bundleId: string): Promise<HolidayBundlePurchaseResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || controllerRef.current) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPurchaseErrorCode(null);
    setPurchasingBundleId(bundleId);
    try {
      const result = await purchaseHolidayBundle(initData, bundleId, controller.signal);
      setState((current) => current.status === "ready"
        ? {
            status: "ready",
            data: {
              holidays: current.data.holidays.map((holiday) => ({
                ...holiday,
                bundles: holiday.bundles.map((bundle) => ({
                  ...bundle,
                  canAfford: result.updatedBalance[bundle.currency] >= bundle.price,
                  purchased: bundle.id === result.bundleId ? result.purchased : bundle.purchased,
                })),
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
      if (controllerRef.current === controller) controllerRef.current = null;
      setPurchasingBundleId(null);
    }
  }, []);

  return { purchase, purchaseErrorCode, purchasingBundleId, retry, state };
}
