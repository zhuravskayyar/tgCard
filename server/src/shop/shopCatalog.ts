import type { CardRarity, ShopCatalogResponse, ShopCurrency, ShopOffer } from "@cardastika/shared";

export interface RarityWeight {
  rarity: CardRarity;
  weight: number;
}

export interface ShopOfferDefinition extends Omit<ShopOffer, "allowedRarities"> {
  allowedRarities: readonly CardRarity[];
  rarityWeights: readonly RarityWeight[] | null;
}

function defineOffer(
  id: string,
  currency: ShopCurrency,
  price: number,
  minimumRarity: CardRarity,
  allowedRarities: readonly CardRarity[],
): Readonly<ShopOfferDefinition> {
  return Object.freeze({
    id,
    currency,
    price,
    minimumRarity,
    allowedRarities: Object.freeze([...allowedRarities]),
    // Exact production rarity weights are intentionally absent until product approval.
    rarityWeights: null,
  });
}

export const SHOP_OFFERS: readonly Readonly<ShopOfferDefinition>[] = Object.freeze([
  defineOffer("silver_card", "silver", 500, "uncommon", ["uncommon", "rare", "epic"]),
  defineOffer("epic_card", "gold", 50, "epic", ["epic", "legendary", "mythic"]),
  defineOffer("legendary_card", "gold", 150, "legendary", ["legendary", "mythic"]),
]);

const offersById = new Map(SHOP_OFFERS.map((offer) => [offer.id, offer]));

export function findShopOffer(offerId: string) {
  return offersById.get(offerId) ?? null;
}

export function getPlayerFacingShopCatalog(): ShopCatalogResponse {
  return {
    offers: SHOP_OFFERS.map(({ id, currency, price, minimumRarity, allowedRarities }) => ({
      id,
      currency,
      price,
      minimumRarity,
      allowedRarities: [...allowedRarities],
    })),
  };
}
