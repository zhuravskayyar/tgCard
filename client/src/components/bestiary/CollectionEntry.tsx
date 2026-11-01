import { useState, type CSSProperties } from "react";
import type { PlayerCollectionSummary } from "@cardastika/shared";
import { collectionEmblem, collectionEngraving, ENGRAVING_FALLBACK, engravingFallbackPosition } from "./bestiaryArt";

export function CollectionEngraving({ code }: { code: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <span aria-hidden="true" className="bestiary-engraving">
      <img
        alt=""
        draggable={false}
        onError={() => setMissing(true)}
        src={missing ? ENGRAVING_FALLBACK : collectionEngraving(code)}
        style={missing ? { transform: "scale(2.1)", transformOrigin: engravingFallbackPosition(code) } : undefined}
      />
    </span>
  );
}

export function CollectionEmblem({ code }: { code: string }) {
  return (
    <span aria-hidden="true" className="bestiary-emblem">
      <span className="app-icon app-icon--game" style={{ "--app-icon-source": `url("${collectionEmblem(code)}")` } as CSSProperties} />
    </span>
  );
}

export function CollectionEntry({ collection, onOpen }: { collection: PlayerCollectionSummary; onOpen: () => void }) {
  return (
    <button
      aria-label={`${collection.displayName}, ${collection.discoveredCards} із ${collection.totalCards}${collection.completed ? ", зібрано" : ""}`}
      className={`bestiary-entry${collection.completed ? " bestiary-entry--completed" : ""}`}
      onClick={onOpen}
      type="button"
    >
      <span className="bestiary-entry__plate">
        <CollectionEngraving code={collection.code} />
        <CollectionEmblem code={collection.code} />
        {collection.completed ? <span aria-hidden="true" className="bestiary-seal" /> : null}
      </span>
      <strong className="bestiary-entry__name">{collection.displayName}</strong>
      <span className="bestiary-entry__progress">{collection.discoveredCards}/{collection.totalCards}</span>
    </button>
  );
}
