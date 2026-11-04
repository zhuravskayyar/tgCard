import type { CardRarity, ShopPoolGroup } from "@cardastika/shared";
import { CATALOG_DATA } from "../collections/catalogData.generated.js";

const cardsById = new Map(CATALOG_DATA.cards.map((card) => [card.id, card]));

export function getShopOfferPool(offerId: string, rarity: CardRarity) {
  return CATALOG_DATA.shopPools[offerId]?.[rarity] ?? null;
}

/** The banner's "Детальніше" list, highest rarity first. */
export function getShopOfferPoolGroups(offerId: string): ShopPoolGroup[] {
  return Object.entries(CATALOG_DATA.shopPools[offerId] ?? {}).map(([rarity, ids]) => ({
    rarity: rarity as CardRarity,
    cards: (ids ?? []).map((id) => {
      const card = cardsById.get(id);
      if (!card) throw new Error(`Shop pool references unknown card ${id}`);
      return { id: card.id, displayName: card.displayName, element: card.element };
    }),
  }));
}
