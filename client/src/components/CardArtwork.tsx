import { memo } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { CardPlateFrame } from "./CardPlateFrame";
import { useCardArtworkSource } from "./cardArtSource";

interface CardArtworkProps {
  artKey: string | null;
  artOnly?: boolean;
  cardId?: string | null;
  disableHolo?: boolean;
  element: CardElement;
  rarity?: CardRarity;
  power?: number;
  /** Art and element only, without the power tray. */
  hidePower?: boolean;
}

export const CardArtwork = memo(function CardArtwork({ artKey, artOnly = false, cardId, element, hidePower = false, power, rarity = "common" }: CardArtworkProps) {
  const { loading, onSourceError, source } = useCardArtworkSource(artKey, cardId);

  return (
    <span className={`card-artwork card-artwork--${rarity}${artOnly ? " card-artwork--art-only" : ""}`} aria-hidden="true">
      {artOnly ? source ? <img alt="" className="card-artwork__image" decoding="async" loading="lazy" onError={onSourceError} src={source} /> : null
        : <CardPlateFrame artworkLoading={loading} artworkSource={source} element={element} hidePower={hidePower} onArtworkError={onSourceError} power={power} rarity={rarity} />}
    </span>
  );
});
