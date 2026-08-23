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

interface ShopSectionHeadingProps {
  children: string;
}

function ShopSectionHeading({ children }: ShopSectionHeadingProps) {
  return (
    <div className="shop-section-heading">
      <span aria-hidden="true" />
      <h2>{children}</h2>
      <span aria-hidden="true" />
    </div>
  );
}

export function ShopScreen({ onBack, onBalanceChange }: ShopScreenProps) {
  const { catalogState, purchase, purchaseErrorCode, purchasingOfferId, retryCatalog } = useShop();
  const [reveal, setReveal] = useState<ShopPurchaseResponse | null>(null);

  if (reveal) {
    return (
      <ShopRewardReveal
        collectionCompleted={reveal.collectionCompleted}
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

      <div className="shop-category" aria-label="Поточний розділ магазину">
        <AppIcon name="collection" size={20} />
        <span>Карти стихій</span>
      </div>

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
          <section className="shop-featured" aria-labelledby="shop-featured-heading">
            <div id="shop-featured-heading">
              <ShopSectionHeading>Акційні набори</ShopSectionHeading>
            </div>
            <div className="shop-featured__empty">
              <div className="shop-featured__icon" aria-hidden="true">
                <AppIcon name="collection" size={30} />
              </div>
              <div>
                <strong>Немає активних наборів</strong>
                <p>Нові пропозиції з’являться тут, щойно стануть доступними.</p>
              </div>
              <span>Невдовзі</span>
            </div>
          </section>

          <section className="shop-base-offers" aria-label="Постійні пропозиції карт">
            <ShopSectionHeading>По одній карті</ShopSectionHeading>
            {catalogState.catalog.offers.length ? (
              catalogState.catalog.offers.map((offer) => {
                return (
                  <ShopOfferPanel
                    disabled={purchasingOfferId !== null}
                    key={offer.id}
                    offer={offer}
                    onPurchase={() => void handlePurchase(offer.id)}
                    purchasing={purchasingOfferId === offer.id}
                  />
                );
              })
            ) : (
              <div className="shop-inline-empty">Пропозиції карт тимчасово відсутні.</div>
            )}
          </section>

          <aside className="shop-chance-note">
            <span>Бонус до шансу</span>
            <strong>Кожна невдала спроба наближає рідкіснішу карту</strong>
            <p>Поточний шанс і приріст указано окремо в кожній пропозиції.</p>
          </aside>
        </div>
      ) : null}

      {errorMessage ? <p className="shop-error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}
