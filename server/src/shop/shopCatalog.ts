import type { CardRarity, ShopCurrency } from "@cardastika/shared";

export interface ShopUpgradeDefinition {
  initialChanceBasisPoints: number;
  incrementBasisPoints: number;
  rarity: CardRarity;
}

export interface ShopOfferDefinition {
  currency: ShopCurrency;
  guaranteedRarity: CardRarity;
  id: string;
  price: number;
  upgrades: readonly Readonly<ShopUpgradeDefinition>[];
}

function defineOffer(
  id: string,
  currency: ShopCurrency,
  price: number,
  guaranteedRarity: CardRarity,
  upgrades: readonly ShopUpgradeDefinition[],
): Readonly<ShopOfferDefinition> {
  return Object.freeze({
    id,
    currency,
    price,
    guaranteedRarity,
    upgrades: Object.freeze(upgrades.map((upgrade) => Object.freeze({ ...upgrade }))),
  });
}

// Card offers return when shop-eligible cards are added to the new catalog.
export const SHOP_OFFERS: readonly Readonly<ShopOfferDefinition>[] = Object.freeze([]);

const offersById = new Map(SHOP_OFFERS.map((offer) => [offer.id, offer]));

export function findShopOffer(offerId: string) {
  return offersById.get(offerId) ?? null;
}
