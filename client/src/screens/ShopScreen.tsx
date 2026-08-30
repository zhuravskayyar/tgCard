import { useState, type CSSProperties } from "react";
import { CARD_RARITIES, type CardRarity, type CollectionCompletionNotice, type LimitedCardRedeemResponse, type ShopPurchaseResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { LimitedCardBanner } from "../components/LimitedCardBanner";
import { LimitedCardReveal } from "../components/LimitedCardReveal";
import { ShopOfferPanel } from "../components/ShopOfferPanel";
import { ShopRewardReveal } from "../components/ShopRewardReveal";
import { useShop } from "../hooks/useShop";
import { CardArtwork } from "../components/CardArtwork";
import { useCardWorkshop } from "../hooks/useCardWorkshop";
import type { CardWorkshopCard } from "@cardastika/shared";
import { getUiNumberLocale } from "../i18n";
import { NicknameSkinShopPanel } from "../components/NicknameSkinShopPanel";
import type { NicknameSkinId, PlayerSummary } from "@cardastika/shared";
import type { PlayerSummaryState } from "../types/player";
import { ShopWallet } from "../components/ShopWallet";

interface ShopScreenProps {
  onBack: () => void;
  onBalanceChange: (balance: Partial<Pick<PlayerSummary, "arenaTokens" | "gold" | "silver">>) => void;
  onCollectionCompleted: (completion: CollectionCompletionNotice) => void;
  onDeckPowerChange: (deckPower: number) => void;
  onEquippedSkinChange: (skinId: NicknameSkinId | null) => void;
  onTutorialPurchase?: () => void;
  onTutorialRevealContinue?: (destination?: { cardId: string; collectionId: string | null }) => void;
  playerSummaryState: PlayerSummaryState;
  nickname: string;
}

const purchaseErrorMessages: Record<string, string> = {
  insufficient_silver: "Недостатньо срібла",
  insufficient_gold: "Недостатньо золота",
  reward_unavailable: "Для цієї пропозиції поки немає доступних карт.",
  database_unavailable: "Магазин тимчасово недоступний.",
  shop_request_failed: "Не вдалося виконати покупку.",
};

const limitedRedeemErrorMessages: Record<string, string> = {
  invalid_promo_code: "Неправильний промокод.",
  limited_card_already_redeemed: "Цей код уже активовано вашим гравцем.",
  limited_event_inactive: "Період акції завершено.",
  database_unavailable: "Лімітована нагорода тимчасово недоступна.",
};

interface ShopSectionHeadingProps {
  children: string;
}

type ShopSection = "cards" | "workshop" | "cosmetics";

const shopTabs: Array<{ icon: "element-cards" | "card-strength" | "inventory"; id: ShopSection; label: string }> = [
  { icon: "element-cards", id: "cards", label: "Карти стихій" },
  { icon: "card-strength", id: "workshop", label: "Майстерня карт" },
  { icon: "inventory", id: "cosmetics", label: "Косметика" },
];

function ShopSectionHeading({ children }: ShopSectionHeadingProps) {
  return (
    <div className="shop-section-heading">
      <span aria-hidden="true" />
      <h2>{children}</h2>
      <span aria-hidden="true" />
    </div>
  );
}

const rarityLabels: Record<CardRarity, string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

const workshopBackgrounds: Record<CardRarity, string> = {
  common: "/assets/ui/shop/shop_common_steel.webp",
  uncommon: "/assets/ui/shop/shop_uncommon_green.webp",
  rare: "/assets/ui/shop/shop_rare_cyan.webp",
  epic: "/assets/ui/shop/shop_epic_purple.webp",
  legendary: "/assets/ui/shop/shop_legendary_red.webp",
  mythic: "/assets/ui/shop/shop_shards_astral.webp",
};

const workshopRarityTones: Record<CardRarity, string> = {
  common: "#7e8994",
  uncommon: "#74b66a",
  rare: "#64bfe8",
  epic: "#be75e8",
  legendary: "#e2874e",
  mythic: "#e9b8ff",
};

const workshopRarityOrder = new Map(CARD_RARITIES.map((rarity, index) => [rarity, index]));

function CardShardMark({ size = 20 }: { size?: number }) {
  return <span className="card-shard-mark"><img alt="" height={size} src="/assets/ui/shop/icon_card_shard_v2.webp" width={size} /></span>;
}

function WorkshopCard({ card, cardShards, crafting, onCraft }: { card: CardWorkshopCard; cardShards: number; crafting: boolean; onCraft: () => void }) {
  const canAfford = cardShards >= card.cost;
  const progress = Math.min(100, Math.max(0, (cardShards / card.cost) * 100));
  const style = {
    "--workshop-background": `url("${workshopBackgrounds[card.rarity]}")`,
    "--workshop-tone": workshopRarityTones[card.rarity],
  } as CSSProperties;
  return <article className={`workshop-card workshop-card--${card.rarity}${canAfford ? " workshop-card--available" : ""}`} style={style}>
    <div className="workshop-card__art"><CardArtwork artKey={card.artKey} cardId={card.cardId} element={card.element} /><span aria-hidden="true" className="workshop-card__rarity-badge"><AppIcon name="deck-power" size={12} /></span></div>
    <div className="workshop-card__copy">
      <div className="workshop-card__title-row"><strong>{card.displayName ?? "Невідома карта"}</strong></div>
      <span className="workshop-card__meta">{rarityLabels[card.rarity]} · Копій: {card.ownedQuantity}</span>
      <div className="workshop-card__progress"><span><strong>{cardShards}</strong> / {card.cost} кристалів</span><span className="workshop-card__progress-track"><span style={{ width: `${progress}%` }} /></span></div>
    </div>
    <div className="workshop-card__purchase"><span className="workshop-card__cost"><CardShardMark size={14} /><strong>{card.cost}</strong></span><button aria-label={canAfford ? `Створити ${card.displayName ?? "карту"}` : `Потрібно ${card.cost} кристалів`} className="workshop-card__craft" disabled={!canAfford || crafting} onClick={onCraft} type="button">{crafting ? "Створення…" : canAfford ? "СТВОРИТИ" : "НЕДОСТАТНЬО"}</button></div>
  </article>;
}

function CardWorkshopSection() {
  const { craft, craftErrorCode, craftingCardId, retry, state } = useCardWorkshop();
  const [rarityFilter, setRarityFilter] = useState<CardRarity | "all">("all");
  const craftErrorMessages: Record<string, string> = {
    insufficient_card_shards: "Недостатньо уламків карт.",
    card_not_in_rotation: "Ця карта вже вийшла з ротації.",
    workshop_unavailable: "Ротація майстерні тимчасово недоступна.",
  };
  const availableRarities = state.status === "ready"
    ? CARD_RARITIES.filter((rarity) => state.data.cards.some((card) => card.rarity === rarity))
    : [];
  const workshopCards = state.status === "ready"
    ? [...state.data.cards]
      .filter((card) => rarityFilter === "all" || card.rarity === rarityFilter)
      .sort((left, right) => {
        const affordableDifference = Number(state.data.cardShards >= right.cost) - Number(state.data.cardShards >= left.cost);
        if (affordableDifference !== 0) return affordableDifference;
        const progressDifference = (state.data.cardShards / left.cost) - (state.data.cardShards / right.cost);
        if (progressDifference !== 0) return progressDifference > 0 ? -1 : 1;
        return (workshopRarityOrder.get(left.rarity) ?? 0) - (workshopRarityOrder.get(right.rarity) ?? 0);
      })
    : [];
  return <section className="card-workshop" aria-labelledby="card-workshop-heading">
    <div className="card-workshop__heading"><div><span>Нова доба — нові фрагменти</span><h2 id="card-workshop-heading">МАЙСТЕРНЯ КАРТ</h2></div></div>
    <ShopWallet items={[{ id: "card-shards", icon: <CardShardMark size={18} />, label: "Кристали майстерні", value: state.status === "ready" ? state.data.cardShards : undefined }]} />
    {state.status === "loading" ? <div className="workshop-state">Завантаження ротації…</div> : null}
    {state.status === "unavailable" ? <div className="workshop-state">Майстерня доступна після запуску через Telegram.</div> : null}
    {state.status === "error" ? <div className="workshop-state workshop-state--error"><span>Не вдалося завантажити майстерню.</span><button onClick={retry} type="button">Повторити</button></div> : null}
    {state.status === "ready" ? <>
      <p className="card-workshop__rotation">6 карт у глобальній ротації · до {new Date(state.data.rotationEndsAt).toLocaleTimeString(getUiNumberLocale(), { hour: "2-digit", minute: "2-digit" })}</p>
      <div aria-label="Фільтр рідкості" className="workshop-filters" role="group">
        <button className={rarityFilter === "all" ? "workshop-filter workshop-filter--active" : "workshop-filter"} onClick={() => setRarityFilter("all")} type="button">Усі</button>
        {availableRarities.map((rarity) => <button className={rarityFilter === rarity ? "workshop-filter workshop-filter--active" : "workshop-filter"} key={rarity} onClick={() => setRarityFilter(rarity)} type="button">{rarityLabels[rarity]}</button>)}
      </div>
      <div className="workshop-list">{workshopCards.map((card) => <WorkshopCard card={card} cardShards={state.data.cardShards} crafting={craftingCardId !== null} key={card.cardId} onCraft={() => void craft(card.cardId)} />)}</div>
    </> : null}
    {craftErrorCode ? <p className="workshop-error" role="alert">{craftErrorMessages[craftErrorCode] ?? "Не вдалося створити карту."}</p> : null}
  </section>;
}

export function ShopScreen({ onBack, onBalanceChange, onCollectionCompleted, onDeckPowerChange, onEquippedSkinChange, onTutorialPurchase, onTutorialRevealContinue, playerSummaryState, nickname }: ShopScreenProps) {
  const { catalogState, limitedRedeemErrorCode, purchase, purchaseErrorCode, purchasingOfferId, redeemLimited, redeemingLimited, retryCatalog } = useShop();
  const [section, setSection] = useState<ShopSection>("cards");
  const [batchPurchasing, setBatchPurchasing] = useState(false);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [reveal, setReveal] = useState<{ offerId: string; purchases: ShopPurchaseResponse[] } | null>(null);
  const [limitedReveal, setLimitedReveal] = useState<LimitedCardRedeemResponse | null>(null);
  const [hiddenLimitedEventId, setHiddenLimitedEventId] = useState<string | null>(null);
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;

  function applyPurchaseResult(result: ShopPurchaseResponse) {
    onBalanceChange(result.updatedBalance);
    if (result.collectionCompleted) onCollectionCompleted(result.collectionCompleted);
    if (result.deckChanged && result.deckPower !== undefined) {
      onDeckPowerChange(result.deckPower);
    }
  }

  async function handleLimitedRedeem(eventId: string, promoCode: string) {
    const result = await redeemLimited(eventId, promoCode);
    if (!result) return;
    if (result.deckChanged && result.deckPower !== undefined) onDeckPowerChange(result.deckPower);
    setLimitedReveal(result);
  }

  if (limitedReveal) {
    return <LimitedCardReveal onContinue={() => setLimitedReveal(null)} reward={limitedReveal.reward} />;
  }

  if (reveal) {
    return (
      <ShopRewardReveal
        canBuyTen={purchaseCount >= 10}
        errorMessage={purchaseErrorCode ? purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося виконати покупку." : null}
        onBuyAgain={() => void handlePurchase(reveal.offerId)}
        onBuyTen={() => void handleBatchPurchase(reveal.offerId)}
        onContinue={() => {
          const reward = reveal.purchases[0]?.reward;
          setReveal(null);
          onTutorialRevealContinue?.(reward ? { cardId: reward.cardId, collectionId: reward.collectionId } : undefined);
        }}
        purchasing={batchPurchasing || purchasingOfferId === reveal.offerId}
        purchases={reveal.purchases}
      />
    );
  }

  async function handlePurchase(offerId: string) {
    const result = await purchase(offerId);
    if (!result) return;
    applyPurchaseResult(result);
    setPurchaseCount((current) => current + 1);
    setReveal({ offerId, purchases: [result] });
    onTutorialPurchase?.();
  }

  async function handleBatchPurchase(offerId: string) {
    if (batchPurchasing) return;
    setBatchPurchasing(true);
    let completed = 0;
    const purchases: ShopPurchaseResponse[] = [];

    try {
      for (let index = 0; index < 10; index += 1) {
        const result = await purchase(offerId);
        if (!result) break;
        completed += 1;
        purchases.push(result);
        applyPurchaseResult(result);
      }

      if (purchases.length) {
        setPurchaseCount((current) => current + completed);
        setReveal({ offerId, purchases });
      }
    } finally {
      setBatchPurchasing(false);
    }
  }

  const errorMessage = purchaseErrorCode
    ? purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося виконати покупку."
    : null;

  return (
    <section className={`shop-screen shop-screen--${section}`}>
      <header className="shop-heading">
        <button aria-label="Назад" className="shop-back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>Крамниця карт</span>
          <h1>МАГАЗИН</h1>
        </div>
      </header>

      <div className="shop-tabs" role="tablist" aria-label="Розділ магазину">
        {shopTabs.map((tab) => (
          <button
            aria-selected={section === tab.id}
            className={section === tab.id ? "shop-tab shop-tab--active" : "shop-tab"}
            key={tab.id}
            onClick={() => setSection(tab.id)}
            role="tab"
            type="button"
          >
            <AppIcon name={tab.icon} size={24} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {section === "cards" ? (
        <ShopWallet items={[
          { id: "silver", icon: <CurrencyIcon kind="silver" size={18} />, label: "Срібло", value: player?.silver },
          { id: "gold", icon: <CurrencyIcon kind="gold" size={18} />, label: "Золото", value: player?.gold },
        ]} />
      ) : null}

      {section === "workshop" ? <CardWorkshopSection /> : null}
      {section === "cosmetics" ? <NicknameSkinShopPanel nickname={nickname} onBalanceChange={onBalanceChange} onEquippedSkinChange={onEquippedSkinChange} /> : null}

      {section === "cards" ? (
        <>
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
                {catalogState.catalog.limitedEvent && hiddenLimitedEventId !== catalogState.catalog.limitedEvent.id ? (
                  <LimitedCardBanner
                    errorMessage={limitedRedeemErrorCode ? limitedRedeemErrorMessages[limitedRedeemErrorCode] ?? "Не вдалося активувати карту." : null}
                    event={catalogState.catalog.limitedEvent}
                    onExpired={() => setHiddenLimitedEventId(catalogState.catalog.limitedEvent?.id ?? null)}
                    onRedeem={(promoCode) => void handleLimitedRedeem(catalogState.catalog.limitedEvent!.id, promoCode)}
                    redeeming={redeemingLimited}
                  />
                ) : (
                  <div className="shop-featured__empty">
                    <AppIcon name="card-reward" size={18} />
                    <strong>Акційних наборів зараз немає</strong>
                    <span>Невдовзі</span>
                  </div>
                )}
              </section>

              <section className="shop-base-offers" aria-label="Постійні пропозиції карт">
                <ShopSectionHeading>По одній карті</ShopSectionHeading>
                {catalogState.catalog.offers.length ? (
                  catalogState.catalog.offers.map((offer, index) => {
                    return (
                      <ShopOfferPanel
                        disabled={purchasingOfferId !== null}
                        dataTutorialTarget={index === 0 ? "shop-basic-offer" : undefined}
                        availableBalance={player ? (offer.currency === "silver" ? player.silver : player.gold) : undefined}
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
        </>
      ) : null}

      {errorMessage ? <p className="shop-error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}
