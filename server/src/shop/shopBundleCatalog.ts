import type { ShopCurrency } from "@cardastika/shared";

export interface ShopBundleDefinition {
  cardIds: readonly string[];
  currency: ShopCurrency;
  id: string;
  price: number;
}

// Old collection bundles stay hidden until a new shop card pool exists.
export const SHOP_BUNDLES: readonly ShopBundleDefinition[] = Object.freeze([]);

export function findShopBundle(id: string) {
  return SHOP_BUNDLES.find((bundle) => bundle.id === id);
}
