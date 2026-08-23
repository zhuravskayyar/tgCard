import { useCallback, useEffect, useState } from "react";
import type { WeakPlayerCardsResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadWeakCards } from "../telegram/playerCards";

export type WeakCardsState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; data: WeakPlayerCardsResponse };

export function useWeakCards(page: number) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WeakCardsState>({ status: "loading" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadWeakCards(initData, page, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt, page]);

  return { retry, state };
}
