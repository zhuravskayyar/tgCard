import { useEffect, useRef, useState } from "react";
import { formatUiNumber } from "../i18n";
import { DiamondIcon, DIAMOND_ICON_SRC } from "./DiamondIcon";
import { DIAMOND_GAIN_EVENT, type DiamondGainDetail } from "./diamondGain";
import { flyIconToHud } from "./rewardFly";

const COUNT_UP_MS = 900;
const HOLD_MS = 1_400;
const LEAVE_MS = 400;

type PillState = { phase: "hidden" } | { phase: "shown" | "leaving"; value: number };

/** A temporary third HUD capsule: appears when diamonds are gained, counts up, then disappears. */
export function DiamondHudPill() {
  const [pill, setPill] = useState<PillState>({ phase: "hidden" });
  const rootRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<{ frame: number; timers: number[] }>({ frame: 0, timers: [] });

  useEffect(() => {
    const run = runRef.current;
    const stop = () => {
      window.cancelAnimationFrame(run.frame);
      run.timers.forEach((timer) => window.clearTimeout(timer));
      run.timers = [];
    };
    const onGain = (event: Event) => {
      const { from, to } = (event as CustomEvent<DiamondGainDetail>).detail;
      stop();
      setPill({ phase: "shown", value: from });
      // Wait one frame so the capsule exists before the gems fly into it.
      run.frame = window.requestAnimationFrame(() => {
        const delay = rootRef.current ? flyIconToHud(rootRef.current, to - from, DIAMOND_ICON_SRC, "diamond") : 0;
        run.timers.push(window.setTimeout(() => {
          const startedAt = performance.now();
          const tick = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
            setPill({ phase: "shown", value: Math.round(from + (to - from) * (1 - (1 - progress) ** 3)) });
            if (progress < 1) {
              run.frame = window.requestAnimationFrame(tick);
              return;
            }
            run.timers.push(window.setTimeout(() => setPill({ phase: "leaving", value: to }), HOLD_MS));
            run.timers.push(window.setTimeout(() => setPill({ phase: "hidden" }), HOLD_MS + LEAVE_MS));
          };
          run.frame = window.requestAnimationFrame(tick);
        }, delay));
      });
    };
    window.addEventListener(DIAMOND_GAIN_EVENT, onGain);
    return () => {
      window.removeEventListener(DIAMOND_GAIN_EVENT, onGain);
      stop();
    };
  }, []);

  if (pill.phase === "hidden") return null;
  return (
    <div
      aria-label={`Алмази: ${formatUiNumber(pill.value)}`}
      aria-live="polite"
      className={`currency-display currency-display--diamond${pill.phase === "leaving" ? " is-leaving" : ""}`}
      ref={rootRef}
    >
      <DiamondIcon />
      <span className="currency-display__value">{formatUiNumber(pill.value)}</span>
    </div>
  );
}
