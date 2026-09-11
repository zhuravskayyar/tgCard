import type { AdminCurrency } from "@cardastika/shared";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { formatNumber } from "./adminFormat";

interface AdminCurrencyValueProps {
  kind: AdminCurrency;
  size?: number;
  value: number;
}

export function AdminCurrencyValue({ kind, size = 16, value }: AdminCurrencyValueProps) {
  const label = kind === "silver" ? "Срібло" : "Золото";
  return (
    <span aria-label={`${label}: ${formatNumber(value)}`} className={`admin-currency-value admin-currency-value--${kind}`}>
      <CurrencyIcon kind={kind} size={size} />
      <span>{formatNumber(value)}</span>
    </span>
  );
}
