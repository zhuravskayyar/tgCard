import { useCallback, useEffect, useRef, useState } from "react";
import type { NicknameSkinId, PlayerInventoryResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { equipNicknameSkin, loadPlayerInventory, NicknameSkinApiError } from "../telegram/nicknameSkins";

export type PlayerInventoryState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; errorCode?: string }
  | { status: "ready"; data: PlayerInventoryResponse };

export function usePlayerInventory() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerInventoryState>({ status: "loading" });
  const [pending, setPending] = useState<NicknameSkinId | "standard" | null>(null);
  const equipInFlight = useRef(false);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadPlayerInventory(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", errorCode: error instanceof NicknameSkinApiError ? error.code : undefined });
      });
    return () => controller.abort();
  }, [attempt]);

  const equip = useCallback(async (skinId: NicknameSkinId | null) => {
    const initData = getTelegramInitData();
    if (!initData || equipInFlight.current) return null;
    equipInFlight.current = true;
    setPending(skinId ?? "standard");
    try {
      const response = await equipNicknameSkin(initData, skinId);
      setState({ status: "ready", data: response.inventory });
      return response.inventory;
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setState((current) => current.status === "ready" ? current : { status: "error", errorCode: error instanceof NicknameSkinApiError ? error.code : undefined });
      }
      return null;
    } finally {
      equipInFlight.current = false;
      setPending(null);
    }
  }, []);

  return { equip, pending, retry, state };
}
