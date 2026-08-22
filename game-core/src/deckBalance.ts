import { CARD_ELEMENTS, DECK_SIZE, type CardElement } from "@cardastika/shared";

export const MIN_DECK_CARDS_PER_ELEMENT = 2;
export const MAX_DECK_CARDS_PER_ELEMENT = 3;

export interface DeckElementCard {
  element: CardElement;
}

export interface SlottedDeckElementCard extends DeckElementCard {
  slot: number;
}

export type DeckElementCounts = Record<CardElement, number>;

export type DeckElementBalanceReason =
  | "invalid_deck_size"
  | "element_below_minimum"
  | "element_above_maximum"
  | "slot_not_found";

export interface DeckElementBalanceResult {
  counts: DeckElementCounts;
  reason?: DeckElementBalanceReason;
  valid: boolean;
}

export function countDeckElements(cards: readonly DeckElementCard[]): DeckElementCounts {
  const counts: DeckElementCounts = { fire: 0, water: 0, air: 0, earth: 0 };

  for (const card of cards) {
    counts[card.element] += 1;
  }

  return counts;
}

export function validateDeckElementBalance(
  cards: readonly DeckElementCard[],
): DeckElementBalanceResult {
  const counts = countDeckElements(cards);

  if (cards.length !== DECK_SIZE) {
    return { valid: false, counts, reason: "invalid_deck_size" };
  }

  if (CARD_ELEMENTS.some((element) => counts[element] < MIN_DECK_CARDS_PER_ELEMENT)) {
    return { valid: false, counts, reason: "element_below_minimum" };
  }

  if (CARD_ELEMENTS.some((element) => counts[element] > MAX_DECK_CARDS_PER_ELEMENT)) {
    return { valid: false, counts, reason: "element_above_maximum" };
  }

  return { valid: true, counts };
}

export function canReplaceDeckCard(
  currentDeck: readonly SlottedDeckElementCard[],
  slot: number,
  candidateCard: DeckElementCard,
): DeckElementBalanceResult {
  if (!currentDeck.some((card) => card.slot === slot)) {
    return {
      valid: false,
      counts: countDeckElements(currentDeck),
      reason: "slot_not_found",
    };
  }

  return validateDeckElementBalance(
    currentDeck.map((card) => card.slot === slot ? { ...card, element: candidateCard.element } : card),
  );
}
