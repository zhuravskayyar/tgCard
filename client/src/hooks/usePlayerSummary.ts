import { useCallback, useEffect, useState } from "react";
import type { CollectionCompletionNotice, PlayerNicknameUpdateResponse, PlayerSummary } from "@cardastika/shared";
import { getRawTelegramInitData, getTelegramInitData } from "../telegram";
import { authenticateTelegramPlayer, loadCurrentPlayer, PlayerBootstrapError } from "../telegram/authenticatePlayer";
import { updatePlayerNickname } from "../telegram/nickname";
import { getSessionToken } from "../auth/session";
import type { PlayerSummaryState } from "../types/player";

export function usePlayerSummary() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PlayerSummaryState>({ status: "loading" });

  const retry = useCallback(() => {
    setAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  const updateBalance = useCallback((balance: Partial<Pick<PlayerSummary, "accountXp" | "accountXpRequired" | "arenaLeagueIndex" | "arenaRating" | "arenaTokens" | "arenaTop3Count" | "arenaWins" | "cardShards" | "duelHighestLeagueIndex" | "duelRating" | "duelWins" | "equipment" | "equippedNicknameSkin" | "gold" | "level" | "silver">>) => {
    setState((current) => current.status === "ready"
      ? { status: "ready", data: { ...current.data, ...balance } }
      : current);
  }, []);

  const addCollectionBonus = useCallback((completion: CollectionCompletionNotice) => {
    setState((current) => {
      if (current.status !== "ready") return current;
      const bonuses = current.data.collectionBonuses ?? [];
      if (bonuses.some(({ collectionId }) => collectionId === completion.id)) return current;
      return {
        status: "ready",
        data: {
          ...current.data,
          collectionBonuses: [
            ...bonuses,
            {
              bonus: completion.bonus,
              bonusLabel: completion.bonusLabel,
              collectionId: completion.id,
              collectionName: completion.name,
            },
          ],
        },
      };
    });
  }, []);

  const updateNickname = useCallback(async (nickname: string): Promise<PlayerNicknameUpdateResponse> => {
    const credential = getTelegramInitData();
    if (!credential) throw new Error("nickname_auth_required");
    const result = await updatePlayerNickname(credential, nickname, new AbortController().signal);
    setState((current) => current.status === "ready"
      ? { status: "ready", data: { ...current.data, nickname: result.nickname } }
      : current);
    return result;
  }, []);

  useEffect(() => {
    const initData = getRawTelegramInitData();
    if (!initData && !getSessionToken()) {
      setState({ status: "unauthenticated" });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });

    const authentication = initData
      ? authenticateTelegramPlayer(initData, controller.signal)
      : loadCurrentPlayer(controller.signal);
    void authentication
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof Error && error.name === "AbortError")) {
          return;
        }

        setState(error instanceof PlayerBootstrapError && error.status === 401
          ? { status: "unauthenticated" }
          : { status: "error", message: "Не вдалося завантажити профіль" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  return { addCollectionBonus, retry, state, updateBalance, updateNickname };
}
