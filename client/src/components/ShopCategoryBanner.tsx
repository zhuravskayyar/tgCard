import type { CSSProperties } from "react";
import type { ShopCategory } from "../shop/shopCategories";

interface ShopCategoryBannerProps {
  category: ShopCategory;
  onSelect: (category: ShopCategory) => void;
}

type ShopCategoryBannerStyle = CSSProperties & {
  "--shop-category-art"?: string;
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
      <span className="shop-category-banner__copy">
        <strong>{category.title}</strong>
        <span>{category.subtitle}</span>
      </span>
      <span aria-hidden="true" className="shop-category-banner__arrow">→</span>
    </button>
  );
}
