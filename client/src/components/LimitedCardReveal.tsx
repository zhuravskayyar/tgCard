import type { PlayerCard } from "@cardastika/shared";
import { CardFxWrapper } from "./CardFxWrapper";
import { CardHud } from "./CardHud";
import { CardNameBadge } from "./CardNameBadge";

const elementLabels = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" } as const;
const rarityLabels = { common: "Звичайна", uncommon: "Незвичайна", rare: "Рідкісна", epic: "Епічна", legendary: "Легендарна", mythic: "Міфічна" } as const;

export function LimitedCardReveal({ onContinue, reward }: { onContinue: () => void; reward: PlayerCard }) {
  return (
    <section className="limited-card-reveal" aria-live="polite">
      <header className="limited-card-reveal__heading">
        <span>Нова нагорода</span>
        <h1>Лімітовану карту отримано</h1>
        {reward.displayName ? <CardNameBadge name={reward.displayName} /> : null}
      </header>
      <div className={`limited-card-reveal__card deck-card--${reward.element} deck-card--${reward.rarity}`}>
        <CardFxWrapper artKey={reward.artKey} cardId={reward.cardId} element={reward.element} rarity={reward.rarity}>
          <CardHud element={reward.element} power={reward.finalPower} rarity={reward.rarity} />
        </CardFxWrapper>
      </div>
      <dl className="limited-card-reveal__facts">
        <div><dt>Рівень</dt><dd>{reward.level}</dd></div>
        <div><dt>Сила</dt><dd>{reward.finalPower}</dd></div>
        <div><dt>Стихія</dt><dd>{elementLabels[reward.element]}</dd></div>
        <div><dt>Рідкість</dt><dd>{rarityLabels[reward.rarity]}</dd></div>
      </dl>
      <button className="limited-card-reveal__continue" onClick={onContinue} type="button">Продовжити</button>
    </section>
  );
}
