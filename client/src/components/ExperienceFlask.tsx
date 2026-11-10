import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import "./experience-flask-tones.css";

interface ExperienceFlaskProps {
  /** Current level; when given, changes pour smoothly and a higher level first fills the flask to the top. */
  level?: number;
  /** Shown progress 0..1; `useExperienceFly` already animates it and wraps it on a level-up. */
  progress: number;
  /** Zero-width anchor at the liquid's leading edge, where gained experience flies to. */
  tipRef?: RefObject<HTMLSpanElement | null>;
  /** Skip the pour: the HUD bar is already animated by `useExperienceFly`. */
  instant?: boolean;
  /** Pour length for a full flask; a countdown passes its tick so the liquid flows without steps. */
  pourMs?: number;
  /** Constant flow instead of easing out, for timers. */
  linear?: boolean;
  /** Liquid colour: amber experience/quests (HUD default), verdant card growth, crimson duel wins, azure league rating, violet arena countdown. */
  tone?: "amber" | "verdant" | "crimson" | "azure" | "violet";
}

/** Share of a level that fills the glass bulb before the liquid runs on into the tube. */
const BULB_SHARE = 0.15;
// Flask canvas 1730x144: bulb centre x 70; tube channel x 170-1570.
const BULB_TIP_X = 70 / 1730;
const TUBE_LEFT = 170 / 1730;
const TUBE_WIDTH = 1400 / 1730;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

const POUR_MS = 900;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

interface PourOptions { instant: boolean; pourMs: number; linear: boolean }

/**
 * Pours the liquid to a new level instead of jumping, starting from empty when the flask appears.
 * When `level` rises the flask first fills to the top, then starts again from empty, so a level-up
 * reads as a full flask. Instant under reduced motion or when `instant` is set.
 */
function usePouredProgress(target: number, level: number | undefined, { instant, pourMs, linear }: PourOptions) {
  const [shown, setShown] = useState(() => (instant || prefersReducedMotion() ? target : 0));
  const shownRef = useRef(shown);
  const levelRef = useRef(level);
  useEffect(() => {
    const previousLevel = levelRef.current;
    levelRef.current = level;
    if (instant || prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const levelledUp = previousLevel !== undefined && level !== undefined && level > previousLevel;
    // Legs of the pour: up to the brim on a level-up, then from empty to the new level.
    const legs: Array<[number, number]> = levelledUp ? [[shownRef.current, 1], [0, target]] : [[shownRef.current, target]];
    let frame = 0;
    let leg = 0;
    let startedAt = performance.now();
    const step = (now: number) => {
      const [from, to] = legs[leg]!;
      const span = Math.abs(to - from);
      const duration = linear ? pourMs : Math.max(1, pourMs * Math.max(0.35, span));
      const t = Math.min(1, (now - startedAt) / duration);
      const value = from + (to - from) * (linear ? t : easeOut(t));
      shownRef.current = value;
      setShown(value);
      if (t < 1) { frame = requestAnimationFrame(step); return; }
      if (leg + 1 < legs.length) { leg += 1; startedAt = now; frame = requestAnimationFrame(step); }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, level, instant, pourMs, linear]);
  return shown;
}

/** HUD experience bar: an alchemical flask; amber liquid fills the bulb first, then the tube. */
export function ExperienceFlask({ instant = false, level, linear = false, pourMs = POUR_MS, progress, tipRef, tone = "amber" }: ExperienceFlaskProps) {
  const value = clamp01(usePouredProgress(clamp01(progress), level, { instant, linear, pourMs }));
  const bulbFill = Math.min(1, value / BULB_SHARE);
  const tubeFill = value <= BULB_SHARE ? 0 : (value - BULB_SHARE) / (1 - BULB_SHARE);
  const tipX = tubeFill > 0 ? TUBE_LEFT + TUBE_WIDTH * tubeFill : BULB_TIP_X;

  // A level-up shows as the hook wrapping progress from the top back to the start.
  const previous = useRef(value);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (value < previous.current - 0.5) setFlash((count) => count + 1);
    previous.current = value;
  }, [value]);

  const style = { "--bulb-fill": bulbFill, "--tube-fill": tubeFill } as CSSProperties;
  return (
    <span aria-hidden="true" className={`experience-flask${tone === "amber" ? "" : ` experience-flask--${tone}`}`} style={style}>
      <span className={`experience-flask__bulb${bulbFill <= 0 ? " experience-flask__bulb--empty" : ""}`}>
        <span className="experience-flask__flow experience-flask__flow--bulb" />
      </span>
      <span className="experience-flask__channel">
        <span className={`experience-flask__liquid${tubeFill <= 0 ? " experience-flask__liquid--empty" : ""}`} />
        {tubeFill > 0 ? <span className="experience-flask__flow experience-flask__flow--tube" /> : null}
      </span>
      <span className="experience-flask__brass" />
      <span className="experience-flask__tip" ref={tipRef} style={{ left: `${tipX * 100}%` }} />
      {flash > 0 ? <span className="experience-flask__flash" key={flash} /> : null}
    </span>
  );
}
