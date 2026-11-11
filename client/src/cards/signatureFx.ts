import type { DuelCardSnapshot } from "@cardastika/shared";

/**
 * Signature strike looks for special collections, on top of the card's element.
 * "twitch": the Twitch Legends cards strike with a violet aura, and a violet pentagram
 * is laid over their element seal.
 */
export type SignatureFx = "twitch";

export interface SignatureFxStyle {
  /** Aura around the flying card and the seal. */
  aura: string;
  /** Lines of the extra pentagram and the tint of the runes. */
  line: string;
}

export const SIGNATURE_FX_STYLES: Readonly<Record<SignatureFx, SignatureFxStyle>> = {
  twitch: { aura: "#9b5cff", line: "#c9a6ff" },
};

// Presentation only: which card codes carry a signature look. Twitch Legends collection.
const SIGNATURE_BY_CARD_CODE: Readonly<Record<string, SignatureFx>> = {
  kostakod: "twitch",
};

export function getSignatureFx(card: Pick<DuelCardSnapshot, "code">): SignatureFx | null {
  return getSignatureFxByCardId(card.code);
}

/** Catalog card ids equal their codes, so inventory, shop and deck cards resolve the same way. */
export function getSignatureFxByCardId(cardId: string | null | undefined): SignatureFx | null {
  return cardId ? SIGNATURE_BY_CARD_CODE[cardId] ?? null : null;
}
