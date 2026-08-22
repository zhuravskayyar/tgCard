import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerCard, PlayerDeckCard } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { DeckCard } from "../components/DeckCard";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { CardDetailScreen } from "./CardDetailScreen";

function getReserveCards(inventory: readonly PlayerCard[], deck: readonly PlayerDeckCard[]) {
  const selectedCounts = new Map<string, number>();
  deck.forEach(({ cardId }) => selectedCounts.set(cardId, (selectedCounts.get(cardId) ?? 0) + 1));
  return inventory.filter((card) => card.quantity > (selectedCounts.get(card.cardId) ?? 0));
}

interface DeckScreenProps {
  onBack: () => void;
}

export function DeckScreen({ onBack }: DeckScreenProps) {
  const { retry, save, state } = usePlayerDeck();
  const [draft, setDraft] = useState<PlayerDeckCard[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [inspectedCard, setInspectedCard] = useState<PlayerDeckCard | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const screenRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const deckScrollPositionRef = useRef(0);

  useEffect(() => {
    if (state.status === "ready") {
      setDraft(state.deck.cards);
      setSelectedSlot(null);
      setSaveState("idle");
    }
  }, [state]);

  const reserveCards = useMemo(
    () => state.status === "ready" ? getReserveCards(state.inventory.cards, draft) : [],
    [draft, state],
  );
  const isDirty = state.status === "ready" && draft.some(
    (card, index) => card.cardId !== state.deck.cards[index]?.cardId,
  );

  function openCardDetail(card: PlayerDeckCard) {
    const scrollContainer = screenRef.current?.closest<HTMLElement>(".app-content") ?? null;
    scrollContainerRef.current = scrollContainer;
    deckScrollPositionRef.current = scrollContainer?.scrollTop ?? 0;
    setSelectedSlot(card.slot);
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

  function replaceSelectedCard(card: PlayerCard) {
    if (selectedSlot === null) return;
    setDraft((current) => current.map((entry) => entry.slot === selectedSlot ? {
      ...entry,
      cardId: card.cardId,
      code: card.code,
      displayName: card.displayName,
      artKey: card.artKey,
      collectionId: card.collectionId,
      element: card.element,
      power: card.power,
      rarity: card.rarity,
    } : entry));
    setSaveState("idle");
  }

  async function saveDeck() {
    if (!isDirty || saveState === "saving") return;
    setSaveState("saving");
    try {
      await save(draft.map(({ cardId, slot }) => ({ cardId, slot })));
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  }

  if (inspectedCard) {
    return <CardDetailScreen card={inspectedCard} inActiveDeck onBack={closeCardDetail} />;
  }

  return (
    <section className="deck-screen" ref={screenRef}>
      <header className="deck-heading">
        <button aria-label="Назад на головну" className="deck-back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>Активна колода</span>
          <h1>МОЯ КОЛОДА</h1>
        </div>
        <strong>{state.status === "ready" ? `${state.deck.totalPower} power` : "— power"}</strong>
      </header>

      {state.status === "loading" ? <div className="deck-state" aria-live="polite">Завантаження колоди…</div> : null}
      {state.status === "unavailable" ? <div className="deck-state">Колода доступна після запуску через Telegram.</div> : null}
      {state.status === "missing" ? <div className="deck-state">Активну колоду ще не створено.</div> : null}
      {state.status === "inventory-empty" ? <div className="deck-state">Інвентар карт порожній.</div> : null}
      {state.status === "error" ? (
        <div className="deck-state deck-state--error">
          <span>Не вдалося завантажити колоду.</span>
          <button onClick={retry} type="button">Повторити</button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <>
          <div className="deck-grid" aria-label="Дев’ять карт активної колоди">
            {draft.map((card) => (
              <DeckCard
                card={card}
                key={card.slot}
                onClick={() => openCardDetail(card)}
                selected={card.slot === selectedSlot}
              />
            ))}
          </div>

          <section className="deck-reserve" aria-label="Доступні карти для заміни">
            <h2>Доступні карти</h2>
            {reserveCards.length === 0 ? <p>Немає інших доступних карт</p> : (
              <div className="deck-reserve__cards">
                {reserveCards.map((card) => (
                  <DeckCard card={card} key={card.cardId} onClick={() => replaceSelectedCard(card)} />
                ))}
              </div>
            )}
          </section>

          <button className="deck-save" disabled={!isDirty || saveState === "saving"} onClick={saveDeck} type="button">
            {saveState === "saving" ? "Збереження…" : "Зберегти колоду"}
          </button>
          {saveState === "error" ? <p className="deck-save-error">Не вдалося зберегти. Спробуйте ще раз.</p> : null}
        </>
      ) : null}
    </section>
  );
}
