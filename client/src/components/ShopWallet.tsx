import type { ReactNode } from "react";
import { getUiNumberLocale } from "../i18n";

export interface ShopWalletItem {
  id: string;
  icon: ReactNode;
  label: string;
  value?: number;
}

interface ShopWalletProps {
  items: ShopWalletItem[];
}

export function ShopWallet({ items }: ShopWalletProps) {
  if (!items.length) return null;

  return (
    <div aria-label="Гаманець магазину" className="shop-wallet">
      <span className="shop-wallet__label">Доступно</span>
      <div className="shop-wallet__items">
        {items.map((item) => (
          <div className={`shop-wallet__item shop-wallet__item--${item.id}`} key={item.id}>
            <span className="shop-wallet__icon" aria-hidden="true">{item.icon}</span>
            <span className="shop-wallet__copy">
              <span>{item.label}</span>
              <strong>{item.value === undefined ? "—" : new Intl.NumberFormat(getUiNumberLocale()).format(item.value)}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
