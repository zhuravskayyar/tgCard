import { memo } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { CardPlateFrame } from "./CardPlateFrame";
import { useCardArtworkSource } from "./cardArtSource";

interface CardArtworkProps {
  artKey: string | null;
  cardId?: string | null;
  disableHolo?: boolean;
  element: CardElement;
  rarity?: CardRarity;
  power?: number;
}

export const CardArtwork = memo(function CardArtwork({ artKey, cardId, element, power, rarity = "common" }: CardArtworkProps) {
  const { onSourceError, source } = useCardArtworkSource(artKey, cardId);

  return (
    <span className={`card-artwork card-artwork--${rarity}`} aria-hidden="true">
      <CardPlateFrame artworkSource={source} element={element} onArtworkError={onSourceError} power={power} rarity={rarity} />
    </span>
  );
});
