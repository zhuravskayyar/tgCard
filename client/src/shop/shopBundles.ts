export type ShopBundleTheme = "elemental" | "goblins";

export interface ShopBundle {
  id: string;
  title: string;
  description: string;
  theme: ShopBundleTheme;
  art: string;
  thumbnail: string;
}

// Collection bundles return after cards from the new catalog are shop-ready.
export const SHOP_BUNDLES: readonly ShopBundle[] = Object.freeze([]);
