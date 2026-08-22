import { useEffect, useMemo, useState } from "react";
import type { PlayerCard, PlayerDeckCard } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { DeckCard } from "../components/DeckCard";
import { usePlayerDeck } from "../hooks/usePlayerDeck";

const elementLabels: Record<PlayerDeckCard["element"], string> = {
  fire: "Вогонь",
  water: "Вода",
  air: "Повітря",
  earth: "Земля",
};

const rarityLabels: Record<PlayerDeckCard["rarity"], string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

function getReserveCards(inventory: readonly PlayerCard[], deck: readonly PlayerDeckCard[]) {
  const selectedCounts = new Map<string, number>();
  deck.forEach(({ cardId }) => selectedCounts.set(cardId, (selectedCounts.get(cardId) ?? 0) + 1));
  return inventory.filter((card) => card.quantity > (selectedCounts.get(card.cardId) ?? 0));
}

export function DeckScreen({ onBack }: { onBack: () => void }) {
  const { retry, save, state } = usePlayerDeck();
  const [draft, setDraft] = useState<PlayerDeckCard[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");

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
  const selectedCard = selectedSlot === null ? null : draft.find(({ slot }) => slot === selectedSlot) ?? null;
  const isDirty = state.status === "ready" && draft.some(
    (card, index) => card.cardId !== state.deck.cards[index]?.cardId,
  );

  function replaceSelectedCard(card: PlayerCard) {
    if (selectedSlot === null) return;
    setDraft((current) => current.map((entry) => entry.slot === selectedSlot ? {
      ...entry,
      cardId: card.cardId,
      code: card.code,
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

  return (
    <section className="deck-screen">
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
                onClick={() => setSelectedSlot(card.slot)}
                selected={card.slot === selectedSlot}
              />
            ))}
          </div>

          {selectedCard ? (
            <dl className="deck-details">
              <div><dt>Сила</dt><dd>{selectedCard.power}</dd></div>
              <div><dt>Стихія</dt><dd>{elementLabels[selectedCard.element]}</dd></div>
              <div><dt>Рідкість</dt><dd>{rarityLabels[selectedCard.rarity]}</dd></div>
              <div><dt>Колекція</dt><dd>{selectedCard.collectionId ? "У колекції" : "Поза колекцією"}</dd></div>
            </dl>
          ) : (
            <p className="deck-hint">Торкніться карти, щоб переглянути деталі.</p>
          )}

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
