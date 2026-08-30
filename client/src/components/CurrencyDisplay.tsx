import type { PlayerSummaryState } from "../types/player";
import { getUiNumberLocale } from "../i18n";

export type CurrencyKind = "silver" | "gold";

interface CurrencyDisplayProps {
  kind: CurrencyKind;
  label: string;
  state: PlayerSummaryState["status"];
  value?: number;
}

export const CURRENCY_ICON_SOURCES: Readonly<Record<CurrencyKind, string>> = {
  silver: "/assets/ui/world-tree/currency-silver-moon-v1.png",
  gold: "/assets/ui/world-tree/currency-gold-sun-v1.png",
};

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
  const displayValue = isReady ? new Intl.NumberFormat(getUiNumberLocale()).format(value) : "—";

  return (
    <div
      className={`currency-display currency-display--${kind}`}
      aria-label={`${label}: ${isReady ? displayValue : "недоступно"}`}
    >
      <CurrencyIcon kind={kind} />
      {state === "loading" ? (
        <span className="skeleton skeleton--currency" />
      ) : (
        <span className="currency-display__value" key={displayValue}>{displayValue}</span>
      )}
    </div>
  );
}
