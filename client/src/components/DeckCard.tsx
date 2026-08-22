import type { PlayerDeckCard } from "@cardastika/shared";
import { CardArtwork } from "./CardArtwork";
import { ElementSymbol } from "./ElementSymbol";

interface DeckCardProps {
  card: Omit<PlayerDeckCard, "slot"> & { slot?: number };
  onClick?: () => void;
  selected?: boolean;
}

export function DeckCard({ card, onClick, selected = false }: DeckCardProps) {
  return (
    <button
      aria-label={`${card.displayName ? `${card.displayName}, ` : ""}power ${card.power}, element ${card.element}, rarity ${card.rarity}`}
      aria-pressed={selected}
      className={`deck-card deck-card--${card.element} deck-card--${card.rarity}`}
      onClick={onClick}
      type="button"
    >
      <CardArtwork artKey={card.artKey} element={card.element} />
      <strong className="deck-card__power">{card.power}</strong>
      <span className="deck-card__element-badge" aria-hidden="true">
        <ElementSymbol element={card.element} />
      </span>
      <span className="deck-card__rarity" aria-hidden="true" />
    </button>
  );
}
