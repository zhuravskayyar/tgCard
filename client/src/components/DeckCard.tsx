import type { PlayerDeckCard } from "@cardastika/shared";
import { ElementSymbol } from "./ElementSymbol";

interface DeckCardProps {
  card: Omit<PlayerDeckCard, "slot"> & { slot?: number };
  onClick?: () => void;
  selected?: boolean;
}

export function DeckCard({ card, onClick, selected = false }: DeckCardProps) {
  return (
    <button
      aria-pressed={selected}
      className={`deck-card deck-card--${card.element} deck-card--${card.rarity}`}
      onClick={onClick}
      type="button"
    >
      <span className="deck-card__topline">
        <strong>{card.power}</strong>
        {card.slot ? <span>{String(card.slot).padStart(2, "0")}</span> : null}
      </span>
      <span className="deck-card__sigil"><ElementSymbol element={card.element} /></span>
      <span className="deck-card__element">{card.element}</span>
    </button>
  );
}
