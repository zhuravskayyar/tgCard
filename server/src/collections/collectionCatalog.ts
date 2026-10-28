import type {
  CardDefinition,
  CardElement,
  CollectionModifier,
  CollectionSource,
} from "@cardastika/shared";

export interface CollectionDefinition {
  bonus: CollectionModifier;
  bonusLabel: string;
  cards: readonly CardDefinition[];
  code: string;
  coverArtKey: string | null;
  displayName: string;
  id: string;
  source: CollectionSource;
}

// The active catalog is intentionally limited to the nine new starter cards.
// New collections can be added here once their card definitions are ready.
export const COLLECTIONS: readonly CollectionDefinition[] = Object.freeze([]);
export const COLLECTION_CARDS: readonly CardDefinition[] = Object.freeze([]);

export function validateCollectionCatalog() {
  const elementCounts: Record<CardElement, number> = {
    fire: 0,
    water: 0,
    air: 0,
    earth: 0,
  };

  return {
    collectionCount: COLLECTIONS.length,
    cardCount: COLLECTION_CARDS.length,
    elementCounts,
  };
}

validateCollectionCatalog();
