import type { CardDefinition } from "@cardastika/shared";

export const LIMITED_CARD_EVENT_ID = "limited_rabbit_carter";
export const LIMITED_CARD_PROMO_CODE = "currant_carter";

export const LIMITED_CARD: CardDefinition = Object.freeze({
  id: "limited_rabbit_carter",
  code: "rabbit_carter",
  displayName: "Кролик Картер",
  description: "Кажуть, Картер завжди витягує кролика з капелюха. Проблема лише в тому, що цього разу кролик витягнув Картера — і тепер дуже ввічливо просить твоє серце.",
  artKey: "rabbit_carter",
  element: "fire",
  collectionId: null,
  minRarity: "legendary",
  shopEligible: false,
  limited: true,
});

export const NECRAT_CARD_EVENT_ID = "limited_necrat";
export const NECRAT_CARD_PROMO_CODE = "necrat";

export const NECRAT_CARD: CardDefinition = Object.freeze({
  id: "limited_necrat",
  code: "necrat",
  displayName: "Некрат",
  description: "Злий слайм, що оселився серед покинутої зброї та навчився керувати клинками. Кажуть, кожен меч навколо нього належав воїну, який недооцінив маленького монстра.",
  artKey: "necrat",
  element: "water",
  collectionId: null,
  minRarity: "legendary",
  shopEligible: false,
  limited: true,
});

export const LIMITED_CARD_CAMPAIGNS = Object.freeze([
  Object.freeze({ eventId: LIMITED_CARD_EVENT_ID, promoCode: LIMITED_CARD_PROMO_CODE, card: LIMITED_CARD }),
  Object.freeze({ eventId: NECRAT_CARD_EVENT_ID, promoCode: NECRAT_CARD_PROMO_CODE, card: NECRAT_CARD }),
]);
