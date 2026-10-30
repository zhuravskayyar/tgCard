import type { CSSProperties } from "react";
import type { ShopCategory } from "../shop/shopCategories";

interface ShopCategoryBannerProps {
  category: ShopCategory;
  onSelect: (category: ShopCategory) => void;
}

type ShopCategoryBannerStyle = CSSProperties & {
  "--shop-category-art"?: string;
};

const CATEGORY_ICONS: Record<ShopCategory["id"], string> = {
  "ready-bundles": "/assets/ui/battle-pass-map/chest-ready-v1.webp",
  "magical-cards": "/assets/ui/home/sprites/mode-deck.webp",
  "equipment-chests": "/assets/ui/battle-pass-map/chest-ready-v1.webp",
  "cosmetics": "/assets/ui/home/sprites/row-icon-equipment.webp",
  "boosts": "/assets/ui/shop/boosts/boost-veteran-1h.png",
};

export function ShopCategoryBanner({ category, onSelect }: ShopCategoryBannerProps) {
  const style: ShopCategoryBannerStyle = {
    "--shop-category-art": category.placeholderArt ? `url("${category.placeholderArt}")` : "none",
  };

  return (
    <button
      aria-label={`${category.title}: ${category.subtitle}`}
      className={`shop-category-banner shop-category-banner--${category.theme}`}
      onClick={() => onSelect(category)}
      style={style}
      type="button"
    >
      <img alt="" aria-hidden="true" className="shop-category-banner__item" src={CATEGORY_ICONS[category.id]} />
      <span className="shop-category-banner__copy">
        <strong>{category.title}</strong>
        <span>{category.subtitle}</span>
      </span>
      <span aria-hidden="true" className="shop-category-banner__arrow">→</span>
    </button>
  );
}
