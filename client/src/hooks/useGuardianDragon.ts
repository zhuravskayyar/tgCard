import { useCallback, useEffect, useState } from "react";
import type { GuardianDragonView } from "@cardastika/shared";
import { getTelegramInitData } from "../telegram";
import { loadGuardianDragon } from "../telegram/guardianDragon";

export type DragonState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; data: GuardianDragonView };

export function useGuardianDragon(withFlameAbsorb = false) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DragonState>({ status: "loading" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadGuardianDragon(initData, controller.signal, withFlameAbsorb)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt, withFlameAbsorb]);
  return { retry, setState, state };
}
