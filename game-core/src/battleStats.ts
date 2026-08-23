export interface PoweredCard {
  finalPower: number;
}

export function getDeckPower(cards: readonly PoweredCard[]) {
  return cards.reduce((total, card) => {
    if (!Number.isSafeInteger(card.finalPower) || card.finalPower <= 0) {
      throw new RangeError("Deck card final power must be a positive integer");
    }
    const nextTotal = total + card.finalPower;
    if (!Number.isSafeInteger(nextTotal)) throw new RangeError("Deck power is not a safe integer");
    return nextTotal;
  }, 0);
}

export function getBaseBattleHp(cards: readonly PoweredCard[]) {
  return getDeckPower(cards);
}
