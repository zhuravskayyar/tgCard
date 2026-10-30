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
  staticMaterial?: boolean;
  upgradeIndicator?: "element" | "gold";
}

// A solid bevelled arrow: green for a free upgrade, gold for a paid golden level (colours come from CSS).
function UpgradeArrow() {
  return (
    <svg className="card-hud__upgrade-arrow" viewBox="0 0 32 32">
      <path className="card-hud__upgrade-body" d="M16 2.5 29 16.5h-7.6V29.5H10.6V16.5H3Z" />
      <path className="card-hud__upgrade-light" d="M16 6.4 24.3 15.4h-5.2v11.6h-2.2V13.6h3.1L16 9Z" />
    </svg>
  );
}

export function CardHud({ element, power, protectedFromAbsorption = false, rarity, staticMaterial = false, upgradeIndicator }: CardHudProps) {
  const artwork = useContext(CardArtworkSourceContext);

  return (
    <>
      <CardPlateFrame artworkSource={artwork.source} element={element} onArtworkError={artwork.onSourceError} power={power} rarity={rarity} staticMaterial={staticMaterial} />
      {protectedFromAbsorption ? <span aria-label="Карта захищена" className="card-hud__protection"><AppIcon name="lock" size={15} /></span> : null}
      {upgradeIndicator ? <span title={upgradeIndicator === "gold" ? "Золотий рівень — підвищення за золото" : "Доступне безкоштовне підвищення"} aria-label={upgradeIndicator === "gold" ? "Золотий рівень — підвищення за золото" : "Доступне безкоштовне підвищення"} className={`card-hud__upgrade card-hud__upgrade--${upgradeIndicator}`}><UpgradeArrow /></span> : null}
    </>
  );
}
