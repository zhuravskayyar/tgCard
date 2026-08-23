import type { PlayerDeckCard } from "@cardastika/shared";
import { CardArtwork } from "./CardArtwork";
import { ElementSymbol } from "./ElementSymbol";

interface DeckCardProps {
  card: Omit<PlayerDeckCard, "slot"> & { slot?: number };
  onClick?: () => void;
  selected?: boolean;
  showLevel?: boolean;
}

export function DeckCard({ card, onClick, selected = false, showLevel = false }: DeckCardProps) {
  return (
    <button
      aria-label={`${card.displayName ? `${card.displayName}, ` : ""}power ${card.finalPower}, element ${card.element}, rarity ${card.rarity}`}
      aria-pressed={showLevel ? selected : undefined}
      className={`deck-card deck-card--${card.element} deck-card--${card.rarity}${selected ? " deck-card--selected" : ""}`}
      onClick={onClick}
      type="button"
    >
      <CardArtwork artKey={card.artKey} element={card.element} />
      <strong className="deck-card__power">{card.finalPower}</strong>
      <span className="deck-card__element-badge" aria-hidden="true">
        <ElementSymbol element={card.element} />
      </span>
      <span className="deck-card__rarity" aria-hidden="true" />
      {showLevel ? <span className="deck-card__level">Рів. {card.level}</span> : null}
      {selected ? <span className="deck-card__selected-mark" aria-hidden="true" /> : null}
    </button>
  );
}
