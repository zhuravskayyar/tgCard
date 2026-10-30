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

export const SHOP_OFFERS: readonly Readonly<ShopOfferDefinition>[] = Object.freeze([
  defineOffer("card_uncommon", "silver", 500, "uncommon", [
    { rarity: "rare", initialChanceBasisPoints: 0, incrementBasisPoints: 350 },
    { rarity: "epic", initialChanceBasisPoints: 0, incrementBasisPoints: 25 },
  ]),
  defineOffer("card_epic", "gold", 50, "epic", [
    { rarity: "legendary", initialChanceBasisPoints: 0, incrementBasisPoints: 350 },
    { rarity: "mythic", initialChanceBasisPoints: 0, incrementBasisPoints: 25 },
  ]),
  defineOffer("card_legendary", "gold", 150, "legendary", [
    { rarity: "mythic", initialChanceBasisPoints: 0, incrementBasisPoints: 350 },
  ]),
]);

const offersById = new Map(SHOP_OFFERS.map((offer) => [offer.id, offer]));

export function findShopOffer(offerId: string) {
  return offersById.get(offerId) ?? null;
}
