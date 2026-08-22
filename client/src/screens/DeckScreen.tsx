import { useRef, useState } from "react";
import type { PlayerDeckCard } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { DeckCard } from "../components/DeckCard";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { CardDetailScreen } from "./CardDetailScreen";

interface DeckScreenProps {
  onBack: () => void;
  onOpenShop: () => void;
}

export function DeckScreen({ onBack, onOpenShop }: DeckScreenProps) {
  const { retry, state } = usePlayerDeck();
  const [inspectedCard, setInspectedCard] = useState<PlayerDeckCard | null>(null);
  const screenRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const deckScrollPositionRef = useRef(0);

  function openCardDetail(card: PlayerDeckCard) {
    const scrollContainer = screenRef.current?.closest<HTMLElement>(".app-content") ?? null;
    scrollContainerRef.current = scrollContainer;
    deckScrollPositionRef.current = scrollContainer?.scrollTop ?? 0;
    setInspectedCard(card);
    requestAnimationFrame(() => scrollContainer?.scrollTo({ top: 0, behavior: "auto" }));
  }

  function closeCardDetail() {
    const scrollContainer = scrollContainerRef.current;
    setInspectedCard(null);
    requestAnimationFrame(() => scrollContainer?.scrollTo({
      top: deckScrollPositionRef.current,
      behavior: "auto",
    }));
  }

  if (inspectedCard) {
    return <CardDetailScreen card={inspectedCard} inActiveDeck onBack={closeCardDetail} onOpenShop={onOpenShop} />;
  }

  return (
    <section className="deck-screen" ref={screenRef}>
      <header className="deck-heading">
        <button aria-label="Назад на головну" className="deck-back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>Автоматична колода</span>
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
            <DeckCard card={card} key={card.slot} onClick={() => openCardDetail(card)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
