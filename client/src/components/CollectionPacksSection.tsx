import { useEffect, useState } from "react";
import type { CardRarity, CollectionPackPurchaseResponse } from "@cardastika/shared";
import { CARD_RARITIES } from "@cardastika/shared";
import { useCollectionPacks } from "../hooks/useCollectionPacks";
import { CurrencyIcon } from "./CurrencyDisplay";
import { ShopInsufficientFundsModal } from "./ShopInsufficientFundsModal";

const purchaseErrorMessages: Record<string, string> = {
  insufficient_gold: "Недостатньо золота",
  pack_not_active: "Ця колекція вже не продається цього тижня.",
  pack_limit_reached: "Цього тижня цю колекцію вже куплено.",
  price_changed: "Ціна змінилася. Перевірте її ще раз.",
  collection_complete: "Усі карти цієї колекції вже зібрано.",
  bundle_unavailable: "Карти цього набору тимчасово недоступні.",
  bundle_not_found: "Цей набір більше не доступний.",
  database_unavailable: "Магазин тимчасово недоступний.",
};

const rarityRank = new Map<string, number>(CARD_RARITIES.map((rarity, index) => [rarity, index]));

function formatRemaining(endsAt: string, now: number) {
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor(remaining % 86_400_000 / 3_600_000);
  return `${days} д ${hours} год`;
}

/** «Повернеться через 5 тижнів» with the right Ukrainian plural; literal branches keep every phrase translatable. */
function returnsLabel(weeks: number) {
  const lastTwo = weeks % 100;
  const last = weeks % 10;
  return last === 1 && lastTwo !== 11
    ? `Повернеться через ${weeks} тиждень`
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? `Повернеться через ${weeks} тижні`
      : `Повернеться через ${weeks} тижнів`;
}

interface PackOfferPanelProps {
  availableGold?: number;
  /** Completion bonus text of the collection, as on the collections screen. */
  bonus?: string;
  /** Every card of the set is discovered: the offer reads «Зібрано» and cannot be bought. */
  collected?: boolean;
  details: string[];
  disabled: boolean;
  onPurchase: () => void;
  price: number;
  purchasing: boolean;
  rarity: CardRarity;
  soldOut: boolean;
  title: string;
  canAfford: boolean;
  /** Painted wax seal with the pack's own emblem; its colour is baked in, so no rarity tint. */
  sealSrc?: string;
}

/** Same painted pack shelf as the holiday bundles; only the copy differs. */
function PackOfferPanel({ availableGold, bonus, canAfford, collected = false, details, disabled, onPurchase, price, purchasing, rarity, sealSrc, soldOut, title }: PackOfferPanelProps) {
  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const shortage = typeof availableGold === "number" ? Math.max(0, price - availableGold) : null;

  function handlePurchaseClick() {
    if (disabled || soldOut || collected) return;
    if (!canAfford) {
      if (shortage !== null && shortage > 0) setInsufficientOpen(true);
      return;
    }
    onPurchase();
  }

  return (
    <>
      <article className={`shop-offer shop-offer--${rarity} shop-offer--shelf-compact${purchasing ? " shop-offer--purchasing" : ""}`}>
        <div className="shop-offer__summary">
          <div className="shop-offer__symbol" aria-hidden="true">
            <span className="shop-pack-body">
              <img alt="" className="shop-offer__artwork" src="/assets/ui/shop/stall/pack-noseal-v3.webp" />
              <span aria-hidden="true" className={`shop-pack-foil shop-pack-foil--${rarity}`} /><span aria-hidden="true" className={`shop-pack-gilt shop-pack-gilt--${rarity}`} />
              {sealSrc
                ? <img alt="" className="shop-pack-seal shop-pack-seal--emblem" src={sealSrc} />
                : <img alt="" className={`shop-pack-seal shop-pack-seal--${rarity}`} src="/assets/ui/shop/stall/pack-seal-v2.webp" />}
              <span aria-hidden="true" className={`shop-pack-sheen shop-pack-sheen--${rarity}`} /><span aria-hidden="true" className="shop-pack-glint" />
            </span>
          </div>
          <div className="shop-offer__copy">
            <h3>{title}</h3>
            {bonus ? <p className="shop-offer__guarantee shop-offer__bonus">Бонус: {bonus}</p> : null}
            {details.map((line) => <p className="shop-offer__guarantee" key={line}>{line}</p>)}
            <button
              aria-label={collected ? "Зібрано" : soldOut ? "Ліміт вичерпано" : `Купити ${title} за ${price} золота`}
              className="shop-offer__purchase shop-offer__purchase--gold"
              data-ready={!disabled && !soldOut && !collected && canAfford ? "" : undefined}
              disabled={disabled || soldOut || collected}
              onClick={handlePurchaseClick}
              type="button"
            >
              {purchasing ? <span>Купуємо…</span> : collected ? <span>Зібрано</span> : soldOut ? <span>Ліміт вичерпано</span> : <><span>Купити</span><CurrencyIcon kind="gold" /><strong>{price}</strong></>}
            </button>
          </div>
        </div>
      </article>
      {insufficientOpen && shortage !== null && shortage > 0 ? (
        <ShopInsufficientFundsModal currency="gold" onClose={() => setInsufficientOpen(false)} shortage={shortage} />
      ) : null}
    </>
  );
}

interface CollectionPacksSectionProps {
  balance?: { gold: number; silver: number };
  onPurchased: (result: CollectionPackPurchaseResponse) => void;
  onSelectPack: (packId: string) => void;
  selectedPackId: string | null;
}

/** «Колекції тижня»: two collection packs rotate every ISO week, so every collection can be completed. */
export function CollectionPacksSection({ balance, onPurchased, onSelectPack, selectedPackId }: CollectionPacksSectionProps) {
  const { purchase, purchaseErrorCode, purchasingOfferId, retry, state } = useCollectionPacks();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (state.status === "loading") return <div className="shop-state">Завантаження колекцій тижня…</div>;
  if (state.status === "unavailable") return null;
  if (state.status === "error") {
    return <div className="shop-state shop-state--error"><span>Не вдалося завантажити колекції тижня.</span><button onClick={retry} type="button">Повторити</button></div>;
  }
  if (!state.data.packs.length) return null;

  const many = state.data.packs.length > 1;
  const selectedPack = state.data.packs.find((pack) => pack.id === selectedPackId) ?? state.data.packs[0]!;
  const buy = (offerId: string, price: number) => void purchase(offerId, price).then((result) => { if (result) onPurchased(result); });
  const highest = (rarities: CardRarity[]) => rarities.reduce((best, rarity) => ((rarityRank.get(rarity) ?? 0) > (rarityRank.get(best) ?? 0) ? rarity : best), rarities[0] ?? "epic");
  const packRarity = highest(selectedPack.setOffers.flatMap((offer) => offer.cards.map((card) => card.rarity)));

  return (
    <section aria-label="Колекції тижня" className="shop-base-offers shop-holiday">
      <div className="shop-section-heading">
        <span aria-hidden="true" />
        <h2>Колекції тижня</h2>
        <span aria-hidden="true" />
      </div>
      <p className="shop-holiday__note shop-collection-intro">
        <span>Щотижня — дві пачки: повний набір видає всі невідкриті карти, випадкова карта спершу обирає нові.</span>
        <span>{` · Оновлення через ${formatRemaining(state.data.endsAt, now)}`}</span>
      </p>
      {state.data.nextWeekPackNames.length ? (
        <p className="shop-holiday__note shop-holiday__schedule">Наступного тижня: {state.data.nextWeekPackNames.map((name, index) => <span key={name}>{index ? " · " : ""}<b>{name}</b></span>)}</p>
      ) : null}
      {many ? <div aria-label="Колекції цього тижня" className="shop-tabs shop-collection-tabs" role="group">
        {state.data.packs.map((pack) => <button
          aria-pressed={pack.id === selectedPack.id}
          className={pack.id === selectedPack.id ? "shop-tab shop-tab--active" : "shop-tab"}
          key={pack.id}
          onClick={() => onSelectPack(pack.id)}
          type="button"
        ><span>{pack.displayName}</span></button>)}
      </div> : null}
      <div aria-label={selectedPack.displayName} className="shop-sections shop-collection-offers" key={selectedPack.id}>
            {!many ? <h3 className="shop-holiday__note">{selectedPack.displayName}</h3> : null}
            <p className="shop-holiday__note shop-collection-pack-description">
              {selectedPack.description}<span>{` · ${returnsLabel(selectedPack.returnsInWeeks)}`}</span>
            </p>
            {selectedPack.setOffers.map((offer) => {
              const discovered = offer.cards.filter((card) => card.discovered).length;
              const partial = offer.missingCount > 0 && offer.missingCount < offer.cards.length;
              return (
                <PackOfferPanel
                  availableGold={balance?.gold}
                  canAfford={offer.canAfford}
                  bonus={offer.bonusLabel}
                  collected={offer.cards.length > 0 && offer.missingCount === 0}
                  details={[
                    `Відкрито: ${discovered} з ${offer.cards.length}`,
                    `Куплено: ${offer.purchased} з ${offer.purchaseLimit}`,
                  ]}
                  disabled={purchasingOfferId !== null}
                  key={offer.id}
                  onPurchase={() => buy(offer.id, offer.price)}
                  price={offer.price}
                  sealSrc={`/assets/ui/shop/stall/seals/pack-seal-${selectedPack.id}.webp`}
                  purchasing={purchasingOfferId === offer.id}
                  rarity={highest(offer.cards.map((card) => card.rarity))}
                  soldOut={offer.purchased >= offer.purchaseLimit}
                  title={partial ? `Докупити відсутні (${offer.missingCount}) · ${offer.collectionName}` : `Повна колекція · ${offer.collectionName}`}
                />
              );
            })}
            <PackOfferPanel
              availableGold={balance?.gold}
              canAfford={selectedPack.randomOffer.canAfford}
              details={["Нові види — першими", `Відкрито: ${selectedPack.randomOffer.discoveredCount} з ${selectedPack.randomOffer.totalCount}`]}
              disabled={purchasingOfferId !== null}
              onPurchase={() => buy(selectedPack.randomOffer.id, selectedPack.randomOffer.price)}
              price={selectedPack.randomOffer.price}
              sealSrc={`/assets/ui/shop/stall/seals/pack-seal-${selectedPack.id}.webp`}
              purchasing={purchasingOfferId === selectedPack.randomOffer.id}
              rarity={packRarity}
              soldOut={false}
              title="Випадкова карта"
            />
      </div>
      {purchaseErrorCode ? <p className="shop-error" role="alert">{purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося виконати покупку."}</p> : null}
    </section>
  );
}
