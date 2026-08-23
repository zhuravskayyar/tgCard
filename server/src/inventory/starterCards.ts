import { getCardPower } from "@cardastika/game-core";
import type { CardDefinition, CardElement } from "@cardastika/shared";

export const STARTER_CARD_COUNT = 9;

// Explicit canonical content configuration; deck balance is enforced in game-core.
export const STARTER_CARD_SEED_CONFIG = Object.freeze({
  cards: Object.freeze([
    { displayName: "Саламандра", element: "fire" },
    { displayName: "Лис", element: "fire" },
    { displayName: "Жук", element: "fire" },
    { displayName: "Вугор", element: "water" },
    { displayName: "Щука", element: "water" },
    { displayName: "Ворон", element: "air" },
    { displayName: "Сокіл", element: "air" },
    { displayName: "Кріт", element: "earth" },
    { displayName: "Вепр", element: "earth" },
  ] as const satisfies readonly { displayName: string; element: CardElement }[]),
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
      artKey: null,
      element: content.element,
      collectionId: null,
    });
  }),
);

export const STARTER_CARD_CODES = Object.freeze(STARTER_CARDS.map(({ code }) => code));
