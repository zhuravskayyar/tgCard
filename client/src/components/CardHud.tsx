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

/** The painted bronze arrow; the gold level gilds it in CSS. */
function UpgradeArrow() {
  return <img alt="" aria-hidden="true" className="card-hud__upgrade-arrow" draggable={false} src="/assets/ui/icons/icon-arrow-up-v1.webp" />;
}

export function CardHud({ element, power, protectedFromAbsorption = false, rarity, staticMaterial = false, upgradeIndicator }: CardHudProps) {
  const artwork = useContext(CardArtworkSourceContext);

  return (
    <>
      <CardPlateFrame artworkLoading={artwork.loading} artworkSource={artwork.source} element={element} onArtworkError={artwork.onSourceError} power={power} rarity={rarity} staticMaterial={staticMaterial} />
      {protectedFromAbsorption ? <span aria-label="Карта захищена" className="card-hud__protection"><AppIcon name="lock" size={15} /></span> : null}
      {upgradeIndicator ? <span title={upgradeIndicator === "gold" ? "Золотий рівень — підвищення за золото" : "Доступне безкоштовне підвищення"} aria-label={upgradeIndicator === "gold" ? "Золотий рівень — підвищення за золото" : "Доступне безкоштовне підвищення"} className={`card-hud__upgrade card-hud__upgrade--${upgradeIndicator}`}><UpgradeArrow /></span> : null}
    </>
  );
}
