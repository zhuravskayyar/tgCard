import type { CardElement, CardRarity } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { ElementSymbol } from "./ElementSymbol";

interface CardHudProps {
  element: CardElement;
  level?: number;
  power: number;
  protectedFromAbsorption?: boolean;
  rarity: CardRarity;
  showLevel?: boolean;
  upgradeIndicator?: "element" | "gold";
}

export function CardHud({ element, level, power, protectedFromAbsorption = false, rarity, showLevel = false, upgradeIndicator }: CardHudProps) {
  return (
    <>
      <span className={`card-hud card-hud--${element} card-hud--${rarity}`} aria-hidden="true">
        <span className="card-hud__power">
          <AppIcon name="deck-power" size={14} />
        </span>
        <strong className="card-hud__power-value">{power}</strong>
      </span>
      <span className={`card-hud__element card-hud__element--${element}`} aria-hidden="true">
        <ElementSymbol element={element} />
      </span>
      {protectedFromAbsorption ? <span aria-label="Карта захищена" className="card-hud__protection"><AppIcon name="lock" size={15} /></span> : null}
      {showLevel && level !== undefined ? <span className="card-hud__level">Рів. {level}</span> : null}
      {upgradeIndicator ? <span aria-label={upgradeIndicator === "gold" ? "Готова до золотого підвищення" : "Готова до підвищення"} className={`card-hud__upgrade card-hud__upgrade--${upgradeIndicator}`}>⬆</span> : null}
    </>
  );
}
