import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DuelExchange } from "@cardastika/shared";
import { BATTLE_ATTACK_DURATION_MS, BATTLE_ATTACK_END_EVENT } from "./BattleAttackAnimation";

// Safety net only: the strike normally ends on its own animation event, even when its first frames were delayed.
const ATTACK_END_FALLBACK_MS = BATTLE_ATTACK_DURATION_MS + 900;

function waitForAttackEnd(done: () => void) {
  const timer = window.setTimeout(done, ATTACK_END_FALLBACK_MS);
  const handle = () => done();
  window.addEventListener(BATTLE_ATTACK_END_EVENT, handle, { once: true });
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener(BATTLE_ATTACK_END_EVENT, handle);
  };
}

export function useBattleExchange(latest: DuelExchange | null, identity: string | number | undefined = latest?.turnNumber) {
  const lastTurn = useRef(identity);
  const [exchange, setExchange] = useState<DuelExchange | null>(null);
  // Layout timing: the strike mounts before the browser paints the board with the replacement cards.
  useLayoutEffect(() => {
    if (!latest || identity === lastTurn.current) return;
    lastTurn.current = identity;
    setExchange(latest);
  }, [latest, identity]);
  useEffect(() => {
    if (!exchange) return;
    return waitForAttackEnd(() => setExchange(null));
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
    return waitForAttackEnd(() => setWaiting(false));
  }, [active, finished]);
  return finished && !justFinished && !waiting;
}
