import type { CSSProperties } from "react";
import type { CardRarity, ShopOffer } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CardQualityBadge } from "./CardQualityBadge";
import { CurrencyIcon } from "./CurrencyDisplay";

const rarityLabels: Record<CardRarity, string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

const shopOfferBackgrounds: Record<CardRarity, string> = {
  common: "/assets/ui/shop/shop_common_steel.webp",
  uncommon: "/assets/ui/shop/shop_uncommon_green.webp",
  rare: "/assets/ui/shop/shop_rare_cyan.webp",
  epic: "/assets/ui/shop/shop_epic_purple.webp",
  legendary: "/assets/ui/shop/shop_legendary_red.webp",
  mythic: "/assets/ui/shop/shop_shards_astral.webp",
};

interface ShopOfferPanelProps {
  availableBalance?: number;
  dataTutorialTarget?: string;
  disabled: boolean;
  offer: ShopOffer;
  onPurchase: () => void;
  purchasing: boolean;
}

export function ShopOfferPanel({
  availableBalance,
  dataTutorialTarget,
  disabled,
  offer,
  onPurchase,
  purchasing,
}: ShopOfferPanelProps) {
  const currencyLabel = offer.currency === "silver" ? "срібла" : "золота";
  const formatPercentage = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
  const leadUpgrade = offer.upgrades[0];
  const shortage = typeof availableBalance === "number" ? Math.max(0, offer.price - availableBalance) : null;
  const style = {
    "--offer-background": `url("${shopOfferBackgrounds[offer.guaranteedRarity]}")`,
  } as CSSProperties;

  return (
    <article className={`shop-offer shop-offer--${offer.guaranteedRarity}`} style={style}>
      <div className="shop-offer__summary">
        <div className="shop-offer__symbol" aria-hidden="true">
          <CardQualityBadge rarity={offer.guaranteedRarity} size="medium" />
        </div>
        <div className="shop-offer__copy">
          <span className="shop-offer__eyebrow">Що отримуєш</span>
          <h3>{rarityLabels[offer.guaranteedRarity]} картка</h3>
          <p className="shop-offer__guarantee">
            <strong>Гарантовано</strong> {rarityLabels[offer.guaranteedRarity].toLowerCase()} або краще
          </p>
        </div>
      </div>

      {offer.upgrades.length ? (
        <details className="shop-offer__details">
          <summary>
            <span className="shop-offer__chance-badge">{formatPercentage(leadUpgrade?.chance ?? 0)}%</span>
            <span className="shop-offer__chance-copy"><strong>Шанс {leadUpgrade ? rarityLabels[leadUpgrade.rarity].toLowerCase() : "рідкіснішої карти"}</strong><small>+{formatPercentage(leadUpgrade?.increment ?? 0)}% після невдачі</small></span>
            <span className="shop-offer__details-link">Детальніше <AppIcon name="chevron" size={13} /></span>
          </summary>
          <dl className="shop-offer__upgrades">
            {offer.upgrades.map((upgrade) => (
              <div key={upgrade.rarity}>
                <dt>{rarityLabels[upgrade.rarity]}</dt>
                <dd><strong>{formatPercentage(upgrade.chance)}%</strong> зараз</dd>
                <dd className="shop-offer__increment">Приріст: +{formatPercentage(upgrade.increment)}%</dd>
              </div>
            ))}
          </dl>
          {leadUpgrade ? (
            <div className="shop-offer__pity">
              <div><span>Поточний прогрес pity</span><strong>{formatPercentage(leadUpgrade.chance)}%</strong></div>
              <span className="shop-offer__pity-track"><span style={{ width: `${Math.min(100, Math.max(0, leadUpgrade.chance))}%` }} /></span>
            </div>
          ) : null}
        </details>
      ) : null}

      <div className="shop-offer__footer">
        <span className="shop-offer__footer-note">Одна покупка · одна карта</span>
        <button
          aria-label={offer.canAfford ? `Придбати за ${offer.price} ${currencyLabel}` : shortage ? `Не вистачає ${shortage} ${currencyLabel}` : `Потрібно ${offer.price} ${currencyLabel}`}
          className="shop-offer__purchase"
          data-tutorial-target={dataTutorialTarget}
          disabled={disabled || !offer.canAfford}
          onClick={onPurchase}
          type="button"
        >
          {purchasing ? <span>Купуємо…</span> : offer.canAfford ? <><span>Купити за</span><CurrencyIcon kind={offer.currency} /><strong>{offer.price}</strong></> : <><span>{shortage ? `Не вистачає ${shortage}` : `Потрібно ${offer.price}`}</span><CurrencyIcon kind={offer.currency} /></>}
        </button>
      </div>
    </article>
  );
}
