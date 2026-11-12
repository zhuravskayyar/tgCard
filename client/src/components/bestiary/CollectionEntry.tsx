import type { CSSProperties } from "react";
import type { PlayerCollectionSummary } from "@cardastika/shared";
import { useCardArtworkSource } from "../cardArtSource";
import { collectionEmblem } from "./bestiaryArt";

export function CollectionEmblem({ code }: { code: string }) {
  return (
    <span aria-hidden="true" className="bestiary-emblem">
      <span className="app-icon app-icon--game" style={{ "--app-icon-source": `url("${collectionEmblem(code)}")` } as CSSProperties} />
    </span>
  );
}

export function CollectionEntry({ collection, onOpen }: { collection: PlayerCollectionSummary; onOpen: () => void }) {
  const artwork = useCardArtworkSource(collection.coverArtKey, null);

  return (
    <button
      aria-label={`${collection.displayName}, ${collection.discoveredCards} із ${collection.totalCards}${collection.completed ? ", зібрано" : ""}`}
      className={`bestiary-entry${collection.completed ? " bestiary-entry--completed" : ""}`}
      onClick={onOpen}
      type="button"
    >
      <span className="bestiary-entry__plate">
        {artwork.source
          ? <img alt="" className="bestiary-entry__art" draggable={false} onError={artwork.onSourceError} src={artwork.source} />
          : <span className="bestiary-entry__fallback"><CollectionEmblem code={collection.code} /></span>}
        {collection.completed ? <span aria-hidden="true" className="bestiary-seal" /> : null}
      </span>
      <span className="bestiary-entry__caption">
        <strong className="bestiary-entry__name">{collection.displayName}</strong>
        <span className="bestiary-entry__progress">{collection.discoveredCards} / {collection.totalCards}</span>
      </span>
    </button>
  );
}
