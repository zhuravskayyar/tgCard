import { getCardPower } from "@cardastika/game-core";
import type { CardDefinition } from "@cardastika/shared";
import { COLLECTION_CARDS } from "../collections/collectionCatalog.js";

export const STARTER_DECK_SIZE = 9;

interface StarterCardGrant {
  bonusPower: number;
  code: string;
  level: number;
}

// Mirrors the reference start: nine deck cards of the shared catalog plus two weak ones.
export const STARTER_CARD_GRANTS: readonly StarterCardGrant[] = Object.freeze([
  { code: "wind_fairy", level: 5, bonusPower: 14 },
  { code: "black_raven", level: 1, bonusPower: 2 },
  { code: "salamander", level: 1, bonusPower: 2 },
  { code: "impetuous_lizard", level: 1, bonusPower: 2 },
  { code: "carefree_hobbit", level: 1, bonusPower: 2 },
  { code: "mountain_eagle", level: 1, bonusPower: 2 },
  { code: "fire_ifrit", level: 1, bonusPower: 2 },
  { code: "river_naiad", level: 1, bonusPower: 2 },
  { code: "elvish_scout", level: 1, bonusPower: 2 },
  { code: "crabman", level: 1, bonusPower: 0 },
  { code: "giant_dragonfly", level: 1, bonusPower: 0 },
].map((grant) => Object.freeze(grant)));

export const STARTER_CARD_COUNT = STARTER_CARD_GRANTS.length;

const catalogByCode = new Map(COLLECTION_CARDS.map((card) => [card.code, card]));

export const STARTER_CARDS: readonly CardDefinition[] = Object.freeze(STARTER_CARD_GRANTS.map(({ code }) => {
  const card = catalogByCode.get(code);
  if (!card) throw new Error(`Starter card ${code} is missing from the catalog`);
  return card;
}));

export const STARTER_CARD_CODES = Object.freeze(STARTER_CARD_GRANTS.map(({ code }) => code));
export const STARTER_DECK_CODES = Object.freeze(STARTER_CARD_CODES.slice(0, STARTER_DECK_SIZE));

export function getStarterGrantPower({ bonusPower, level }: StarterCardGrant) {
  return getCardPower({ level, bonusPower });
}
