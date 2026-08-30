import { useCallback, useEffect, useRef, useState } from "react";
import type { NicknameSkinId, NicknameSkinPurchaseResponse, NicknameSkinShopOffer } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadNicknameSkinCatalog, NicknameSkinApiError, purchaseNicknameSkin } from "../telegram/nicknameSkins";

export type NicknameSkinCatalogState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; offer: NicknameSkinShopOffer };

export function useNicknameSkinShop() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<NicknameSkinCatalogState>({ status: "loading" });
  const [purchaseErrorCode, setPurchaseErrorCode] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const purchaseInFlight = useRef(false);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadNicknameSkinCatalog(initData, controller.signal)
      .then((response) => setState({ status: "ready", offer: response.offer }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  const purchase = useCallback(async (choiceId: NicknameSkinId): Promise<NicknameSkinPurchaseResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || purchaseInFlight.current) return null;
    purchaseInFlight.current = true;
    setPurchaseErrorCode(null);
    setPurchasing(true);
    const controller = new AbortController();
    try {
      const response = await purchaseNicknameSkin(initData, choiceId, controller.signal);
      setState({ status: "ready", offer: response.offer });
      return response;
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setPurchaseErrorCode(error instanceof NicknameSkinApiError ? error.code : "nickname_skin_request_failed");
      }
      return null;
    } finally {
      purchaseInFlight.current = false;
      setPurchasing(false);
    }
  }, []);

  return { purchase, purchaseErrorCode, purchasing, retry, state };
}
