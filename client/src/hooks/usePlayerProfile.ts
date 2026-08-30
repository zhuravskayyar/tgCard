import { useEffect, useState } from "react";
import type { PublicPlayerProfile } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadPlayerProfile } from "../telegram/playerProfile";

export type PlayerProfileState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message?: string }
  | { status: "ready"; data: PublicPlayerProfile };

export function usePlayerProfile(playerId: string) {
  const [state, setState] = useState<PlayerProfileState>({ status: "loading" });

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadPlayerProfile(initData, playerId, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof Error ? error.message : "player_profile_request_failed" });
      });
    return () => controller.abort();
  }, [playerId]);

  return state;
}
