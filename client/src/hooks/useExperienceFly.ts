import { useEffect, useRef, useState, type RefObject } from "react";
import { flyExperienceToHud } from "../components/rewardFly";

const FILL_MS = 800;

interface ExperienceState {
  level: number;
  required: number;
  xp: number;
}

function toProgress({ required, xp }: ExperienceState) {
  return required === 0 ? 1 : Math.min(1, Math.max(0, xp / required));
}

/** Flies gained XP into the HUD vine, then fills it; a level-up fills to the end and restarts. */
export function useExperienceFly(current: ExperienceState | null, targetRef: RefObject<HTMLElement | null>) {
  const previous = useRef<ExperienceState | null>(null);
  const shown = useRef(0);
  const [progress, setProgress] = useState(0);
  const level = current?.level;
  const required = current?.required;
  const xp = current?.xp;

  useEffect(() => {
    if (level === undefined || required === undefined || xp === undefined) {
      previous.current = null;
      return undefined;
    }
    const next = { level, required, xp };
    const before = previous.current;
    previous.current = next;
    const show = (value: number) => {
      shown.current = value;
      setProgress(value);
    };
    const leveledUp = before !== null && next.level > before.level;
    const gain = before === null ? 0 : leveledUp ? before.required - before.xp + next.xp : next.xp - before.xp;
    if (before === null || gain <= 0 || !targetRef.current) {
      show(toProgress(next));
      return undefined;
    }

    const from = shown.current;
    const to = toProgress(next);
    let frame = 0;
    const delay = flyExperienceToHud(targetRef.current, gain, from);
    const timer = window.setTimeout(() => {
      if (delay === 0) {
        show(to);
        return;
      }
      const span = leveledUp ? 1 - from + to : to - from;
      const startedAt = performance.now();
      const tick = (now: number) => {
        const elapsed = Math.min(1, (now - startedAt) / FILL_MS);
        const value = from + span * (1 - (1 - elapsed) ** 3);
        show(elapsed === 1 ? to : value > 1 ? value - 1 : value);
        if (elapsed < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [level, required, targetRef, xp]);

  return progress;
}
