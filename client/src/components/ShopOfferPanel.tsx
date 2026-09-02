import { useState, type CSSProperties } from "react";
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
  uncommon: "/assets/ui/shop/shop_uncommon_scout.png",
  rare: "/assets/ui/shop/shop_rare_cyan.webp",
  epic: "/assets/ui/shop/shop_epic_shadow.png",
  legendary: "/assets/ui/shop/shop_legendary_dragon.png",
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

interface InsufficientFundsModalProps {
  currency: "gold" | "silver";
  shortage: number;
  onClose: () => void;
}

function InsufficientFundsModal({ currency, shortage, onClose }: InsufficientFundsModalProps) {
  const currencyLabel = currency === "silver" ? "срібла" : "золота";

  return (
    <div className="shop-insufficient-modal" role="dialog" aria-modal="true" aria-labelledby="shop-insufficient-modal-title">
      <button aria-label="Закрити" className="shop-insufficient-modal__backdrop" onClick={onClose} type="button" />
      <section className="shop-insufficient-modal__dialog">
        <span className="shop-insufficient-modal__eyebrow">Магазин</span>
        <h2 id="shop-insufficient-modal-title">Недостатньо ресурсів</h2>
        <p>
          Потрібно ще <strong>{shortage}</strong> <CurrencyIcon kind={currency} size={20} /> {currencyLabel}.
        </p>
        <button className="shop-insufficient-modal__ok" onClick={onClose} type="button">ОК</button>
      </section>
    </div>
  );
}

export function ShopOfferPanel({
  availableBalance,
  dataTutorialTarget,
  disabled,
  offer,
  onPurchase,
  purchasing,
}: ShopOfferPanelProps) {
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const currencyLabel = offer.currency === "silver" ? "срібла" : "золота";
  const formatPercentage = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "");
  const leadUpgrade = offer.upgrades[0];
  const shortage = typeof availableBalance === "number" ? Math.max(0, offer.price - availableBalance) : null;
  const style = {
    "--offer-background": `url("${shopOfferBackgrounds[offer.guaranteedRarity]}")`,
  } as CSSProperties;

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
      <article className={`shop-offer shop-offer--${offer.guaranteedRarity}`} style={style}>
      <div className="shop-offer__summary">
        <div className="shop-offer__symbol" aria-hidden="true">
          <img alt="" className="shop-offer__artwork" src={shopOfferBackgrounds[offer.guaranteedRarity]} />
          <CardQualityBadge rarity={offer.guaranteedRarity} size="tiny" />
        </div>
        <div className="shop-offer__copy">
          <h3>{rarityLabels[offer.guaranteedRarity]} картка</h3>
          {leadUpgrade ? (
            <p className="shop-offer__chance">
              <span className="shop-offer__chance-badge">{formatPercentage(leadUpgrade.chance)}%</span>
              <span>шанс {rarityLabels[leadUpgrade.rarity].toLowerCase()}</span>
            </p>
          ) : null}
          {offer.upgrades.length ? (
            <details className="shop-offer__details">
              <summary><span className="shop-offer__details-link">Детальніше <AppIcon name="chevron" size={13} /></span></summary>
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
        </div>
      </div>

      <div className="shop-offer__footer">
        <span className="shop-offer__footer-note">Одна покупка · одна карта</span>
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
        <InsufficientFundsModal currency={offer.currency} onClose={() => setInsufficientOpen(false)} shortage={shortage} />
      ) : null}
    </>
  );
}
