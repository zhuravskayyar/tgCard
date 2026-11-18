import type { CardDefinition, CardElement, CollectionBonusStatus, CollectionModifier, CollectionSource } from "@cardastika/shared";
import { CATALOG_DATA } from "./catalogData.generated.js";

export interface CollectionDefinition {
  bonus: CollectionModifier;
  bonusStatus: CollectionBonusStatus;
  bonusLabel: string;
  cards: readonly CardDefinition[];
  code: string;
  coverArtKey: string | null;
  description: string;
  displayName: string;
  displayPrefix: string;
  id: string;
  source: CollectionSource;
}

const collectionIdOf = (code: string) => `collection_${code}`;

// A shared card keeps its first collection in cards.collection_id; full membership lives in collection_cards.
const primaryCollection = new Map<string, string>();
for (const { cardIds, code } of CATALOG_DATA.collections) {
  for (const cardId of cardIds) if (!primaryCollection.has(cardId)) primaryCollection.set(cardId, collectionIdOf(code));
}

export const COLLECTION_CARDS: readonly CardDefinition[] = Object.freeze(CATALOG_DATA.cards.map((card) => Object.freeze({
  id: card.id,
  code: card.id,
  displayName: card.displayName,
  description: card.description,
  artKey: null,
  element: card.element,
  collectionId: primaryCollection.get(card.id) ?? null,
  minRarity: card.minRarity,
  shopEligible: card.shopEligible,
  source: "standard" as const,
})));

const cardsById = new Map(COLLECTION_CARDS.map((card) => [card.id, card]));

export const COLLECTIONS: readonly CollectionDefinition[] = Object.freeze(CATALOG_DATA.collections.map((collection) => Object.freeze({
  id: collectionIdOf(collection.code),
  code: collection.code,
  displayName: collection.displayName,
  source: "standard" as const,
  coverArtKey: null,
  description: collection.description,
  bonus: Object.freeze(collection.bonus),
  bonusStatus: collection.bonusStatus,
  bonusLabel: collection.bonusLabel,
  displayPrefix: collection.displayPrefix,
  cards: Object.freeze(collection.cardIds.map((cardId) => {
    const card = cardsById.get(cardId);
    if (!card) throw new Error(`Collection ${collection.code} references unknown card ${cardId}`);
    return card;
  })),
})));

const collectionBonusStatusByCode = new Map(COLLECTIONS.map(({ bonusStatus, code }) => [code, bonusStatus]));
const collectionPresentationByCode = new Map(COLLECTIONS.map(({ code, description, displayPrefix }) => [code, { description, displayPrefix }]));

/** Collections added outside the canonical catalog stay inactive until their mechanic is declared live. */
export function getCollectionBonusStatus(code: string): CollectionBonusStatus {
  return collectionBonusStatusByCode.get(code) ?? "pending";
}

export function getCollectionPresentation(code: string, source?: CollectionSource) {
  const presentation = collectionPresentationByCode.get(code);
  if (presentation) return presentation;
  return source === "raid"
    ? { displayPrefix: "Рейдова колекція", description: "Колекцію можна зібрати лише в рейдах." }
    : { displayPrefix: "Колекція", description: "Тематична добірка карт із різних джерел." };
}

export function validateCollectionCatalog() {
  const elementCounts: Record<CardElement, number> = { fire: 0, water: 0, air: 0, earth: 0 };
  for (const card of COLLECTION_CARDS) elementCounts[card.element] += 1;
  return { collectionCount: COLLECTIONS.length, cardCount: COLLECTION_CARDS.length, elementCounts };
}

validateCollectionCatalog();
