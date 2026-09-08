import { memo } from "react";
import type { CardElement } from "@cardastika/shared";
import { getCardHoloConfig } from "@cardastika/shared";
import { ElementSymbol } from "./ElementSymbol";
import { HoloCardArt } from "./HoloCardArt";
import { preloadCardArtwork as preloadArtwork, useCardArtworkSource } from "./cardArtSource";

interface CardArtworkProps {
  artKey: string | null;
  cardId?: string | null;
  disableHolo?: boolean;
  element: CardElement;
}

export function preloadCardArtwork(artKey: string | null, cardId?: string | null) {
  preloadArtwork(artKey, cardId);
}

function StandardCardArtwork({ artKey, cardId, element }: CardArtworkProps) {
  const { onSourceError, source } = useCardArtworkSource(artKey, cardId);

  return (
    <span className="card-artwork" aria-hidden="true">
      {source ? (
        <img
          alt=""
          className="card-artwork__image"
          decoding="async"
          onError={onSourceError}
          src={source}
        />
      ) : (
        <span className="card-artwork__placeholder">
          <ElementSymbol element={element} />
        </span>
      )}
    </span>
  );
}

export const CardArtwork = memo(function CardArtwork({ artKey, cardId, disableHolo = false, element }: CardArtworkProps) {
  const holo = disableHolo ? undefined : getCardHoloConfig(cardId);
  if (holo?.enabled) return <HoloCardArt artKey={artKey} cardId={cardId} config={holo} element={element} />;
  return <StandardCardArtwork artKey={artKey} cardId={cardId} element={element} />;
});
