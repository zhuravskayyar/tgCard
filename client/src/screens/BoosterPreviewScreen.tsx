import { useCallback, useMemo, useState } from "react";
import { CARD_RARITIES, type CardRarity } from "@cardastika/shared";
import { ScreenHeading } from "../components/ScreenHeading";
import { BOOSTER_RARITY_LABELS, BoosterOpening } from "../components/BoosterOpening";
import { useCardWorkshop } from "../hooks/useCardWorkshop";
import type { BoosterPhase } from "../booster/boosterRenderer";

// Dev lab: the shop's 3D pack opening with one real catalog card of each rarity, without buying anything.
export function BoosterPreviewScreen({ onBack }: { onBack: () => void }) {
  const { retry, state } = useCardWorkshop();
  const [drawIndex, setDrawIndex] = useState(0);
  const [selectedRarity, setSelectedRarity] = useState<CardRarity | null>(null);
  const [locked, setLocked] = useState(true);
  const [round, setRound] = useState(0);
  const cards = useMemo(() => state.status === "ready" ? CARD_RARITIES.flatMap((rarity) => state.data.cards.filter((candidate) => candidate.rarity === rarity)) : [], [state]);
  const card = selectedRarity ? cards.find((candidate) => candidate.rarity === selectedRarity) : cards[drawIndex % Math.max(1, cards.length)];
  const trackPhase = useCallback((phase: BoosterPhase, ready: boolean) => setLocked(!ready || (phase !== "sealed" && phase !== "revealed")), []);

  function nextPack() {
    if (selectedRarity === null && cards.length > 1) setDrawIndex((index) => (index + 1) % cards.length);
    else setRound((value) => value + 1);
  }

  return (
    <>
      <ScreenHeading onBack={onBack} title="Відкриття пакунка" />
      {card ? (
        <BoosterOpening
          card={card}
          doneLabel="Ще один пакунок"
          footnote={<p className="booster-preview__note">Тест анімації · Карти з майстерні · Без покупки</p>}
          key={`${card.cardId}-${round}`}
          onDone={nextPack}
          onPhaseChange={trackPhase}
          packRarity={card.rarity}
          toolbar={<div className="booster-preview__toolbar">
            <label>Рідкість карти<select aria-label="Рідкість карти" disabled={locked} onChange={(event) => { setSelectedRarity(event.target.value === "cycle" ? null : event.target.value as CardRarity); if (event.target.value === "cycle") setDrawIndex(0); }} value={selectedRarity ?? "cycle"}>
              <option value="cycle">Усі по черзі</option>
              {CARD_RARITIES.map((rarity) => <option disabled={!cards.some((candidate) => candidate.rarity === rarity)} key={rarity} value={rarity}>{BOOSTER_RARITY_LABELS[rarity]}</option>)}
            </select></label>
          </div>}
        />
      ) : (
        <div className="booster-preview__state" role={state.status === "error" ? "alert" : "status"}>
          <p>{state.status === "loading" ? "Завантажуємо каталог карт…" : "Не вдалося завантажити карту з майстерні."}</p>
          {state.status !== "loading" ? <button className="ui-button" onClick={retry} type="button">Спробувати ще раз</button> : null}
        </div>
      )}
    </>
  );
}
