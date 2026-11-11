import { createContext, type ReactNode } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { useCardArtworkSource } from "./cardArtSource";
import { getSignatureFxByCardId } from "../cards/signatureFx";
import "../styles/card-signature-aura.css";

interface CardArtworkSourceValue {
  loading: boolean;
  onSourceError: () => void;
  source: string | null;
}

export const CardArtworkSourceContext = createContext<CardArtworkSourceValue>({
  loading: false,
  onSourceError: () => undefined,
  source: null,
});

export interface CardFxArtworkLayers {
  background?: string | null;
  character?: string | null;
  foreground?: string | null;
}

export interface CardFxProfile {
  depth: number;
  edgeFoil: number;
  foil: number;
  glare: number;
  idle: number;
}

export const CARD_FX_PROFILES: Record<CardRarity, CardFxProfile> = {
  common: { depth: 0, foil: 0, glare: 0, edgeFoil: 0, idle: 0 },
  uncommon: { depth: 0, foil: 0, glare: 0, edgeFoil: 0, idle: 0 },
  rare: { depth: 0, foil: 0, glare: 0, edgeFoil: 0, idle: 0 },
  epic: { depth: 0, foil: 0, glare: 0, edgeFoil: 0, idle: 0 },
  legendary: { depth: 0, foil: 0, glare: 0, edgeFoil: 0, idle: 0 },
  mythic: { depth: 0, foil: 0, glare: 0, edgeFoil: 0, idle: 0 },
};

export function getCardFxProfile(rarity: CardRarity): CardFxProfile {
  return CARD_FX_PROFILES[rarity];
}

export interface CardFxWrapperProps {
  artKey: string | null;
  cardId?: string | null;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  depthAssets?: CardFxArtworkLayers;
  element: CardElement;
  interactive?: boolean;
  rarity: CardRarity;
}

export function CardFxWrapper({ artKey, cardId, children, className, compact = false, element, interactive = false, rarity }: CardFxWrapperProps) {
  const artworkSource = useCardArtworkSource(artKey, cardId);
  const signature = getSignatureFxByCardId(cardId);
  const rootClassName = [
    "card-fx",
    "card-fx--material",
    "card-fx--single",
    `deck-card--${element}`,
    `deck-card--${rarity}`,
    interactive ? "card-fx--interactive" : "card-fx--static",
    compact ? "card-fx--compact" : "",
    signature ? `card-fx--signature card-fx--signature-${signature}` : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <CardArtworkSourceContext.Provider value={artworkSource}>
      <span className={rootClassName}>
        {signature ? <span aria-hidden="true" className="card-signature-aura"><span className="card-signature-aura__flames" /></span> : null}
        {children}
      </span>
    </CardArtworkSourceContext.Provider>
  );
}
