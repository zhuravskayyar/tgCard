import type { CardElement, CardRarity, CollectionCompletionNotice, PlayerCard } from "@cardastika/shared";
import { CardArtwork } from "./CardArtwork";
import { CardNameBadge } from "./CardNameBadge";
import { ElementSymbol } from "./ElementSymbol";

const elementLabels: Record<CardElement, string> = {
  fire: "Вогонь",
  water: "Вода",
  air: "Повітря",
  earth: "Земля",
};

const rarityLabels: Record<CardRarity, string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

interface ShopRewardRevealProps {
  collectionCompleted?: CollectionCompletionNotice;
  deckPower?: number;
  deckChanged: boolean;
  onContinue: () => void;
  previousDeckPower?: number;
  reward: PlayerCard;
}

export function ShopRewardReveal({
  collectionCompleted,
  deckChanged,
  deckPower,
  onContinue,
  previousDeckPower,
  reward,
}: ShopRewardRevealProps) {
  const deckImproved = deckChanged && previousDeckPower !== undefined && deckPower !== undefined
    && deckPower > previousDeckPower;
  return (
    <section className="shop-reveal" aria-live="polite">
      <header className="shop-reveal__heading">
        <span>Отримано карту</span>
        {reward.displayName ? (
          <CardNameBadge name={reward.displayName} />
        ) : (
          <h1 className="card-detail-name-empty">Назва картки недоступна</h1>
        )}
      </header>

      <div className={`shop-reveal__card deck-card--${reward.element} deck-card--${reward.rarity}`}>
        <CardArtwork artKey={reward.artKey} element={reward.element} />
        <strong className="shop-reveal__power">{reward.finalPower}</strong>
        <span className="shop-reveal__element" aria-hidden="true">
          <ElementSymbol element={reward.element} />
        </span>
        <span className="shop-reveal__rarity" aria-hidden="true" />
      </div>

      <dl className="shop-reveal__facts">
        <div><dt>Рівень</dt><dd>{reward.level}</dd></div>
        <div><dt>Сила</dt><dd>{reward.finalPower}</dd></div>
        <div><dt>Стихія</dt><dd>{elementLabels[reward.element]}</dd></div>
        <div><dt>Рідкість</dt><dd>{rarityLabels[reward.rarity]}</dd></div>
      </dl>
      {deckImproved ? (
        <p className="shop-reveal__deck-note">Колода посилилась: {previousDeckPower} → {deckPower}</p>
      ) : null}
      {collectionCompleted ? <aside className="shop-collection-complete"><span>КОЛЕКЦІЮ ЗІБРАНО</span><strong>{collectionCompleted.name}</strong><p>{collectionCompleted.bonusLabel}</p></aside> : null}
      <button className="shop-reveal__continue" onClick={onContinue} type="button">Продовжити</button>
    </section>
  );
}
