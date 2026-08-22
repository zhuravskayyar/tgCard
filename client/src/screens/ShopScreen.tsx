import { useState } from "react";
import type { PlayerBalance, ShopPurchaseResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { ShopOfferPanel } from "../components/ShopOfferPanel";
import { ShopRewardReveal } from "../components/ShopRewardReveal";
import { useShop } from "../hooks/useShop";
import type { PlayerSummaryState } from "../types/player";

interface ShopScreenProps {
  onBack: () => void;
  onBalanceChange: (balance: PlayerBalance) => void;
  playerSummaryState: PlayerSummaryState;
}

const purchaseErrorMessages: Record<string, string> = {
  insufficient_silver: "Недостатньо срібла",
  insufficient_gold: "Недостатньо золота",
  reward_policy_unavailable: "Магазин очікує затвердження шансів випадіння.",
  reward_unavailable: "Для цієї пропозиції поки немає доступних карт.",
  database_unavailable: "Магазин тимчасово недоступний.",
  shop_request_failed: "Не вдалося виконати покупку.",
};

export function ShopScreen({ onBack, onBalanceChange, playerSummaryState }: ShopScreenProps) {
  const { catalogState, purchase, purchaseErrorCode, purchasingOfferId, retryCatalog } = useShop();
  const [reveal, setReveal] = useState<ShopPurchaseResponse | null>(null);

  if (reveal) {
    return (
      <ShopRewardReveal
        deckChanged={reveal.deckChanged}
        onContinue={() => setReveal(null)}
        reward={reveal.reward}
      />
    );
  }

  async function handlePurchase(offerId: string) {
    const result = await purchase(offerId);
    if (!result) return;
    onBalanceChange(result.balance);
    setReveal(result);
  }

  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
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
              const canAfford = player ? player[offer.currency] >= offer.price : null;
              return (
                <ShopOfferPanel
                  canAfford={canAfford}
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
      <p className="shop-odds-note">Точні шанси рідкості ще не затверджені й не відображаються.</p>
    </section>
  );
}
