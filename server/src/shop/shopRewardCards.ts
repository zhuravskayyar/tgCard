import type { CardDefinition, CardRarity } from "@cardastika/shared";

export interface ShopRewardCardDefinition extends CardDefinition {
  targetRarity: CardRarity;
}

// The fallback reward cards belonged to the retired catalog. Keep the shop
// reward pool empty until new shop-eligible cards are added.
export const SHOP_REWARD_CARDS: readonly ShopRewardCardDefinition[] = Object.freeze([]);
