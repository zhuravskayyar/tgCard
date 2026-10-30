import { useEffect, useRef, useState } from "react";
import type { PlayerSummaryState } from "../types/player";
import { formatUiNumber } from "../i18n";
import { CURRENCY_ICON_SOURCES, type CurrencyKind } from "./currencyIcons";
import { flyRewardToHud } from "./rewardFly";

export { CURRENCY_ICON_SOURCES, type CurrencyKind };

const COUNT_UP_MS = 800;

interface CurrencyDisplayProps {
  kind: CurrencyKind;
  label: string;
  state: PlayerSummaryState["status"];
  value?: number;
}

interface CurrencyIconProps {
  kind: CurrencyKind;
  size?: number;
}

export function CurrencyIcon({ kind, size = 20 }: CurrencyIconProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`currency-icon currency-icon--${kind}`}
      height={size}
      src={CURRENCY_ICON_SOURCES[kind]}
      width={size}
    />
  );
}

export function CurrencyDisplay({ kind, label, state, value }: CurrencyDisplayProps) {
  const isReady = state === "ready" && value !== undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<number | null>(null);
  const [shownValue, setShownValue] = useState<number | null>(null);

  useEffect(() => {
    if (!isReady) {
      shownRef.current = null;
      setShownValue(null);
      return undefined;
    }
    const from = shownRef.current;
    const show = (next: number) => {
      shownRef.current = next;
      setShownValue(next);
    };
    if (from === null || value <= from || !rootRef.current) {
      show(value);
      return undefined;
    }
    let frame = 0;
    const delay = flyRewardToHud(kind, rootRef.current, value - from);
    const timer = window.setTimeout(() => {
      if (delay === 0) {
        show(value);
        return;
      }
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
        show(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [isReady, kind, value]);

  const displayValue = isReady ? formatUiNumber(shownValue ?? value) : "—";
  const compactValue = displayValue.match(/^(.+?)(трлн|млрд|м|к)$/u);
  const extendedUnit = compactValue !== null && compactValue[2].length > 1;

  return (
    <div
      className={`currency-display currency-display--${kind}`}
      aria-label={`${label}: ${isReady ? formatUiNumber(value) : "недоступно"}`}
      ref={rootRef}
    >
      <CurrencyIcon kind={kind} />
      {state === "loading" ? (
        <span className="skeleton skeleton--currency" />
      ) : (
        <span
          className={`currency-display__value${compactValue ? " currency-display__value--with-unit" : ""}${extendedUnit ? " currency-display__value--extended-unit" : ""}`}
        >
          {compactValue ? (
            <>
              <span>{compactValue[1]}</span>
              <span className="currency-display__unit">{compactValue[2]}</span>
            </>
          ) : displayValue}
        </span>
      )}
    </div>
  );
}
