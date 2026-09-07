import { useEffect, useRef, useState } from "react";
import type { DuelExchange } from "@cardastika/shared";
import { BATTLE_ATTACK_DURATION_MS } from "./BattleAttackAnimation";

export function useBattleExchange(latest: DuelExchange | null, identity: string | number | undefined = latest?.turnNumber) {
  const lastTurn = useRef(identity);
  const [exchange, setExchange] = useState<DuelExchange | null>(null);
  useEffect(() => {
    if (!latest || identity === lastTurn.current) return;
    lastTurn.current = identity;
    setExchange(latest);
  }, [latest, identity]);
  useEffect(() => {
    if (!exchange) return;
    const timer = window.setTimeout(() => setExchange(null), BATTLE_ATTACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [exchange]);
  return exchange;
}

/** Keep the final authoritative board mounted until its strike completes. */
export function useBattleResultReady(active: boolean, finished: boolean) {
  const wasActive = useRef(active);
  const [waiting, setWaiting] = useState(false);
  const justFinished = wasActive.current && finished;
  useEffect(() => {
    const shouldWait = wasActive.current && finished;
    wasActive.current = active;
    if (!shouldWait) { setWaiting(false); return; }
    setWaiting(true);
    const timer = window.setTimeout(() => setWaiting(false), BATTLE_ATTACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [active, finished]);
  return finished && !justFinished && !waiting;
}
