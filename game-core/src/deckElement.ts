import { CARD_ELEMENTS, type CardElement } from "@cardastika/shared";

/** The element with most cards in a deck; ties go to the earlier element in CARD_ELEMENTS. */
export function getDominantDeckElement(cards: readonly { element: CardElement }[]): CardElement | null {
  let best: CardElement | null = null;
  let bestCount = 0;
  for (const element of CARD_ELEMENTS) {
    const count = cards.filter((card) => card.element === element).length;
    if (count > bestCount) {
      best = element;
      bestCount = count;
    }
  }
  return best;
}
