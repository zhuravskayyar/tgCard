import type { CardRarity } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";

interface CardQualityBadgeProps {
  rarity: CardRarity;
  size?: "tiny" | "small" | "medium";
}

export function CardQualityBadge({ rarity, size = "small" }: CardQualityBadgeProps) {
  const iconSize = size === "medium" ? 23 : size === "tiny" ? 15 : 18;
  return (
    <span aria-hidden="true" className={`card-quality-badge card-quality-badge--${rarity} card-quality-badge--${size}`}>
      <AppIcon name="deck-power" size={iconSize} />
    </span>
  );
}
