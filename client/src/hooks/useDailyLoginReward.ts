import { useCallback, useEffect, useState } from "react";
import type { BattlePassPageResponse, DailyLoginClaimResponse, LariskaDailyRewardView } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { claimLariskaDailyReward, loadBattlePass } from "../telegram/battlePass";

export type DailyLoginRewardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: LariskaDailyRewardView }
  | { status: "error"; message: string };

export function useDailyLoginReward(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DailyLoginRewardState>({ status: "idle" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle" });
      return;
    }

    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error", message: "Щоденна нагорода доступна після входу в гру" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void loadBattlePass(initData, controller.signal)
      .then((data: BattlePassPageResponse) => setState({ status: "ready", data: data.dailyLogin }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Не вдалося завантажити нагороду за вхід" });
      });
    return () => controller.abort();
  }, [attempt, enabled]);

  const claim = useCallback(async (choiceIndex?: number): Promise<DailyLoginClaimResponse> => {
    const initData = getTelegramInitData();
    if (!initData) throw new Error("Telegram authentication is unavailable");
    const response = await claimLariskaDailyReward(initData, choiceIndex);
    setState({ status: "ready", data: response.dailyLogin });
    return response;
  }, []);

  return { claim, retry, state };
}
