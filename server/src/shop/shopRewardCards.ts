import type { CardDefinition, CardRarity } from "@cardastika/shared";

export interface ShopRewardCardDefinition extends CardDefinition {
  targetRarity: CardRarity;
}

// Canonical fallback reward pool for the permanent card shop. Artwork can be
// attached later without changing card identity, rarity, or economy behavior.
export const SHOP_REWARD_CARDS: readonly ShopRewardCardDefinition[] = Object.freeze([
  Object.freeze({
    id: "shop_uncommon_01",
    code: "shop_uncommon_01",
    displayName: "Іскровий гекон",
    description: "Службова картка магазину для старого резервного пулу нагород.",
    artKey: null,
    element: "fire",
    targetRarity: "uncommon",
    collectionId: null,
    minRarity: "uncommon",
    shopEligible: false,
  }),
  Object.freeze({
    id: "shop_rare_01",
    code: "shop_rare_01",
    displayName: "Припливний скат",
    description: "Службова картка магазину для старого резервного пулу нагород.",
    artKey: null,
    element: "water",
    targetRarity: "rare",
    collectionId: null,
    minRarity: "rare",
    shopEligible: false,
  }),
  Object.freeze({
    id: "shop_epic_01",
    code: "shop_epic_01",
    displayName: "Грозовий грифон",
    description: "Службова картка магазину для старого резервного пулу нагород.",
    artKey: null,
    element: "air",
    targetRarity: "epic",
    collectionId: null,
    minRarity: "epic",
    shopEligible: false,
  }),
  Object.freeze({
    id: "shop_legendary_01",
    code: "shop_legendary_01",
    displayName: "Серце гір",
    description: "Службова картка магазину для старого резервного пулу нагород.",
    artKey: null,
    element: "earth",
    targetRarity: "legendary",
    collectionId: null,
    minRarity: "legendary",
    shopEligible: false,
  }),
  Object.freeze({
    id: "shop_mythic_01",
    code: "shop_mythic_01",
    displayName: "Первісний левіафан",
    description: "Службова картка магазину для старого резервного пулу нагород.",
    artKey: null,
    element: "water",
    targetRarity: "mythic",
    collectionId: null,
    minRarity: "mythic",
    shopEligible: false,
  }),
]);
