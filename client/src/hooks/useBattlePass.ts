import { useCallback, useEffect, useState } from "react";
import type { BattlePassPageResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import {
  claimBattlePassMilestone,
  claimDailyBattlePassTask,
  claimLariskaDailyReward,
  loadBattlePass,
} from "../telegram/battlePass";

export type BattlePassState =
  | { status: "loading" }
  | { status: "ready"; data: BattlePassPageResponse }
  | { status: "error"; message: string };

export function useBattlePass() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BattlePassState>({ status: "loading" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error", message: "Батл пас доступний лише в Telegram Mini App" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadBattlePass(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Не вдалося завантажити батл пас" });
      });
    return () => controller.abort();
  }, [attempt]);

  const claimMilestone = useCallback(async (milestoneId: string) => {
    const initData = getTelegramInitData();
    if (!initData) throw new Error("Telegram authentication is unavailable");
    const response = await claimBattlePassMilestone(initData, milestoneId);
    setState({ status: "ready", data: response });
    return response;
  }, []);

  const claimDailyTask = useCallback(async (taskId: string) => {
    const initData = getTelegramInitData();
    if (!initData) throw new Error("Telegram authentication is unavailable");
    const response = await claimDailyBattlePassTask(initData, taskId);
    setState({ status: "ready", data: response });
    return response;
  }, []);

  const claimDailyLogin = useCallback(async (choiceIndex?: number) => {
    const initData = getTelegramInitData();
    if (!initData) throw new Error("Telegram authentication is unavailable");
    const response = await claimLariskaDailyReward(initData, choiceIndex);
    setState({ status: "ready", data: response });
    return response;
  }, []);

  return { claimDailyLogin, claimDailyTask, claimMilestone, retry, state };
}
