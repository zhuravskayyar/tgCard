import type { PlayerCollectionResponse } from "@cardastika/shared";
import { AppIcon } from "../AppIcon";
import { BestiaryCard } from "./BestiaryCard";
import { CollectionEmblem } from "./CollectionEntry";

export function CollectionPage({ data, onBack, onOpenCard, onOpenShop, settled }: {
  data: PlayerCollectionResponse;
  onBack: () => void;
  onOpenCard: (cardId: string) => void;
  onOpenShop: () => void;
  settled: boolean;
}) {
  const { cards, collection } = data;
  const isRaid = collection.source === "raid";
  return (
    <div className="bestiary-page">
      <button className="collection-return bestiary-page__back" onClick={onBack} type="button">Назад до змісту</button>
      <header className="bestiary-page__header">
        <span className="bestiary-page__crest">
          <CollectionEmblem code={collection.code} />
          {collection.completed ? <span aria-hidden="true" className="bestiary-seal" /> : null}
        </span>
        <h2>{collection.displayName}</h2>
        <p className="bestiary-page__progress">{collection.discoveredCards} / {collection.totalCards} карт</p>
        <p className="bestiary-page__bonus">
          {isRaid ? "Рейдова колекція. " : null}Бонус: {collection.bonusLabel}
          {collection.completed ? " — активний" : null}
        </p>
      </header>
      <div aria-label={`Карти колекції ${collection.displayName}`} className="bestiary-page__cards">
        {cards.map((card) => <BestiaryCard card={card} key={card.id} onOpen={() => onOpenCard(card.id)} settled={settled} />)}
      </div>
      {isRaid
        ? <p className="bestiary-page__source">Карти цієї колекції можна отримати лише в рейдах.</p>
        : <button className="collection-return bestiary-page__shop" onClick={onOpenShop} type="button">Магазин <AppIcon name="chevron" size={17} /></button>}
    </div>
  );
}
