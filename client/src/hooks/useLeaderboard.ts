import { useEffect, useState } from "react";
import type { LeaderboardKind, LeaderboardResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { LeaderboardApiError, loadLeaderboard } from "../telegram/leaderboards";

export type LeaderboardState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error"; message?: string }
  | { status: "ready"; data: LeaderboardResponse };

export function useLeaderboard(kind: LeaderboardKind, page: number) {
  const [state, setState] = useState<LeaderboardState>({ status: "loading" });

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void loadLeaderboard(initData, kind, page, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: error instanceof LeaderboardApiError ? error.code : "leaderboard_request_failed",
        });
      });

    return () => controller.abort();
  }, [kind, page]);

  return state;
}
