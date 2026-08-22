import type { CardDefinition, CardElement, CardRarity } from "@cardastika/shared";

export const STARTER_CARD_COUNT = 9;

// Explicit provisional content configuration; no balance rule is derived here.
export const STARTER_CARD_SEED_CONFIG = Object.freeze({
  elements: [
    "fire",
    "water",
    "air",
    "earth",
    "fire",
    "water",
    "air",
    "earth",
    "fire",
  ] as const satisfies readonly CardElement[],
  rarity: "common" as const satisfies CardRarity,
});

export const STARTER_CARDS: readonly CardDefinition[] = Object.freeze(
  Array.from({ length: STARTER_CARD_COUNT }, (_, index) => {
    const sequence = String(index + 1).padStart(2, "0");
    const id = `starter_${sequence}`;
    const element = STARTER_CARD_SEED_CONFIG.elements[index];

    if (!element) {
      throw new Error(`Missing element configuration for ${id}`);
    }

    return Object.freeze({
      id,
      code: id,
      element,
      rarity: STARTER_CARD_SEED_CONFIG.rarity,
      power: 12,
      collectionId: null,
    });
  }),
);

export const STARTER_CARD_CODES = Object.freeze(STARTER_CARDS.map(({ code }) => code));
