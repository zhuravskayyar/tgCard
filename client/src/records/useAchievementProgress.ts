import { useCallback, useEffect, useState } from "react";
import type { PlayerAchievementProgressResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadAchievementProgress } from "./achievementProgressApi";

export type AchievementProgressState =
  | { status: "loading" }
  | { status: "ready"; data: PlayerAchievementProgressResponse }
  | { status: "unavailable" }
  | { status: "error" };

export function useAchievementProgress(playerId?: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AchievementProgressState>({ status: "loading" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const credential = getTelegramInitData();
    if (!credential) {
      setState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });
    void loadAchievementProgress(credential, controller.signal, playerId)
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        setState({ status: "error" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, playerId]);

  return { retry, state };
}
