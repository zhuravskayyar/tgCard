import { AppIcon } from "../components/AppIcon";
import { DeckCard } from "../components/DeckCard";
import { ElementSymbol } from "../components/ElementSymbol";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { getUpgradeProgress, isGoldLevel, MAX_CARD_LEVEL } from "@cardastika/game-core";
import type { PlayerDeckCard } from "@cardastika/shared";

interface DeckScreenProps {
  onBack: () => void;
  onOpenCard: (instanceId: string) => void;
  onOpenShop: () => void;
}

function getUpgradeIndicator(card: PlayerDeckCard): "element" | "gold" | undefined {
  if (card.level >= MAX_CARD_LEVEL) return undefined;
  const progress = getUpgradeProgress(card.levelProgressElements, card.level);
  if (progress.filledElements < progress.requiredElements) return undefined;
  return isGoldLevel(card.level + 1) ? "gold" : "element";
}

export function DeckScreen({ onBack, onOpenCard }: DeckScreenProps) {
  const { retry, state } = usePlayerDeck();
  const elementCounts = state.status === "ready"
    ? state.deck.cards.reduce<Record<string, number>>((counts, card) => ({ ...counts, [card.element]: (counts[card.element] ?? 0) + 1 }), {})
    : null;

  return (
    <section className="deck-screen">
      <header className="deck-heading">
        <button aria-label="Назад на головну" className="deck-back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <h1>МОЯ КОЛОДА</h1>
        </div>
        <strong>{state.status === "ready" ? `${state.deck.totalPower} power` : "— power"}</strong>
      </header>

      {state.status === "loading" ? <div className="deck-state" aria-live="polite">Завантаження колоди…</div> : null}
      {state.status === "unavailable" ? <div className="deck-state">Колода доступна після запуску через Telegram.</div> : null}
      {state.status === "missing" ? <div className="deck-state">Недостатньо карт для бойової колоди.</div> : null}
      {state.status === "error" ? (
        <div className="deck-state deck-state--error">
          <span>Не вдалося завантажити колоду.</span>
          <button onClick={retry} type="button">Повторити</button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          <section className="deck-rule-note" data-tutorial-target="deck-rule" aria-label="Правило бойової колоди">
            <div><strong>9 карт у бойовій колоді</strong><span>Автоматично обрані найсильніші допустимі карти</span></div>
            <div className="deck-rule-note__elements">
              {(["fire", "water", "earth", "air"] as const).map((element) => <span key={element}><ElementSymbol element={element} /><strong>{elementCounts?.[element] ?? 0}</strong></span>)}
            </div>
          </section>
          <div className="deck-grid" aria-label="Дев’ять карт автоматичної бойової колоди">
            {state.deck.cards.map((card, index) => (
              <DeckCard card={card} dataTutorialTarget={index === 0 ? "deck-card" : undefined} key={card.slot} onClick={() => onOpenCard(card.instanceId)} upgradeIndicator={getUpgradeIndicator(card)} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
