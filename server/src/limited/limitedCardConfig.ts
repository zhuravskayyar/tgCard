import type { CardDefinition } from "@cardastika/shared";

// Limited cards are paused while the active catalog contains only the new
// starter set. Add new events here after their cards enter the catalog.
export const LIMITED_CARD_EVENT_ID = "limited_rabbit_carter";
export const LIMITED_CARD_PROMO_CODE = "currant_carter";
export const NECRAT_CARD_EVENT_ID = "limited_necrat";
export const NECRAT_CARD_PROMO_CODE = "necrat";

interface LimitedCardCampaign {
  card: CardDefinition;
  eventId: string;
  promoCode: string;
}

export const LIMITED_CARD_CAMPAIGNS: readonly LimitedCardCampaign[] = Object.freeze([]);
