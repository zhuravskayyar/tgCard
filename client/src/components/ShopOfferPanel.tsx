import { useState } from "react";
import type { CardRarity, ShopOffer } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CurrencyIcon } from "./CurrencyDisplay";
import { ShopInsufficientFundsModal } from "./ShopInsufficientFundsModal";

const rarityLabels: Record<CardRarity, string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

const upgradeLabels: Record<CardRarity, string> = {
  common: "звичайної",
  uncommon: "незвичайної",
  rare: "рідкісної",
  epic: "епічної",
  legendary: "легендарної",
  mythic: "міфічної",
};

interface ShopOfferPanelProps {
  availableBalance?: number;
  dataTutorialTarget?: string;
  disabled: boolean;
  offer: ShopOffer;
  expanded?: boolean;
  onDetails?: () => void;
  onPurchase: () => void;
  purchasing: boolean;
}

export function ShopOfferPanel({
  availableBalance,
  dataTutorialTarget,
  disabled,
  offer,
  expanded = false,
  onDetails,
  onPurchase,
  purchasing,
}: ShopOfferPanelProps) {
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const currencyLabel = offer.currency === "silver" ? "срібла" : "золота";
  const formatPercentage = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
  const leadUpgrade = offer.upgrades[0];
  const shortage = typeof availableBalance === "number" ? Math.max(0, offer.price - availableBalance) : null;

  function handlePurchaseClick() {
    if (disabled) return;
    if (!offer.canAfford) {
      if (shortage !== null && shortage > 0) setInsufficientOpen(true);
      return;
    }
    onPurchase();
  }

  return (
    <>
      <article className={`shop-offer shop-offer--${offer.guaranteedRarity}`}>
      <div className="shop-offer__summary">
        <div className="shop-offer__symbol" aria-hidden="true">
          <span className="shop-pack-body">
          <img alt="" className="shop-offer__artwork" src="/assets/ui/shop/stall/pack-noseal-v3.webp" />
          <span aria-hidden="true" className={`shop-pack-foil shop-pack-foil--${offer.guaranteedRarity}`} /><span aria-hidden="true" className={`shop-pack-gilt shop-pack-gilt--${offer.guaranteedRarity}`} />
          <img alt="" className={`shop-pack-seal shop-pack-seal--${offer.guaranteedRarity}`} src="/assets/ui/shop/stall/pack-seal-v2.webp" />
          <span aria-hidden="true" className={`shop-pack-sheen shop-pack-sheen--${offer.guaranteedRarity}`} />
          </span>
        </div>
        <div className="shop-offer__copy">
          <h3>{rarityLabels[offer.guaranteedRarity]} карта</h3>
          <p className="shop-offer__guarantee">Одна карта в пакунку</p>
          {!expanded && leadUpgrade ? (
            <p className="shop-offer__chance">
              <span className="shop-offer__chance-badge">{formatPercentage(leadUpgrade.chance)}%</span>
              <span>шанс {upgradeLabels[leadUpgrade.rarity]}</span>
            </p>
          ) : null}
          {expanded ? (
            <div className="shop-offer__details">
              <p className="shop-offer__odds-note">Ваші поточні шанси:</p>
              <p className="shop-offer__odds-note">Гарантовано: {rarityLabels[offer.guaranteedRarity].toLowerCase()} карта або вища рідкість.</p>
              <dl className="shop-offer__upgrades">
                {offer.upgrades.map((upgrade) => (
                  <div key={upgrade.rarity}>
                    <dt>{rarityLabels[upgrade.rarity]}</dt>
                    <dd><strong>{formatPercentage(upgrade.chance)}%</strong> зараз</dd>
                    <dd className="shop-offer__increment">Приріст шансу: +{formatPercentage(upgrade.increment)}%</dd>
                  </div>
                ))}
              </dl>
              <p className="shop-offer__odds-note">Шанс зростає, якщо вища рідкість не випала.</p>
            </div>
          ) : null}
          {onDetails ? (
            <button className="shop-offer__details-button shop-offer__details-link" onClick={onDetails} type="button">
              Детальніше <AppIcon name="chevron" size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="shop-offer__footer">
        <button
          aria-label={`Купити за ${offer.price} ${currencyLabel}`}
          className={`shop-offer__purchase shop-offer__purchase--${offer.currency}`}
          data-tutorial-target={dataTutorialTarget}
          disabled={disabled}
          onClick={handlePurchaseClick}
          type="button"
        >
          {purchasing ? <span>Купуємо…</span> : <><span>Купити за</span><CurrencyIcon kind={offer.currency} /><strong>{offer.price}</strong></>}
        </button>
      </div>
      </article>
      {insufficientOpen && shortage !== null && shortage > 0 ? (
        <ShopInsufficientFundsModal currency={offer.currency} onClose={() => setInsufficientOpen(false)} shortage={shortage} />
      ) : null}
    </>
  );
}
