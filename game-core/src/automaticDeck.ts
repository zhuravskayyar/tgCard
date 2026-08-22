import { CARD_ELEMENTS, type CardElement } from "@cardastika/shared";
import {
  MAX_DECK_CARDS_PER_ELEMENT,
  MIN_DECK_CARDS_PER_ELEMENT,
  type DeckElementCounts,
} from "./deckBalance.js";

export interface OwnedDeckCard {
  cardId: string;
  code: string;
  element: CardElement;
  power: number;
  quantity: number;
}

export type BestValidDeckCard = Omit<OwnedDeckCard, "quantity">;

export type BestValidDeckResult =
  | {
      cards: BestValidDeckCard[];
      elementCounts: DeckElementCounts;
      status: "ready";
      totalPower: number;
    }
  | {
      availableElementCounts: DeckElementCounts;
      status: "insufficient_valid_cards";
    };

interface ExpandedDeckCard extends BestValidDeckCard {
  copyIndex: number;
}

function compareCanonicalIdentity(left: BestValidDeckCard, right: BestValidDeckCard) {
  const codeComparison = left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  if (codeComparison !== 0) return codeComparison;
  return left.cardId < right.cardId ? -1 : left.cardId > right.cardId ? 1 : 0;
}

function compareCardStrength(left: BestValidDeckCard, right: BestValidDeckCard) {
  return right.power - left.power || compareCanonicalIdentity(left, right);
}

function compareTiedDecks(left: readonly BestValidDeckCard[], right: readonly BestValidDeckCard[]) {
  const leftRanked = [...left].sort(compareCardStrength);
  const rightRanked = [...right].sort(compareCardStrength);

  for (let index = 0; index < leftRanked.length; index += 1) {
    const comparison = compareCardStrength(leftRanked[index]!, rightRanked[index]!);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function expandOwnedCards(ownedCards: readonly OwnedDeckCard[]) {
  const cardsByElement: Record<CardElement, ExpandedDeckCard[]> = {
    fire: [],
    water: [],
    air: [],
    earth: [],
  };

  for (const card of ownedCards) {
    if (!Number.isSafeInteger(card.power) || card.power <= 0) {
      throw new RangeError(`Invalid power for card ${card.cardId}`);
    }
    if (!Number.isSafeInteger(card.quantity) || card.quantity <= 0) {
      throw new RangeError(`Invalid quantity for card ${card.cardId}`);
    }

    const usableQuantity = Math.min(card.quantity, MAX_DECK_CARDS_PER_ELEMENT);
    for (let copyIndex = 0; copyIndex < usableQuantity; copyIndex += 1) {
      cardsByElement[card.element].push({
        cardId: card.cardId,
        code: card.code,
        element: card.element,
        power: card.power,
        copyIndex,
      });
    }
  }

  for (const element of CARD_ELEMENTS) {
    cardsByElement[element].sort((left, right) => (
      compareCardStrength(left, right) || left.copyIndex - right.copyIndex
    ));
  }

  return cardsByElement;
}

export function buildBestValidDeck(ownedCards: readonly OwnedDeckCard[]): BestValidDeckResult {
  const cardsByElement = expandOwnedCards(ownedCards);
  const availableElementCounts: DeckElementCounts = {
    fire: cardsByElement.fire.length,
    water: cardsByElement.water.length,
    air: cardsByElement.air.length,
    earth: cardsByElement.earth.length,
  };
  let bestCards: BestValidDeckCard[] | null = null;
  let bestElementCounts: DeckElementCounts | null = null;
  let bestTotalPower = -1;

  for (const majorityElement of CARD_ELEMENTS) {
    const elementCounts: DeckElementCounts = {
      fire: MIN_DECK_CARDS_PER_ELEMENT,
      water: MIN_DECK_CARDS_PER_ELEMENT,
      air: MIN_DECK_CARDS_PER_ELEMENT,
      earth: MIN_DECK_CARDS_PER_ELEMENT,
    };
    elementCounts[majorityElement] = MAX_DECK_CARDS_PER_ELEMENT;

    if (CARD_ELEMENTS.some((element) => cardsByElement[element].length < elementCounts[element])) {
      continue;
    }

    const cards = CARD_ELEMENTS.flatMap((element) => (
      cardsByElement[element].slice(0, elementCounts[element])
    ));
    const totalPower = cards.reduce((total, card) => total + card.power, 0);

    if (
      totalPower > bestTotalPower ||
      (totalPower === bestTotalPower && bestCards && compareTiedDecks(cards, bestCards) < 0)
    ) {
      bestCards = cards;
      bestElementCounts = elementCounts;
      bestTotalPower = totalPower;
    }
  }

  if (!bestCards || !bestElementCounts) {
    return { status: "insufficient_valid_cards", availableElementCounts };
  }

  return {
    status: "ready",
    cards: bestCards
      .map(({ cardId, code, element, power }) => ({ cardId, code, element, power }))
      .sort(compareCanonicalIdentity),
    elementCounts: bestElementCounts,
    totalPower: bestTotalPower,
  };
}
