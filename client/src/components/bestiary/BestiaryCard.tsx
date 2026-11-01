import { useEffect, useRef, useState } from "react";
import type { PlayerCollectionCard } from "@cardastika/shared";
import { CardArtwork } from "../CardArtwork";

// Shader plates mount as they approach the viewport and only once the page has stopped turning.
function useMountWhenNear(enabled: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || near || !element) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: "160px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, near]);
  return { near, ref };
}

function LockedCard() {
  return (
    <article aria-label="Невідома карта" className="bestiary-card bestiary-card--locked">
      <span aria-hidden="true" className="bestiary-card__plate">
        <span className="bestiary-card__unknown"><i>?</i></span>
      </span>
      <span className="bestiary-card__name">Невідома карта</span>
    </article>
  );
}

function OwnedCard({ card, onOpen, settled }: { card: PlayerCollectionCard; onOpen?: () => void; settled: boolean }) {
  const { near, ref } = useMountWhenNear(settled);
  return (
    <button aria-label={`${card.displayName}, отримано`} className="bestiary-card" disabled={!onOpen} onClick={onOpen} ref={ref} type="button">
      <span aria-hidden="true" className="bestiary-card__plate">
        {near ? <CardArtwork artKey={card.artKey} cardId={card.id} element={card.element} rarity={card.minRarity} /> : null}
      </span>
      <span className="bestiary-card__name">{card.displayName}</span>
    </button>
  );
}

export function BestiaryCard({ card, onOpen, settled }: { card: PlayerCollectionCard; onOpen?: () => void; settled: boolean }) {
  return card.discovered ? <OwnedCard card={card} onOpen={onOpen} settled={settled} /> : <LockedCard />;
}
