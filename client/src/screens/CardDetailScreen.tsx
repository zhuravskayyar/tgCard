import type { PlayerDeckCard } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { CardNameBadge } from "../components/CardNameBadge";
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
      </header>

      <div className="card-detail-heading">
        {card.displayName ? (
          <CardNameBadge name={card.displayName} />
        ) : (
          <h1 className="card-detail-name-empty">Назва карти недоступна</h1>
        )}
        <p className="card-detail-meta">
          {elementLabels[card.element]} <span aria-hidden="true">•</span> {rarityLabels[card.rarity]}
        </p>
      </div>

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

      <dl className="card-facts">
        <div>
          <dt>Сила</dt>
          <dd>{card.power}</dd>
        </div>
        <div>
          <dt>Колекція</dt>
          <dd>{card.collectionId ?? "Поза колекцією"}</dd>
        </div>
        <div>
          <dt>Стан у колоді</dt>
          <dd>{inActiveDeck ? "У бойовій колоді" : "Поза бойовою колодою"}</dd>
        </div>
      </dl>

      <nav className="card-detail-actions" aria-label="Дії з картою">
        <MenuRow compact icon="deck" onClick={onBack} title="Колода" />
        <MenuRow compact icon="inventory" title="Слабкі карти" />
        <MenuRow compact icon="shop" title="Магазин" />
      </nav>
    </section>
  );
}
