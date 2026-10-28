import { useContext } from "react";
import type { CardElement, CardRarity } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CardPlateFrame } from "./CardPlateFrame";
import { CardArtworkSourceContext } from "./CardFxWrapper";

interface CardHudProps {
  element: CardElement;
  level?: number;
  power: number;
  protectedFromAbsorption?: boolean;
  rarity: CardRarity;
  showLevel?: boolean;
  upgradeIndicator?: "element" | "gold";
}

export function CardHud({ element, power, protectedFromAbsorption = false, rarity, upgradeIndicator }: CardHudProps) {
  const artwork = useContext(CardArtworkSourceContext);

  return (
    <>
      <CardPlateFrame artworkSource={artwork.source} element={element} onArtworkError={artwork.onSourceError} power={power} rarity={rarity} />
      {protectedFromAbsorption ? <span aria-label="Карта захищена" className="card-hud__protection"><AppIcon name="lock" size={15} /></span> : null}
      {upgradeIndicator ? <span title={upgradeIndicator === "gold" ? "Золотий рівень — підвищення за золото" : "Доступне безкоштовне підвищення"} aria-label={upgradeIndicator === "gold" ? "Золотий рівень — підвищення за золото" : "Доступне безкоштовне підвищення"} className={`card-hud__upgrade card-hud__upgrade--${upgradeIndicator}`}><AppIcon name="arrow-up" size={20} /></span> : null}
    </>
  );
}
