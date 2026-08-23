import { useRef, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { DeckCard } from "../components/DeckCard";
import { Pagination } from "../components/Pagination";
import { useWeakCards } from "../hooks/useWeakCards";

interface WeakCardsScreenProps {
  onBack: () => void;
  onOpenCard: (instanceId: string) => void;
}

export function WeakCardsScreen({ onBack, onOpenCard }: WeakCardsScreenProps) {
  const [page, setPage] = useState(1);
  const { retry, state } = useWeakCards(page);
  const screenRef = useRef<HTMLElement>(null);

  function changePage(nextPage: number) {
    setPage(nextPage);
    requestAnimationFrame(() => screenRef.current?.closest<HTMLElement>(".app-content")?.scrollTo({ top: 0 }));
  }

  return (
    <section className="weak-cards-screen" ref={screenRef}>
      <header className="deck-heading weak-cards-heading">
        <button aria-label="Назад" className="deck-back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div><h1>СЛАБКІ КАРТИ</h1></div>
        <strong>{state.status === "ready" ? `${state.data.totalCards} карт` : "— карт"}</strong>
      </header>

      {state.status === "loading" ? <div className="deck-state">Завантаження слабких карт…</div> : null}
      {state.status === "unavailable" ? <div className="deck-state">Карти доступні після запуску через Telegram.</div> : null}
      {state.status === "error" ? (
        <div className="deck-state deck-state--error"><span>Не вдалося завантажити слабкі карти.</span><button onClick={retry} type="button">Повторити</button></div>
      ) : null}
      {state.status === "ready" && state.data.totalCards === 0 ? (
        <div className="weak-cards-empty">
          <strong>Слабких карт немає</strong>
          <span>Усі ваші карти зараз входять до бойової колоди.</span>
        </div>
      ) : null}
      {state.status === "ready" && state.data.totalCards > 0 ? (
        <>
          <div className="deck-grid weak-cards-grid" aria-label="Слабкі карти">
            {state.data.cards.map((card) => (
              <DeckCard card={card} key={card.instanceId} onClick={() => onOpenCard(card.instanceId)} />
            ))}
          </div>
          <Pagination currentPage={state.data.page} onPageChange={changePage} totalPages={state.data.totalPages} />
        </>
      ) : null}
    </section>
  );
}
