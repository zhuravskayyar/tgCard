export type ShopCategoryId = "ready-bundles" | "magical-cards" | "cosmetics" | "boosts";
export type ShopCategoryTheme = "bundles" | "cards" | "cosmetics" | "boosts";
export type ShopCategoryDestination = "bundles" | "cards" | "cosmetics" | "boosts";

export interface ShopCategory {
  id: ShopCategoryId;
  title: string;
  subtitle: string;
  theme: ShopCategoryTheme;
  destination: ShopCategoryDestination;
  /** Optional final banner path; null keeps the themed CSS placeholder. */
  placeholderArt: string | null;
}

export const SHOP_CATEGORIES: readonly ShopCategory[] = [
  {
    id: "ready-bundles",
    title: "Готові набори",
    subtitle: "Найнеобхідніше для легкого старту",
    theme: "bundles",
    destination: "bundles",
    placeholderArt: "/assets/ui/shop/categories/shop-category-bundles.png",
  },
  {
    id: "magical-cards",
    title: "Магічні карти",
    subtitle: "Від звичайних до міфічних",
    theme: "cards",
    destination: "cards",
    placeholderArt: "/assets/ui/shop/categories/shop-category-cards.png",
  },
  {
    id: "cosmetics",
    title: "Вигляд",
    subtitle: "Виділяйся серед інших",
    theme: "cosmetics",
    destination: "cosmetics",
    placeholderArt: "/assets/ui/shop/categories/shop-category-cosmetics.png",
  },
  {
    id: "boosts",
    title: "Підсилення",
    subtitle: "Бонуси на досвід і срібло",
    theme: "boosts",
    destination: "boosts",
    placeholderArt: "/assets/ui/shop/categories/shop-category-boosts.png",
  },
];
