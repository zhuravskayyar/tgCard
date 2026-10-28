import { getCardPower } from "@cardastika/game-core";
import type { CardDefinition, CardElement } from "@cardastika/shared";

export const STARTER_CARD_COUNT = 9;

type StarterCardType = "creature" | "artifact" | "phenomenon";

// Explicit canonical content configuration; deck balance is enforced in game-core.
export const STARTER_CARD_SEED_CONFIG = Object.freeze({
  cards: Object.freeze([
    { displayName: "Борсук", description: "Істота стихії Земля.", element: "earth", type: "creature" },
    { displayName: "Рогач", description: "Істота стихії Земля.", element: "earth", type: "creature" },
    { displayName: "Корона коренів", description: "Артефакт стихії Земля.", element: "earth", type: "artifact" },
    { displayName: "Вогняний кабан", description: "Істота стихії Вогонь.", element: "fire", type: "creature" },
    { displayName: "Вугільна ропуха", description: "Істота стихії Вогонь.", element: "fire", type: "creature" },
    { displayName: "Морський коник", description: "Істота стихії Вода.", element: "water", type: "creature" },
    { displayName: "Чаша хвиль", description: "Артефакт стихії Вода.", element: "water", type: "artifact" },
    { displayName: "Ластівка", description: "Істота стихії Повітря.", element: "air", type: "creature" },
    { displayName: "Вихор", description: "Явище стихії Повітря.", element: "air", type: "phenomenon" },
  ] as const satisfies readonly { description: string; displayName: string; element: CardElement; type: StarterCardType }[]),
});

export const STARTER_INSTANCE_DEFAULTS = Object.freeze({
  level: 1,
  bonusPower: 2,
  finalPower: getCardPower({ level: 1, bonusPower: 2 }),
});

export const STARTER_CARDS: readonly CardDefinition[] = Object.freeze(
  Array.from({ length: STARTER_CARD_COUNT }, (_, index) => {
    const sequence = String(index + 1).padStart(2, "0");
    const id = `starter_v5_${sequence}`;
    const content = STARTER_CARD_SEED_CONFIG.cards[index];

    if (!content) {
      throw new Error(`Missing content configuration for ${id}`);
    }

    return Object.freeze({
      id,
      code: id,
      displayName: content.displayName,
      description: content.description,
      artKey: `new-cards/starter_v2_${sequence}`,
      element: content.element,
      collectionId: null,
      minRarity: "common",
      shopEligible: false,
    });
  }),
);

export const STARTER_CARD_CODES = Object.freeze(STARTER_CARDS.map(({ code }) => code));
