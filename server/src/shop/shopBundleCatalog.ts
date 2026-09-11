import type { ShopCurrency } from "@cardastika/shared";

export interface ShopBundleDefinition {
  cardIds: readonly string[];
  currency: ShopCurrency;
  id: string;
  price: number;
}

export const SHOP_BUNDLES: readonly ShopBundleDefinition[] = [
  {
    id: "elemental-spirits",
    currency: "gold",
    price: 60,
    cardIds: [
      "element_spirits_01",
      "element_spirits_02",
      "element_spirits_03",
      "element_spirits_04",
    ],
  },
  {
    id: "goblin-brotherhood",
    currency: "gold",
    price: 60,
    cardIds: [
      "goblin_brotherhood_01",
      "goblin_brotherhood_02",
      "goblin_brotherhood_03",
      "goblin_brotherhood_04",
    ],
  },
];

export function findShopBundle(id: string) {
  return SHOP_BUNDLES.find((bundle) => bundle.id === id);
}
