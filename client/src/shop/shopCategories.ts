import { SHOP_BUNDLES } from "./shopBundles";

export type ShopCategoryId = "ready-bundles" | "magical-cards" | "equipment-chests" | "cosmetics" | "boosts";
export type ShopCategoryTheme = "bundles" | "cards" | "chests" | "cosmetics" | "boosts";
export type ShopCategoryDestination = "bundles" | "cards" | "chests" | "cosmetics" | "boosts";

export interface ShopCategory {
  id: ShopCategoryId;
  title: string;
  subtitle: string;
  theme: ShopCategoryTheme;
  destination: ShopCategoryDestination;
  /** Optional final banner path; null keeps the themed CSS placeholder. */
  placeholderArt: string | null;
}

const ALL_SHOP_CATEGORIES: readonly ShopCategory[] = [
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
    id: "equipment-chests",
    title: "Скрині спорядження",
    subtitle: "Випадкові речі й артефакти за срібло",
    theme: "chests",
    destination: "chests",
    placeholderArt: null,
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

// Ready bundles stay hidden until bundles from the new catalog exist.
export const SHOP_CATEGORIES = ALL_SHOP_CATEGORIES.filter(({ id }) => id !== "ready-bundles" || SHOP_BUNDLES.length > 0);
