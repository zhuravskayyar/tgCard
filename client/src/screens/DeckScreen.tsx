import { AppIcon } from "../components/AppIcon";
import { DeckCard } from "../components/DeckCard";
import { usePlayerDeck } from "../hooks/usePlayerDeck";

interface DeckScreenProps {
  onBack: () => void;
  onOpenCard: (instanceId: string) => void;
  onOpenShop: () => void;
}

export function DeckScreen({ onBack, onOpenCard }: DeckScreenProps) {
  const { retry, state } = usePlayerDeck();

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
        <div className="deck-grid" aria-label="Дев’ять карт автоматичної бойової колоди">
          {state.deck.cards.map((card) => (
            <DeckCard card={card} key={card.slot} onClick={() => onOpenCard(card.instanceId)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
