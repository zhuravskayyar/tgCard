import type { ShopCurrency } from "@cardastika/shared";
import { CurrencyIcon } from "./CurrencyDisplay";

interface ShopInsufficientFundsModalProps {
  currency: ShopCurrency;
  shortage: number;
  onClose: () => void;
}

export function ShopInsufficientFundsModal({ currency, shortage, onClose }: ShopInsufficientFundsModalProps) {
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
