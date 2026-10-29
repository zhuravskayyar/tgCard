import { ScreenHeading } from "../components/ScreenHeading";
import { useRef, useState } from "react";
import { DeckCard } from "../components/DeckCard";
import { MenuRow } from "../components/MenuRow";
import { Pagination } from "../components/Pagination";
import { useWeakCards } from "../hooks/useWeakCards";

interface WeakCardsScreenProps {
  onBack: () => void;
  onOpenCampaign: () => void;
  onOpenCard: (instanceId: string) => void;
  onOpenDeck: () => void;
  onOpenDuel: () => void;
  onOpenShop: () => void;
}

const homeSprite = (name: string) => `/assets/ui/home/sprites/${name}.webp`;

function weakCardsIntro(count: number) {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const noun = lastDigit === 1 && lastTwo !== 11 ? "слабка карта, яку" : lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14) ? "слабкі карти, які" : "слабких карт, які";
  return `У тебе ${count} ${noun} можна витратити на покращення карт бойової колоди.`;
}

export function WeakCardsScreen({ onBack, onOpenCampaign, onOpenCard, onOpenDeck, onOpenDuel, onOpenShop }: WeakCardsScreenProps) {
  const [page, setPage] = useState(1);
  const { retry, state } = useWeakCards(page);
  const screenRef = useRef<HTMLElement>(null);

  function changePage(nextPage: number) {
    setPage(nextPage);
    requestAnimationFrame(() => screenRef.current?.closest<HTMLElement>(".app-content")?.scrollTo({ top: 0 }));
  }

  return (
    <section className="weak-cards-screen" ref={screenRef}>
      <ScreenHeading onBack={onBack} title="СЛАБКІ КАРТИ" action={<strong>{state.status === "ready" ? `${state.data.totalCards} карт` : "— карт"}</strong>} />

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
          <p className="deck-note deck-note--info weak-cards-intro">{weakCardsIntro(state.data.totalCards)}</p>
          <div className="deck-grid weak-cards-grid" aria-label="Слабкі карти">
            {state.data.cards.map((card) => (
              <DeckCard card={card} key={card.instanceId} onClick={() => onOpenCard(card.instanceId)} />
            ))}
          </div>
          <Pagination currentPage={state.data.page} onPageChange={changePage} totalPages={state.data.totalPages} />
        </>
      ) : null}

      <nav className="deck-actions" aria-label="Куди далі">
        <MenuRow chevron icon="deck" iconSrc={homeSprite("mode-deck")} illustrationSrc={homeSprite("row-deck")} onClick={onOpenDeck} title="Бойова колода" />
        <MenuRow chevron icon="duel" iconSrc={homeSprite("mode-duel")} illustrationSrc={homeSprite("row-duel")} onClick={onOpenDuel} title="Дуелі" />
        <MenuRow chevron icon="campaign" iconSrc={homeSprite("mode-campaign")} illustrationSrc={homeSprite("row-campaign")} onClick={onOpenCampaign} title="Кампанія" />
        <MenuRow chevron icon="shop" iconSrc={homeSprite("row-icon-shop")} illustrationSrc={homeSprite("row-shop")} onClick={onOpenShop} title="Магазин" />
      </nav>
    </section>
  );
}
