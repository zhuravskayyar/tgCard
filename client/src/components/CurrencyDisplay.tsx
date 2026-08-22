import type { PlayerSummaryState } from "../types/player";
import { AppIcon } from "./AppIcon";

type CurrencyKind = "silver" | "gold";

interface CurrencyDisplayProps {
  kind: CurrencyKind;
  label: string;
  state: PlayerSummaryState["status"];
  value?: number;
}

const numberFormatter = new Intl.NumberFormat("uk-UA");

export function CurrencyDisplay({ kind, label, state, value }: CurrencyDisplayProps) {
  const isReady = state === "ready" && value !== undefined;
  const displayValue = isReady ? numberFormatter.format(value) : "—";

  return (
    <div
      className={`currency-display currency-display--${kind}`}
      aria-label={`${label}: ${isReady ? displayValue : "недоступно"}`}
    >
      <AppIcon name={kind} size={17} />
      {state === "loading" ? (
        <span className="skeleton skeleton--currency" />
      ) : (
        <span className="currency-display__value">{displayValue}</span>
      )}
    </div>
  );
}
