import { useCallback, useEffect, useRef, useState } from "react";
import type { CardWorkshopCraftResponse, CardWorkshopResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { CardWorkshopApiError, craftCardWorkshopCard, loadCardWorkshop } from "../telegram/cardWorkshop";

export type CardWorkshopState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; errorCode: string }
  | { status: "ready"; data: CardWorkshopResponse };

export function useCardWorkshop() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CardWorkshopState>({ status: "loading" });
  const [craftingCardId, setCraftingCardId] = useState<string | null>(null);
  const [craftErrorCode, setCraftErrorCode] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadCardWorkshop(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", errorCode: error instanceof CardWorkshopApiError ? error.code : "workshop_request_failed" });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const craft = useCallback(async (cardId: string): Promise<CardWorkshopCraftResponse | null> => {
    const initData = getTelegramInitData();
    if (!initData || inFlightRef.current) return null;
    inFlightRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setCraftingCardId(cardId);
    setCraftErrorCode(null);
    try {
      const result = await craftCardWorkshopCard(initData, cardId, controller.signal);
      setState((current) => current.status === "ready"
        ? {
            status: "ready",
            data: {
              ...current.data,
              cardShards: result.cardShards,
              cards: current.data.cards.map((card) => card.cardId === cardId
                ? { ...card, ownedQuantity: result.quantity }
                : card),
            },
          }
        : current);
      return result;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setCraftErrorCode(error instanceof CardWorkshopApiError ? error.code : "workshop_request_failed");
      }
      return null;
    } finally {
      inFlightRef.current = false;
      setCraftingCardId(null);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  return {
    craft,
    craftErrorCode,
    craftingCardId,
    retry: () => setAttempt((value) => value + 1),
    state,
  };
}
