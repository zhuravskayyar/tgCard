import { useState } from "react";
import type { CardRarity, HolidayBundlePurchaseResponse, HolidayShopBundle, HolidayShopEvent } from "@cardastika/shared";
import { useHolidayShop } from "../hooks/useHolidayShop";
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

const purchaseErrorMessages: Record<string, string> = {
  insufficient_silver: "Недостатньо срібла",
  insufficient_gold: "Недостатньо золота",
  holiday_not_active: "Це свято вже минуло.",
  holiday_limit_reached: "Ліміт покупок цього набору вичерпано.",
  bundle_unavailable: "Карти цього набору тимчасово недоступні.",
  bundle_not_found: "Цей набір більше не доступний.",
  database_unavailable: "Магазин тимчасово недоступний.",
};

/** UTC calendar day as DD.MM, the same day boundary the server uses. */
function formatDay(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function holidayDates(holiday: HolidayShopEvent) {
  if (!holiday.active) return `Відкриється ${formatDay(new Date(holiday.startsAt))}`;
  return `Діє до ${formatDay(new Date(Date.parse(holiday.endsAt) - 1))} включно`;
}

interface HolidayBundlePanelProps {
  active: boolean;
  availableBalance?: number;
  bundle: HolidayShopBundle;
  disabled: boolean;
  onPurchase: () => void;
  purchasing: boolean;
}

function HolidayBundlePanel({ active, availableBalance, bundle, disabled, onPurchase, purchasing }: HolidayBundlePanelProps) {
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const soldOut = bundle.purchased >= bundle.purchaseLimit;
  const shortage = typeof availableBalance === "number" ? Math.max(0, bundle.price - availableBalance) : null;
  const currencyLabel = bundle.currency === "silver" ? "срібла" : "золота";

  function handlePurchaseClick() {
    if (disabled || !active || soldOut) return;
    if (!bundle.canAfford) {
      if (shortage !== null && shortage > 0) setInsufficientOpen(true);
      return;
    }
    onPurchase();
  }

  return (
    <>
      <article className={`shop-offer shop-offer--${bundle.rarity} shop-offer--shelf-compact`}>
        <div className="shop-offer__summary">
          <div className="shop-offer__symbol" aria-hidden="true">
            <span className="shop-pack-body">
              <img alt="" className="shop-offer__artwork" src="/assets/ui/shop/stall/pack-noseal-v3.webp" />
              <span aria-hidden="true" className={`shop-pack-foil shop-pack-foil--${bundle.rarity}`} /><span aria-hidden="true" className={`shop-pack-gilt shop-pack-gilt--${bundle.rarity}`} />
              <img alt="" className={`shop-pack-seal shop-pack-seal--${bundle.rarity}`} src="/assets/ui/shop/stall/pack-seal-v2.webp" />
              <span aria-hidden="true" className={`shop-pack-sheen shop-pack-sheen--${bundle.rarity}`} />
            </span>
          </div>
          <div className="shop-offer__copy">
            <h3>{bundle.displayName}</h3>
            <p className="shop-offer__guarantee">{`${rarityLabels[bundle.rarity]} · Карт у наборі: ${bundle.cardCount}`}</p>
            <p className="shop-offer__guarantee">{`Куплено: ${bundle.purchased} з ${bundle.purchaseLimit}`}</p>
            <button
              aria-label={soldOut ? "Ліміт вичерпано" : !active ? "Скоро" : `Купити ${bundle.displayName} за ${bundle.price} ${currencyLabel}`}
              className={`shop-offer__purchase shop-offer__purchase--${bundle.currency}`}
              disabled={disabled || !active || soldOut}
              onClick={handlePurchaseClick}
              type="button"
            >
              {purchasing ? <span>Купуємо…</span> : soldOut ? <span>Ліміт вичерпано</span> : !active ? <span>Скоро</span> : <><span>Купити</span><CurrencyIcon kind={bundle.currency} /><strong>{bundle.price}</strong></>}
            </button>
          </div>
        </div>
      </article>
      {insufficientOpen && shortage !== null && shortage > 0 ? (
        <ShopInsufficientFundsModal currency={bundle.currency} onClose={() => setInsufficientOpen(false)} shortage={shortage} />
      ) : null}
    </>
  );
}

interface HolidayShopSectionProps {
  balance?: { gold: number; silver: number };
  onPurchased: (result: HolidayBundlePurchaseResponse) => void;
}

export function HolidayShopSection({ balance, onPurchased }: HolidayShopSectionProps) {
  const { purchase, purchaseErrorCode, purchasingBundleId, retry, state } = useHolidayShop();

  if (state.status === "loading") return <div className="shop-state">Завантаження свят…</div>;
  if (state.status === "unavailable") return <div className="shop-state">Свята доступні після запуску через Telegram.</div>;
  if (state.status === "error") {
    return <div className="shop-state shop-state--error"><span>Не вдалося завантажити свята.</span><button onClick={retry} type="button">Повторити</button></div>;
  }

  return (
    <div className="shop-sections">
      {state.data.holidays.length ? state.data.holidays.map((holiday) => (
        <section aria-label={holiday.displayName} className="shop-base-offers shop-holiday" key={holiday.id}>
          <div className="shop-section-heading">
            <span aria-hidden="true" />
            <h2>{holiday.displayName}</h2>
            <span aria-hidden="true" />
          </div>
          <p className="shop-holiday__note">{holidayDates(holiday)}</p>
          <p className="shop-holiday__note">{holiday.description}</p>
          {holiday.bundles.map((bundle) => (
            <HolidayBundlePanel
              active={holiday.active}
              availableBalance={balance?.[bundle.currency]}
              bundle={bundle}
              disabled={purchasingBundleId !== null}
              key={bundle.id}
              onPurchase={() => void purchase(bundle.id).then((result) => { if (result) onPurchased(result); })}
              purchasing={purchasingBundleId === bundle.id}
            />
          ))}
        </section>
      )) : <div className="shop-inline-empty">Святкові набори з’являться тут за календарем свят.</div>}
      {purchaseErrorCode ? <p className="shop-error" role="alert">{purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося виконати покупку."}</p> : null}
    </div>
  );
}
