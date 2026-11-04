export type CurrencyKind = "silver" | "gold";

export const CURRENCY_ICON_SOURCES: Readonly<Record<CurrencyKind, string>> = {
  silver: "/assets/ui/world-tree/currency-silver-moon-v1.png",
  gold: "/assets/ui/world-tree/currency-gold-sun-v1.png",
};
