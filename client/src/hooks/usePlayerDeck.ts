import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckSlotInput, PlayerCardsResponse, PlayerDeckResponse } from "@cardastika/shared";
import { DECK_SIZE } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import {
  loadTelegramPlayerCards,
  loadTelegramPlayerDeck,
  PlayerDataError,
  saveTelegramPlayerDeck,
} from "../telegram/playerDeck";

export type PlayerDeckState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "missing" }
  | { status: "inventory-empty" }
  | { status: "error" }
  | { status: "ready"; deck: PlayerDeckResponse; inventory: PlayerCardsResponse };

export function usePlayerDeck() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerDeckState>({ status: "loading" });
  const saveController = useRef<AbortController | null>(null);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void Promise.all([
      loadTelegramPlayerDeck(initData, controller.signal),
      loadTelegramPlayerCards(initData, controller.signal),
    ])
      .then(([deck, inventory]) => {
        if (inventory.cards.length === 0) {
          setState({ status: "inventory-empty" });
        } else if (deck.cards.length !== DECK_SIZE) {
          setState({ status: "missing" });
        } else {
          setState({ status: "ready", deck, inventory });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: error instanceof PlayerDataError && error.status === 404 ? "missing" : "error" });
      });

    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => saveController.current?.abort(), []);

  const save = useCallback(async (slots: DeckSlotInput[]) => {
    const initData = getTelegramInitData();
    if (!initData) throw new PlayerDataError(401);
    saveController.current?.abort();
    const controller = new AbortController();
    saveController.current = controller;
    const deck = await saveTelegramPlayerDeck(initData, slots, controller.signal);
    setState((current) => current.status === "ready" ? { ...current, deck } : current);
    return deck;
  }, []);

  return { retry, save, state };
}
