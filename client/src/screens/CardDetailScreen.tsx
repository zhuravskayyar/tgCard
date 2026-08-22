import type { PlayerDeckCard } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { ElementSymbol } from "../components/ElementSymbol";
import { MenuRow } from "../components/MenuRow";

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

interface CardDetailScreenProps {
  card: PlayerDeckCard;
  inActiveDeck: boolean;
  onBack: () => void;
}

export function CardDetailScreen({ card, inActiveDeck, onBack }: CardDetailScreenProps) {
  return (
    <section className="card-detail-screen">
      <header className="card-detail-topbar">
        <button aria-label="Назад до колоди" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <h1>КАРТА</h1>
      </header>

      <div
        aria-label={`Сила ${card.power}, стихія ${elementLabels[card.element]}, рідкість ${rarityLabels[card.rarity]}`}
        className={`card-detail-card deck-card--${card.element} deck-card--${card.rarity}`}
        role="img"
      >
        <CardArtwork artKey={card.artKey} element={card.element} />
        <strong className="card-detail-card__power">{card.power}</strong>
        <span className="card-detail-card__element" aria-hidden="true">
          <ElementSymbol element={card.element} />
        </span>
        <span className="card-detail-card__rarity" aria-hidden="true" />
      </div>

      {card.displayName ? <h2 className="card-detail-name">{card.displayName}</h2> : null}

      <dl className="card-facts">
        <div><dt>Сила</dt><dd>{card.power}</dd></div>
        <div><dt>Стихія</dt><dd>{elementLabels[card.element]}</dd></div>
        <div><dt>Рідкість</dt><dd>{rarityLabels[card.rarity]}</dd></div>
        <div><dt>Колекція</dt><dd>{card.collectionId ?? "Поза колекцією"}</dd></div>
      </dl>

      {inActiveDeck ? (
        <div className="card-deck-status">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m5 12.5 4.2 4L19 7" />
          </svg>
          <span>У бойовій колоді</span>
        </div>
      ) : null}

      <nav className="card-detail-actions" aria-label="Дії з картою">
        <MenuRow compact icon="deck" onClick={onBack} title="Колода" />
        <MenuRow compact disabled icon="inventory" title="Слабкі карти" />
        <MenuRow compact disabled icon="shop" title="Магазин" />
      </nav>
    </section>
  );
}
