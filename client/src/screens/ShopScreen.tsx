import { useState } from "react";
import type { PlayerBalance, ShopPurchaseResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { ShopOfferPanel } from "../components/ShopOfferPanel";
import { ShopRewardReveal } from "../components/ShopRewardReveal";
import { useShop } from "../hooks/useShop";

interface ShopScreenProps {
  onBack: () => void;
  onBalanceChange: (balance: PlayerBalance) => void;
}

const purchaseErrorMessages: Record<string, string> = {
  insufficient_silver: "Недостатньо срібла",
  insufficient_gold: "Недостатньо золота",
  reward_unavailable: "Для цієї пропозиції поки немає доступних карт.",
  database_unavailable: "Магазин тимчасово недоступний.",
  shop_request_failed: "Не вдалося виконати покупку.",
};

export function ShopScreen({ onBack, onBalanceChange }: ShopScreenProps) {
  const { catalogState, purchase, purchaseErrorCode, purchasingOfferId, retryCatalog } = useShop();
  const [reveal, setReveal] = useState<ShopPurchaseResponse | null>(null);

  if (reveal) {
    return (
      <ShopRewardReveal
        deckChanged={reveal.deckChanged}
        deckPower={reveal.deckPower}
        onContinue={() => setReveal(null)}
        previousDeckPower={reveal.previousDeckPower}
        reward={reveal.reward}
      />
    );
  }

  async function handlePurchase(offerId: string) {
    const result = await purchase(offerId);
    if (!result) return;
    onBalanceChange(result.updatedBalance);
    setReveal(result);
  }

  const errorMessage = purchaseErrorCode
    ? purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося виконати покупку."
    : null;

  return (
    <section className="shop-screen">
      <header className="shop-heading">
        <button aria-label="Назад" className="shop-back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>Крамниця карт</span>
          <h1>МАГАЗИН</h1>
        </div>
      </header>

      <nav className="shop-tabs" aria-label="Розділи магазину">
        <button aria-current="page" type="button">Карти</button>
        <button disabled type="button">Підсилення</button>
        <button disabled type="button">Готові набори</button>
      </nav>

      {catalogState.status === "loading" ? <div className="shop-state">Завантаження пропозицій…</div> : null}
      {catalogState.status === "unavailable" ? (
        <div className="shop-state">Магазин доступний після запуску через Telegram.</div>
      ) : null}
      {catalogState.status === "error" ? (
        <div className="shop-state shop-state--error">
          <span>Не вдалося завантажити магазин.</span>
          <button onClick={retryCatalog} type="button">Повторити</button>
        </div>
      ) : null}

      {catalogState.status === "ready" ? (
        <div className="shop-sections">
          <section className="shop-base-offers" aria-label="Постійні пропозиції карт">
            {catalogState.catalog.offers.map((offer) => {
              return (
                <ShopOfferPanel
                  disabled={purchasingOfferId !== null}
                  key={offer.id}
                  offer={offer}
                  onPurchase={() => void handlePurchase(offer.id)}
                  purchasing={purchasingOfferId === offer.id}
                />
              );
            })}
          </section>
        </div>
      ) : null}

      {errorMessage ? <p className="shop-error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}
