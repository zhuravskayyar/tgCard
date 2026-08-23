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
  disabled: boolean;
  offer: ShopOffer;
  onPurchase: () => void;
  purchasing: boolean;
}

export function ShopOfferPanel({
  disabled,
  offer,
  onPurchase,
  purchasing,
}: ShopOfferPanelProps) {
  const currencyLabel = offer.currency === "silver" ? "срібла" : "золота";
  const formatPercentage = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");

  return (
    <article className={`shop-offer shop-offer--${offer.guaranteedRarity}`}>
      <div className="shop-offer__summary">
        <div className="shop-offer__symbol" aria-hidden="true">
          <AppIcon name="collection" size={32} />
        </div>
        <div className="shop-offer__copy">
          <h3>{rarityLabels[offer.guaranteedRarity]} картка</h3>
          <p className="shop-offer__guarantee">
            <strong>Гарантовано</strong> {rarityLabels[offer.guaranteedRarity].toLowerCase()} або краще
          </p>
        </div>
      </div>

      {offer.upgrades.length ? (
        <details className="shop-offer__details">
          <summary>Шанси отримати рідкіснішу карту</summary>
          <dl className="shop-offer__upgrades">
            {offer.upgrades.map((upgrade) => (
              <div key={upgrade.rarity}>
                <dt>{rarityLabels[upgrade.rarity]}</dt>
                <dd><strong>{formatPercentage(upgrade.chance)}%</strong> зараз</dd>
                <dd className="shop-offer__increment">+{formatPercentage(upgrade.increment)}% після невдачі</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      <div className="shop-offer__footer">
        {!offer.canAfford ? <span className="shop-offer__unavailable">Недостатньо {currencyLabel}</span> : <span />}
        <button
          aria-label={`Придбати за ${offer.price} ${currencyLabel}`}
          className="shop-offer__purchase"
          disabled={disabled || !offer.canAfford}
          onClick={onPurchase}
          type="button"
        >
          <span>{purchasing ? "Купуємо…" : "Купити за"}</span>
          {!purchasing ? <AppIcon name={offer.currency} size={20} /> : null}
          {!purchasing ? <strong>{offer.price}</strong> : null}
        </button>
      </div>
    </article>
  );
}
