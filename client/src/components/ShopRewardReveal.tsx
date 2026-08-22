import type { CardElement, CardRarity, PlayerCard } from "@cardastika/shared";
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
  deckChanged: boolean;
  onContinue: () => void;
  reward: PlayerCard;
}

export function ShopRewardReveal({ deckChanged, onContinue, reward }: ShopRewardRevealProps) {
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
        <strong className="shop-reveal__power">{reward.power}</strong>
        <span className="shop-reveal__element" aria-hidden="true">
          <ElementSymbol element={reward.element} />
        </span>
        <span className="shop-reveal__rarity" aria-hidden="true" />
      </div>

      <dl className="shop-reveal__facts">
        <div><dt>Сила</dt><dd>{reward.power}</dd></div>
        <div><dt>Стихія</dt><dd>{elementLabels[reward.element]}</dd></div>
        <div><dt>Рідкість</dt><dd>{rarityLabels[reward.rarity]}</dd></div>
      </dl>
      {deckChanged ? <p className="shop-reveal__deck-note">Бойову колоду автоматично оновлено.</p> : null}
      <button className="shop-reveal__continue" onClick={onContinue} type="button">Продовжити</button>
    </section>
  );
}
