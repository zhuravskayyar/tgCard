import type { PlayerDeckCard } from "@cardastika/shared";
import { CardHud } from "./CardHud";
import { CardFxWrapper, type CardFxArtworkLayers } from "./CardFxWrapper";

interface DeckCardProps {
  card: Omit<PlayerDeckCard, "slot"> & { slot?: number };
  dataTutorialTarget?: string;
  depthAssets?: CardFxArtworkLayers;
  onClick?: () => void;
  selected?: boolean;
  showLevel?: boolean;
  upgradeIndicator?: "element" | "gold";
}

export function DeckCard({ card, dataTutorialTarget, depthAssets, onClick, selected = false, showLevel = false, upgradeIndicator }: DeckCardProps) {
  return (
    <button
      aria-label={`${card.displayName ? `${card.displayName}, ` : ""}power ${card.finalPower}, element ${card.element}, rarity ${card.rarity}`}
      aria-pressed={showLevel ? selected : undefined}
      className={`deck-card deck-card--${card.element} deck-card--${card.rarity}${selected ? " deck-card--selected" : ""}`}
      data-tutorial-target={dataTutorialTarget}
      onClick={onClick}
      type="button"
    >
      <CardFxWrapper artKey={card.artKey} cardId={card.cardId} depthAssets={depthAssets} element={card.element} rarity={card.rarity}>
        <CardHud element={card.element} level={card.level} power={card.finalPower} protectedFromAbsorption={card.protectedFromAbsorption} rarity={card.rarity} showLevel={showLevel} upgradeIndicator={upgradeIndicator} />
        {selected ? <span className="deck-card__selected-mark" aria-hidden="true" /> : null}
      </CardFxWrapper>
    </button>
  );
}
