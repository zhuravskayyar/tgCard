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
  finalPower: number;
  instanceId: string;
}

export type BestValidDeckCard = OwnedDeckCard;

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

function compareStableIdentity(left: BestValidDeckCard, right: BestValidDeckCard) {
  const codeComparison = left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  if (codeComparison !== 0) return codeComparison;
  const cardComparison = left.cardId < right.cardId ? -1 : left.cardId > right.cardId ? 1 : 0;
  if (cardComparison !== 0) return cardComparison;
  return left.instanceId < right.instanceId ? -1 : left.instanceId > right.instanceId ? 1 : 0;
}

export function compareInstanceStrength(left: BestValidDeckCard, right: BestValidDeckCard) {
  return right.finalPower - left.finalPower || compareStableIdentity(left, right);
}

function compareTiedDecks(left: readonly BestValidDeckCard[], right: readonly BestValidDeckCard[]) {
  const leftRanked = [...left].sort(compareInstanceStrength);
  const rightRanked = [...right].sort(compareInstanceStrength);

  for (let index = 0; index < leftRanked.length; index += 1) {
    const comparison = compareInstanceStrength(leftRanked[index]!, rightRanked[index]!);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function groupOwnedInstances(ownedCards: readonly OwnedDeckCard[]) {
  const cardsByElement: Record<CardElement, BestValidDeckCard[]> = {
    fire: [], water: [], air: [], earth: [],
  };
  const seenInstanceIds = new Set<string>();
  const strongestInstanceByCardId = new Map<string, BestValidDeckCard>();

  for (const card of ownedCards) {
    if (!Number.isSafeInteger(card.finalPower) || card.finalPower <= 0) {
      throw new RangeError(`Invalid final power for card instance ${card.instanceId}`);
    }
    if (!card.instanceId || seenInstanceIds.has(card.instanceId)) {
      throw new RangeError(`Duplicate or missing card instance ID: ${card.instanceId}`);
    }
    seenInstanceIds.add(card.instanceId);

    const currentStrongest = strongestInstanceByCardId.get(card.cardId);
    if (!currentStrongest || compareInstanceStrength(card, currentStrongest) < 0) {
      strongestInstanceByCardId.set(card.cardId, { ...card });
    }
  }

  for (const card of strongestInstanceByCardId.values()) cardsByElement[card.element].push(card);
  for (const element of CARD_ELEMENTS) cardsByElement[element].sort(compareInstanceStrength);
  return cardsByElement;
}

export function buildBestValidDeck(ownedCards: readonly OwnedDeckCard[]): BestValidDeckResult {
  const cardsByElement = groupOwnedInstances(ownedCards);
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
    const totalPower = cards.reduce((total, card) => total + card.finalPower, 0);

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
    cards: [...bestCards].sort(compareStableIdentity),
    elementCounts: bestElementCounts,
    totalPower: bestTotalPower,
  };
}
