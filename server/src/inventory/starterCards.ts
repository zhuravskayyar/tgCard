import { getCardPower } from "@cardastika/game-core";
import type { CardDefinition, CardElement } from "@cardastika/shared";
import { getCardDescription } from "../cards/cardDescriptions.js";

export const STARTER_CARD_COUNT = 9;

// Explicit canonical content configuration; deck balance is enforced in game-core.
export const STARTER_CARD_SEED_CONFIG = Object.freeze({
  cards: Object.freeze([
    { displayName: "Саламандра", description: getCardDescription("starter_01"), element: "fire" },
    { displayName: "Лис", description: getCardDescription("starter_02"), element: "fire" },
    { displayName: "Жук-бомбардир", description: getCardDescription("starter_03"), element: "fire" },
    { displayName: "Вугор", description: getCardDescription("starter_04"), element: "water" },
    { displayName: "Щука", description: getCardDescription("starter_05"), element: "water" },
    { displayName: "Ворон", description: getCardDescription("starter_06"), element: "air" },
    { displayName: "Сокіл", description: getCardDescription("starter_07"), element: "air" },
    { displayName: "Кріт", description: getCardDescription("starter_08"), element: "earth" },
    { displayName: "Вепр", description: getCardDescription("starter_09"), element: "earth" },
  ] as const satisfies readonly { description: string; displayName: string; element: CardElement }[]),
});

export const STARTER_INSTANCE_DEFAULTS = Object.freeze({
  level: 1,
  bonusPower: 2,
  finalPower: getCardPower({ level: 1, bonusPower: 2 }),
});

export const STARTER_CARDS: readonly CardDefinition[] = Object.freeze(
  Array.from({ length: STARTER_CARD_COUNT }, (_, index) => {
    const sequence = String(index + 1).padStart(2, "0");
    const id = `starter_${sequence}`;
    const content = STARTER_CARD_SEED_CONFIG.cards[index];

    if (!content) {
      throw new Error(`Missing content configuration for ${id}`);
    }

    return Object.freeze({
      id,
      code: id,
      displayName: content.displayName,
      description: content.description,
      artKey: null,
      element: content.element,
      collectionId: null,
      minRarity: "common",
      shopEligible: false,
    });
  }),
);

export const STARTER_CARD_CODES = Object.freeze(STARTER_CARDS.map(({ code }) => code));
