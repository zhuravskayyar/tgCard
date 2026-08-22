import { useCallback, useEffect, useState } from "react";
import { getTelegramInitData } from "../telegram";
import { authenticateTelegramPlayer } from "../telegram/authenticatePlayer";
import type { PlayerSummaryState } from "../types/player";

export function usePlayerSummary() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerSummaryState>({ status: "loading" });

  const retry = useCallback(() => {
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });

    void authenticateTelegramPlayer(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({ status: "error", message: "Не вдалося завантажити профіль" });
      });

    return () => controller.abort();
  }, [attempt]);

  return { retry, state };
}
