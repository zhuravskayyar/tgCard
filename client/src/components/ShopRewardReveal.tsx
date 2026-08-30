import { useEffect, useState } from "react";
import type { CardElement, CardRarity, ShopPurchaseResponse } from "@cardastika/shared";
import { CardNameBadge } from "./CardNameBadge";
import { CardHud } from "./CardHud";
import { CardFxWrapper } from "./CardFxWrapper";

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
  canBuyTen?: boolean;
  errorMessage?: string | null;
  onBuyAgain?: () => void;
  onBuyTen?: () => void;
  onContinue: () => void;
  purchasing?: boolean;
  purchases: readonly ShopPurchaseResponse[];
}

export function ShopRewardReveal({
  canBuyTen = false,
  errorMessage,
  onBuyAgain,
  onBuyTen,
  onContinue,
  purchasing = false,
  purchases,
}: ShopRewardRevealProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => setActiveIndex(0), [purchases]);

  const activePurchase = purchases[activeIndex] ?? purchases[0];
  if (!activePurchase) return null;

  const { collectionCompleted, deckChanged, deckPower, previousDeckPower, reward } = activePurchase;
  const isBatch = purchases.length > 1;
  const hasNextCard = activeIndex < purchases.length - 1;
  const deckImproved = deckChanged && previousDeckPower !== undefined && deckPower !== undefined
    && deckPower > previousDeckPower;

  function showNextCard() {
    if (hasNextCard) setActiveIndex((current) => current + 1);
  }

  const rewardCard = (
    <CardFxWrapper artKey={reward.artKey} cardId={reward.cardId} element={reward.element} rarity={reward.rarity}>
      <CardHud element={reward.element} power={reward.finalPower} rarity={reward.rarity} />
    </CardFxWrapper>
  );

  return (
    <section className="shop-reveal" aria-live="polite" data-tutorial-target="shop-reveal">
      <header className="shop-reveal__heading">
        <span>Отримано карту</span>
        {reward.displayName ? (
          <CardNameBadge name={reward.displayName} />
        ) : (
          <h1 className="card-detail-name-empty">Назва картки недоступна</h1>
        )}
      </header>

      {hasNextCard ? (
        <button
          aria-label={`Переглянути карту ${activeIndex + 1} з ${purchases.length}`}
          className={`shop-reveal__card shop-reveal__card--interactive deck-card--${reward.element} deck-card--${reward.rarity}`}
          onClick={showNextCard}
          type="button"
        >
          {rewardCard}
        </button>
      ) : <div className={`shop-reveal__card deck-card--${reward.element} deck-card--${reward.rarity}`}>{rewardCard}</div>}

      {isBatch ? (
        <p className="shop-reveal__batch-summary">
          <strong>Куплено пачкою</strong>
          <span>Карта {activeIndex + 1} з {purchases.length}</span>
          <small>{hasNextCard ? "Торкніться карти, щоб переглянути наступну" : "Це остання карта пачки"}</small>
        </p>
      ) : null}

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
      {errorMessage ? <p className="shop-error" role="alert">{errorMessage}</p> : null}
      <div className="shop-reveal__actions">
        <button className="shop-reveal__continue" data-tutorial-target="shop-continue" disabled={purchasing} onClick={onContinue} type="button">Продовжити</button>
        {onBuyAgain ? <button className="shop-reveal__buy-again" disabled={purchasing} onClick={onBuyAgain} type="button">{purchasing ? "Купуємо…" : "Купити ще"}</button> : null}
        {canBuyTen && onBuyTen ? <button className="shop-reveal__buy-batch" disabled={purchasing || hasNextCard} onClick={onBuyTen} type="button">{purchasing ? "Купуємо 10…" : "Купити 10"}</button> : null}
      </div>
    </section>
  );
}
