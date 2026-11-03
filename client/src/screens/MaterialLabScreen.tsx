import { ScreenHeading } from "../components/ScreenHeading";
import { CardPlateFrame } from "../components/CardPlateFrame";
import { useCardArtworkSource } from "../components/cardArtSource";
import { useCardWorkshop } from "../hooks/useCardWorkshop";
import "../styles/material-lab.css";

// Dev-only comparison of the proposed rarity ladder on one real card.
const CANDIDATES = [
  { id: "paper", label: "Звичайна: пергамент" },
  { id: "bog-oak", label: "Незвичайна: морений дуб" },
  { id: "blued-steel", label: "Рідкісна: воронена сталь" },  { id: "silver-engraving", label: "Епічна: срібна гравюра" },
  { id: "gold-damascus", label: "Легендарна: золотий дамаск" },
  { id: "star-steel", label: "Міфічна: зоряна сталь" },
] as const;

export function MaterialLabScreen({ onBack }: { onBack: () => void }) {
  const { state } = useCardWorkshop();
  const card = state.status === "ready" ? state.data.cards.find((candidate) => candidate.rarity === "legendary") ?? state.data.cards[0] : undefined;
  const artwork = useCardArtworkSource(card?.artKey ?? null, card?.cardId);

  return (
    <section className="material-lab">
      <ScreenHeading onBack={onBack} title="Матеріали рідкостей" />
      {card ? (
        <div className="material-lab__grid">
          {CANDIDATES.map((candidate) => (
            <figure className="material-lab__item" key={candidate.id}>
              <div className={`deck-card deck-card--${card.element} deck-card--legendary material-lab__card`}>
                <span className={`card-fx card-fx--material card-fx--single card-fx--interactive deck-card--${card.element} deck-card--legendary`}>
                  <CardPlateFrame artworkLoading={artwork.loading} artworkSource={artwork.source} element={card.element} material={candidate.id} onArtworkError={artwork.onSourceError} power={4583} rarity="legendary" />
                </span>
              </div>
              <figcaption>{candidate.label}</figcaption>
            </figure>
          ))}
        </div>
      ) : <p role="status">{state.status === "error" ? "Не вдалося завантажити карти." : "Завантаження…"}</p>}
    </section>
  );
}
