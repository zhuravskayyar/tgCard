import { useState, type CSSProperties } from "react";
import type { ShopBundleOffer } from "@cardastika/shared";
import type { ShopBundle } from "../shop/shopBundles";
import { CurrencyIcon } from "./CurrencyDisplay";
import { ShopInsufficientFundsModal } from "./ShopInsufficientFundsModal";

interface ShopBundleBannerProps {
  availableBalance?: number;
  bundle: ShopBundle;
  disabled: boolean;
  offer: ShopBundleOffer;
  onPurchase: () => void;
  purchasing: boolean;
}

export function ShopBundleBanner({ availableBalance, bundle, disabled, offer, onPurchase, purchasing }: ShopBundleBannerProps) {
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const shortage = typeof availableBalance === "number" ? Math.max(0, offer.price - availableBalance) : null;
  const style = { "--shop-bundle-art": `url("${bundle.art}")` } as CSSProperties;

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
      <article className={`shop-bundle-banner shop-bundle-banner--${bundle.theme}`} style={style}>
        <div aria-hidden="true" className="shop-bundle-banner__thumbnail">
          <img alt="" src={bundle.thumbnail} />
        </div>
        <div className="shop-bundle-banner__copy">
          <h3>{bundle.title}</h3>
          <p>{bundle.description}</p>
          <button
            aria-label={`Купити ${bundle.title.toLowerCase()} за ${offer.price} золота`}
            className="shop-bundle-banner__purchase shop-bundle-banner__purchase--gold"
            disabled={disabled}
            onClick={handlePurchaseClick}
            type="button"
          >
            {purchasing ? <span>Купуємо…</span> : <><span>Купити за</span><CurrencyIcon kind="gold" /><strong>{offer.price}</strong></>}
          </button>
        </div>
      </article>
      {insufficientOpen && shortage !== null && shortage > 0 ? (
        <ShopInsufficientFundsModal currency="gold" onClose={() => setInsufficientOpen(false)} shortage={shortage} />
      ) : null}
    </>
  );
}
