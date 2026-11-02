import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DuelExchange } from "@cardastika/shared";
import { BATTLE_SOUND_CUES, playSound, preloadSounds } from "../audio";
import { BATTLE_ATTACK_DURATION_MS, BATTLE_ATTACK_END_EVENT } from "./BattleAttackAnimation";

// Safety net only: the strike normally ends on its own animation event, even when its first frames were delayed.
const ATTACK_END_FALLBACK_MS = BATTLE_ATTACK_DURATION_MS + 900;

function waitForAttackEnd(done: () => void) {
  // Whichever comes first (end event or fallback) settles it; the other must not fire done again.
  const settle = () => {
    stop();
    done();
  };
  const timer = window.setTimeout(settle, ATTACK_END_FALLBACK_MS);
  window.addEventListener(BATTLE_ATTACK_END_EVENT, settle, { once: true });
  function stop() {
    window.clearTimeout(timer);
    window.removeEventListener(BATTLE_ATTACK_END_EVENT, settle);
  }
  return stop;
}

export function useBattleExchange(latest: DuelExchange | null, identity: string | number | undefined = latest?.turnNumber) {
  const lastTurn = useRef(identity);
  const [exchange, setExchange] = useState<DuelExchange | null>(null);
  // Every battle screen uses this hook, so the first strike already has its sounds decoded.
  useEffect(() => { preloadSounds(BATTLE_SOUND_CUES); }, []);
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

/**
 * Keep the final authoritative board mounted until its strike completes.
 * With an outcome, the victory/defeat sound plays exactly when the result appears after a live battle.
 */
export function useBattleResultReady(active: boolean, finished: boolean, outcome?: "win" | "loss" | null) {
  const wasActive = useRef(active);
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;
  const [waiting, setWaiting] = useState(false);
  const justFinished = wasActive.current && finished;
  useEffect(() => {
    const shouldWait = wasActive.current && finished;
    wasActive.current = active;
    if (!shouldWait) { setWaiting(false); return; }
    setWaiting(true);
    return waitForAttackEnd(() => {
      setWaiting(false);
      if (outcomeRef.current) playSound(outcomeRef.current === "win" ? "battle-victory" : "battle-defeat");
    });
  }, [active, finished]);
  return finished && !justFinished && !waiting;
}
