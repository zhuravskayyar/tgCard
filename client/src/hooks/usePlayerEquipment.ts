import { useCallback, useEffect, useState } from "react";
import { getTelegramInitData } from "../telegram";
import { loadPlayerEquipment } from "../telegram/equipment";
import type { PlayerEquipmentResponse } from "@cardastika/shared";
import type { EquipmentInventoryStatus } from "../equipment/equipmentState";

export type PlayerEquipmentState =
  | { status: "loading" }
  | { status: "ready"; data: PlayerEquipmentResponse }
  | { status: "unavailable" }
  | { status: "error" };

export function usePlayerEquipment(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerEquipmentState>({ status: "loading" });
  const credential = getTelegramInitData();

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading" });
      return;
    }

    if (!credential) {
      setState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });
    void loadPlayerEquipment(credential, controller.signal)
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setState({ status: "error" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, credential, enabled]);

  const status: EquipmentInventoryStatus = state.status;
  return { retry, state, status };
}
