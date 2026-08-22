import type { CardRarity, ShopOffer } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";

const rarityLabels: Record<CardRarity, string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

interface ShopOfferPanelProps {
  canAfford: boolean | null;
  disabled: boolean;
  offer: ShopOffer;
  onPurchase: () => void;
  purchasing: boolean;
}

export function ShopOfferPanel({
  canAfford,
  disabled,
  offer,
  onPurchase,
  purchasing,
}: ShopOfferPanelProps) {
  const higherRarities = offer.allowedRarities.filter((rarity) => rarity !== offer.minimumRarity);
  const currencyLabel = offer.currency === "silver" ? "срібла" : "золота";

  return (
    <article className={`shop-offer shop-offer--${offer.minimumRarity}`}>
      <div className="shop-offer__symbol" aria-hidden="true">
        <AppIcon name="collection" size={34} />
      </div>
      <div className="shop-offer__copy">
        <h2>{rarityLabels[offer.minimumRarity].toUpperCase()} КАРТКА</h2>
        <p><strong>Гарантовано:</strong> {rarityLabels[offer.minimumRarity]}</p>
        <p className="shop-offer__possible">
          <strong>Може випасти:</strong>{" "}
          {higherRarities.length ? higherRarities.map((rarity) => rarityLabels[rarity]).join(" / ") : "—"}
        </p>
        {canAfford === false ? <span className="shop-offer__unavailable">Недостатньо {currencyLabel}</span> : null}
      </div>
      <button
        aria-label={`Придбати за ${offer.price} ${currencyLabel}`}
        className="shop-offer__purchase"
        disabled={disabled || canAfford !== true}
        onClick={onPurchase}
        type="button"
      >
        <AppIcon name={offer.currency} size={20} />
        <strong>{purchasing ? "…" : offer.price}</strong>
      </button>
    </article>
  );
}
