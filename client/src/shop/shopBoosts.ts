export type ShopBoostCurrency = "gold" | "silver";
export type ShopBoostEffect = "experience" | "duel-silver";
export type ShopBoostTheme = "experience" | "silver";

export interface ShopBoost {
  id: string;
  title: string;
  duration: string;
  effect: ShopBoostEffect;
  effectLabel: string;
  price: number;
  currency: ShopBoostCurrency;
  theme: ShopBoostTheme;
  art: string;
}

export const SHOP_BOOSTS: readonly ShopBoost[] = [
  {
    id: "veteran-1h",
    title: "Настоянка ветерана",
    duration: "1 година",
    effect: "experience",
    effectLabel: "+100% досвіду",
    price: 10,
    currency: "gold",
    theme: "experience",
    art: "/assets/ui/shop/boosts/boost-veteran-1h.png",
  },
  {
    id: "veteran-12h",
    title: "Настоянка ветерана",
    duration: "12 годин",
    effect: "experience",
    effectLabel: "+100% досвіду",
    price: 150,
    currency: "gold",
    theme: "experience",
    art: "/assets/ui/shop/boosts/boost-veteran-1h-wide.png",
  },
  {
    id: "veteran-1d",
    title: "Настоянка ветерана",
    duration: "1 день",
    effect: "experience",
    effectLabel: "+100% досвіду",
    price: 250,
    currency: "gold",
    theme: "experience",
    art: "/assets/ui/shop/boosts/boost-veteran-1h-alt.png",
  },
  {
    id: "banker-1h",
    title: "Настоянка банкіра",
    duration: "1 година",
    effect: "duel-silver",
    effectLabel: "+100% срібла в дуелях",
    price: 10,
    currency: "gold",
    theme: "silver",
    art: "/assets/ui/shop/boosts/boost-banker-1h.png",
  },
  {
    id: "banker-12h",
    title: "Настоянка банкіра",
    duration: "12 годин",
    effect: "duel-silver",
    effectLabel: "+100% срібла в дуелях",
    price: 150,
    currency: "gold",
    theme: "silver",
    art: "/assets/ui/shop/boosts/boost-banker-1h-wide.png",
  },
  {
    id: "banker-1d",
    title: "Настоянка банкіра",
    duration: "1 день",
    effect: "duel-silver",
    effectLabel: "+100% срібла в дуелях",
    price: 250,
    currency: "gold",
    theme: "silver",
    art: "/assets/ui/shop/boosts/boost-banker-1h-alt.png",
  },
];
