import { useCardArtworkSource } from "../cardArtSource";

/** An undiscovered card: its art as a black silhouette on the empty slot, or "?" while the card has no art yet. */
export function CardSilhouette({ artKey, cardId }: { artKey: string | null; cardId: string }) {
  const { onSourceError, source } = useCardArtworkSource(artKey, cardId);
  return (
    <span aria-hidden="true" className="bestiary-card__unknown">
      {source ? <img alt="" className="bestiary-card__silhouette" onError={onSourceError} src={source} /> : <i>?</i>}
    </span>
  );
}
