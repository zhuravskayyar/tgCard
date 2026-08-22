import { useCallback, useEffect, useState } from "react";
import { DECK_SIZE, type PlayerDeckResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadTelegramPlayerDeck, PlayerDataError } from "../telegram/playerDeck";

export type PlayerDeckState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; deck: PlayerDeckResponse };

export function usePlayerDeck() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerDeckState>({ status: "loading" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void loadTelegramPlayerDeck(initData, controller.signal)
      .then((deck) => {
        setState(deck.cards.length === DECK_SIZE ? { status: "ready", deck } : { status: "missing" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: error instanceof PlayerDataError && error.status === 404 ? "missing" : "error" });
      });

    return () => controller.abort();
  }, [attempt]);

  return { retry, state };
}
