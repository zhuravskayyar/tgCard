import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { formatUiNumber, getUiLocale, translateUi } from "../i18n";
import "./battle-outcome.css";

const CREST_WIN = "/assets/ui/duel/result-victory-crest-v1.webp";
const CREST_LOSS = "/assets/ui/duel/result-defeat-crest-v2.webp";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Rewards tick up from zero once the crest has landed. */
export function CountUpValue({ value, delay = 650, duration = 900 }: { value: number; delay?: number; duration?: number }) {
  const [shown, setShown] = useState(() => reducedMotion() ? value : 0);
  useEffect(() => {
    if (reducedMotion()) { setShown(value); return; }
    let frame = 0;
    const startAt = performance.now() + delay;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - startAt) / duration));
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, duration, value]);
  return <span className="duel-outcome__reward-value ui-number">{formatUiNumber(shown)}</span>;
}

/**
 * The stamped crest, light rays, sparks and unrolling ПЕРЕМОГА / ПОРАЗКА ribbon shared by every battle result.
 * Longer mode verdicts go to `subtitle`, never into the ribbon.
 */
export function BattleOutcomeHeader({ subtitle, won }: { subtitle?: ReactNode; won: boolean }) {
  // Translate before splitting: the runtime translator cannot match single-letter spans.
  const title = translateUi(won ? "ПЕРЕМОГА" : "ПОРАЗКА", getUiLocale());
  return (
    <>
      <header className={`duel-outcome__crest${won ? "" : " duel-outcome__crest--loss"}`}>
        {won ? <span aria-hidden="true" className="duel-outcome__rays" /> : null}
        <img alt="" className="duel-outcome__crest-art" src={won ? CREST_WIN : CREST_LOSS} />
        <span aria-hidden="true" className={`duel-outcome__particles${won ? " duel-outcome__particles--win" : " duel-outcome__particles--loss"}`}>
          {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
        </span>
        <h1 aria-label={title} className="duel-outcome__title">
          {Array.from(title, (letter, index) => <span key={`${letter}-${index}`} style={{ "--letter-index": index } as CSSProperties}>{letter}</span>)}
        </h1>
      </header>
      {subtitle ? <p className="battle-outcome__subtitle">{subtitle}</p> : null}
    </>
  );
}

/** One reward on the HUD currency plate: icon in the socket, counted-up value in the middle. */
export function OutcomeReward({ icon, label, source, value }: { icon: ReactNode; label: string; source: string; value: number }) {
  return <span aria-label={`${label}: ${value}`} className="duel-outcome__reward" data-reward-source={source}>{icon}<CountUpValue value={value} /></span>;
}

/** The "Ти отримав:" caption with its row of reward plates. */
export function OutcomeLoot({ children, label = "Нагороди" }: { children: ReactNode; label?: string }) {
  return <>
    <p className="duel-outcome__received">Ти отримав:</p>
    <div aria-label={label} className="duel-outcome__loot">{children}</div>
  </>;
}
