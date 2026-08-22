import { useState } from "react";
import type { CardElement } from "@cardastika/shared";
import { ElementSymbol } from "./ElementSymbol";

interface CardArtworkProps {
  artKey: string | null;
  element: CardElement;
}

function resolveCardArtworkSource(artKey: string) {
  return `/card-art/${encodeURIComponent(artKey)}.webp`;
}

export function CardArtwork({ artKey, element }: CardArtworkProps) {
  const [failedArtKey, setFailedArtKey] = useState<string | null>(null);
  const artworkSource = artKey && artKey !== failedArtKey ? resolveCardArtworkSource(artKey) : null;

  return (
    <span className="card-artwork" aria-hidden="true">
      {artworkSource ? (
        <img
          alt=""
          className="card-artwork__image"
          onError={() => setFailedArtKey(artKey)}
          src={artworkSource}
        />
      ) : (
        <span className="card-artwork__placeholder">
          <ElementSymbol element={element} />
        </span>
      )}
    </span>
  );
}
