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
