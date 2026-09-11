import { useState, type CSSProperties } from "react";
import { CARD_RARITIES, type CardRarity, type CollectionCompletionNotice, type ShopPurchaseResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { ShopOfferPanel } from "../components/ShopOfferPanel";
import { ShopRewardReveal } from "../components/ShopRewardReveal";
import { useShop } from "../hooks/useShop";
import { CardArtwork } from "../components/CardArtwork";
import { useCardWorkshop } from "../hooks/useCardWorkshop";
import type { CardWorkshopCard } from "@cardastika/shared";
import { NicknameSkinShopPanel } from "../components/NicknameSkinShopPanel";
import type { NicknameSkinId, PlayerSummary } from "@cardastika/shared";
import type { PlayerSummaryState } from "../types/player";
import { ShopWallet } from "../components/ShopWallet";
import { ShopCategoryBanner } from "../components/ShopCategoryBanner";
import { SHOP_CATEGORIES, type ShopCategory, type ShopCategoryId } from "../shop/shopCategories";
import { ShopBoostSection } from "../components/ShopBoostSection";
import { ShopBundleBanner } from "../components/ShopBundleBanner";
import { SHOP_BUNDLES } from "../shop/shopBundles";

interface ShopScreenProps {
  onBack: () => void;
  onBalanceChange: (balance: Partial<Pick<PlayerSummary, "arenaTokens" | "gold" | "silver">>) => void;
  onCollectionCompleted: (completion: CollectionCompletionNotice) => void;
  onDeckPowerChange: (deckPower: number) => void;
  onEquippedSkinChange: (skinId: NicknameSkinId | null) => void;
  onOpenDeck: () => void;
  onOpenTasks: () => void;
  onTutorialPurchase?: () => void;
  onTutorialRevealContinue?: (destination?: { cardId: string; collectionId: string | null }) => void;
  onPurchaseContinue?: () => void;
  playerSummaryState: PlayerSummaryState;
  nickname: string;
  returnScreen: "home" | "deck" | "collection" | "campaign-stage" | "tasks";
}

const purchaseErrorMessages: Record<string, string> = {
  insufficient_silver: "Недостатньо срібла",
  insufficient_gold: "Недостатньо золота",
  reward_unavailable: "Для цієї пропозиції поки немає доступних карт.",
  bundle_unavailable: "Карти цього набору тимчасово недоступні.",
  bundle_not_found: "Цей набір більше не доступний.",
  database_unavailable: "Магазин тимчасово недоступний.",
  shop_request_failed: "Не вдалося виконати покупку.",
};

interface ShopSectionHeadingProps {
  children: string;
}

type ShopSection = "cards" | "workshop" | "cosmetics" | "boosts";
type ShopView = "categories" | "section";
type ShopReveal =
  | { kind: "bundle"; bundleId: string; purchases: ShopPurchaseResponse[] }
  | { kind: "offer"; offerId: string; purchases: ShopPurchaseResponse[] };

const shopTabs: Array<{ icon: "shop-universal-card" | "shop-anvil"; id: "cards" | "workshop"; label: string }> = [
  { icon: "shop-universal-card", id: "cards", label: "Карти стихій" },
  { icon: "shop-anvil", id: "workshop", label: "Майстерня карт" },
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
const shopOfferRarityOrder = new Map<CardRarity, number>([
  ["mythic", 0],
  ["legendary", 1],
  ["epic", 2],
  ["rare", 3],
  ["uncommon", 4],
  ["common", 5],
]);

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
  const craftErrorMessages: Record<string, string> = {
    insufficient_card_shards: "Недостатньо уламків карт.",
    card_not_in_rotation: "Ця карта вже вийшла з ротації.",
    workshop_unavailable: "Ротація майстерні тимчасово недоступна.",
  };
  const workshopCards = state.status === "ready"
    ? [...state.data.cards]
      .sort((left, right) => {
        const affordableDifference = Number(state.data.cardShards >= right.cost) - Number(state.data.cardShards >= left.cost);
        if (affordableDifference !== 0) return affordableDifference;
        const progressDifference = (state.data.cardShards / left.cost) - (state.data.cardShards / right.cost);
        if (progressDifference !== 0) return progressDifference > 0 ? -1 : 1;
        return (workshopRarityOrder.get(left.rarity) ?? 0) - (workshopRarityOrder.get(right.rarity) ?? 0);
      })
    : [];
  return <section aria-label="Майстерня карт" className="card-workshop">
    <ShopWallet items={[{ id: "card-shards", icon: <CardShardMark size={18} />, label: "Кристали майстерні", value: state.status === "ready" ? state.data.cardShards : undefined }]} />
    {state.status === "loading" ? <div className="workshop-state">Завантаження ротації…</div> : null}
    {state.status === "unavailable" ? <div className="workshop-state">Майстерня доступна після запуску через Telegram.</div> : null}
    {state.status === "error" ? <div className="workshop-state workshop-state--error"><span>Не вдалося завантажити майстерню.</span><button onClick={retry} type="button">Повторити</button></div> : null}
    {state.status === "ready" ? <>
      <div className="workshop-list">{workshopCards.map((card) => <WorkshopCard card={card} cardShards={state.data.cardShards} crafting={craftingCardId !== null} key={card.cardId} onCraft={() => void craft(card.cardId)} />)}</div>
    </> : null}
    {craftErrorCode ? <p className="workshop-error" role="alert">{craftErrorMessages[craftErrorCode] ?? "Не вдалося створити карту."}</p> : null}
  </section>;
}

export function ShopScreen({ onBack, onBalanceChange, onCollectionCompleted, onDeckPowerChange, onEquippedSkinChange, onOpenDeck, onOpenTasks, onPurchaseContinue, onTutorialPurchase, onTutorialRevealContinue, playerSummaryState, nickname, returnScreen }: ShopScreenProps) {
  const { catalogState, purchase, purchaseBundle, purchaseErrorCode, purchasingBundleId, purchasingOfferId, retryCatalog } = useShop();
  const [view, setView] = useState<ShopView>("categories");
  const [section, setSection] = useState<ShopSection>("cards");
  const [activeCategory, setActiveCategory] = useState<ShopCategoryId | null>(null);
  const [batchPurchasing, setBatchPurchasing] = useState(false);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [reveal, setReveal] = useState<ShopReveal | null>(null);
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const beginnerContext = returnScreen === "campaign-stage" || returnScreen === "tasks";
  const continueLabel = returnScreen === "campaign-stage"
    ? "Повернутися до етапу"
    : returnScreen === "tasks"
      ? "Повернутися до завдання"
      : returnScreen === "deck"
        ? "Повернутися до колоди"
        : returnScreen === "collection"
          ? "Повернутися до колекції"
          : "Залишитися в магазині";

  function applyPurchaseResult(result: ShopPurchaseResponse) {
    onBalanceChange(result.updatedBalance);
    if (result.collectionCompleted) onCollectionCompleted(result.collectionCompleted);
    if (result.deckChanged && result.deckPower !== undefined) {
      onDeckPowerChange(result.deckPower);
    }
  }

  if (reveal) {
    return (
      <ShopRewardReveal
        canBuyTen={reveal.kind === "offer" && purchaseCount >= 10}
        continueLabel={continueLabel}
        errorMessage={purchaseErrorCode ? purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося виконати покупку." : null}
        onBuyAgain={() => reveal.kind === "offer" ? void handlePurchase(reveal.offerId) : void handleBundlePurchase(reveal.bundleId)}
        onBuyTen={reveal.kind === "offer" ? () => void handleBatchPurchase(reveal.offerId) : undefined}
        onContinue={() => {
          const reward = reveal.purchases[0]?.reward;
          setReveal(null);
          onTutorialRevealContinue?.(reward ? { cardId: reward.cardId, collectionId: reward.collectionId } : undefined);
          onPurchaseContinue?.();
        }}
        purchasing={batchPurchasing || (reveal.kind === "offer" ? purchasingOfferId === reveal.offerId : purchasingBundleId === reveal.bundleId)}
        purchases={reveal.purchases}
      />
    );
  }

  async function handlePurchase(offerId: string) {
    const result = await purchase(offerId);
    if (!result) return;
    applyPurchaseResult(result);
    setPurchaseCount((current) => current + 1);
    setReveal({ kind: "offer", offerId, purchases: [result] });
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
        setReveal({ kind: "offer", offerId, purchases });
      }
    } finally {
      setBatchPurchasing(false);
    }
  }

  async function handleBundlePurchase(bundleId: string) {
    const result = await purchaseBundle(bundleId);
    if (!result) return;
    const discoveryIds = new Set(result.newDiscoveryCardIds);
    const lastIndex = result.rewards.length - 1;
    const purchases: ShopPurchaseResponse[] = result.rewards.map((reward, index) => ({
      reward,
      newDiscovery: discoveryIds.has(reward.cardId),
      updatedBalance: result.updatedBalance,
      updatedChances: [],
      deckChanged: index === lastIndex && result.deckChanged,
      ...(index === lastIndex && result.collectionCompleted ? { collectionCompleted: result.collectionCompleted } : {}),
      ...(index === lastIndex && result.previousDeckPower !== undefined ? { previousDeckPower: result.previousDeckPower } : {}),
      ...(index === lastIndex && result.deckPower !== undefined ? { deckPower: result.deckPower } : {}),
    }));
    applyPurchaseResult(purchases[lastIndex]);
    setReveal({ kind: "bundle", bundleId, purchases });
  }

  const errorMessage = purchaseErrorCode
    ? purchaseErrorMessages[purchaseErrorCode] ?? "Не вдалося виконати покупку."
    : null;

  function handleCategorySelect(category: ShopCategory) {
    setActiveCategory(category.id);
    setSection(category.destination === "cosmetics" ? "cosmetics" : category.destination === "boosts" ? "boosts" : "cards");
    setView("section");
  }

  function handleSectionSelect(nextSection: ShopSection) {
    setSection(nextSection);
  }

  function handleShopBack() {
    if (view === "section") {
      setView("categories");
      setActiveCategory(null);
      return;
    }
    onBack();
  }

  const activeCategoryData = activeCategory ? SHOP_CATEGORIES.find((category) => category.id === activeCategory) : null;
  const isReadyBundlesCategory = activeCategory === "ready-bundles";
  const showCardTabs =
    view === "section" &&
    activeCategory === "magical-cards" &&
    (section === "cards" || section === "workshop");

  return (
    <section className={`shop-screen shop-screen--${view} shop-screen--${section}`}>
      <header className="shop-heading">
        <button aria-label={view === "section" ? "До категорій" : "Назад"} className="shop-back" onClick={handleShopBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>{view === "categories" ? "ОБЕРИ СВОЮ КАТЕГОРІЮ" : activeCategoryData?.title ?? "Крамниця карт"}</span>
          <h1>МАГАЗИН</h1>
        </div>
      </header>

      {view === "categories" ? (
        <div aria-label="Категорії магазину" className="shop-category-list">
          {SHOP_CATEGORIES.map((category) => <ShopCategoryBanner category={category} key={category.id} onSelect={handleCategorySelect} />)}
        </div>
      ) : null}

      {showCardTabs ? <div className="shop-tabs" role="tablist" aria-label="Розділ магазину">
        {shopTabs.map((tab) => (
          <button
            aria-label={tab.label}
            aria-selected={section === tab.id}
            className={section === tab.id ? `shop-tab shop-tab--${tab.id} shop-tab--active` : `shop-tab shop-tab--${tab.id}`}
            key={tab.id}
            onClick={() => handleSectionSelect(tab.id)}
            role="tab"
            type="button"
          >
            <AppIcon name={tab.icon} size={24} />
          </button>
        ))}
      </div> : null}

      {view === "section" && section === "workshop" ? <CardWorkshopSection /> : null}
      {view === "section" && section === "cosmetics" ? <NicknameSkinShopPanel nickname={nickname} onBalanceChange={onBalanceChange} onEquippedSkinChange={onEquippedSkinChange} /> : null}
      {view === "section" && section === "boosts" ? <ShopBoostSection onBack={handleShopBack} onOpenDeck={onOpenDeck} onOpenTasks={onOpenTasks} player={player} /> : null}

      {view === "section" && section === "cards" ? (
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
            isReadyBundlesCategory ? (
              <section className="shop-bundle-section" aria-label="Готові набори">
                <ShopSectionHeading>Готові набори</ShopSectionHeading>
                <div className="shop-bundle-list">
                  {SHOP_BUNDLES.map((bundle) => (
                    catalogState.catalog.bundles.find((offer) => offer.id === bundle.id) ? (
                      <ShopBundleBanner
                        availableBalance={player?.gold}
                        bundle={bundle}
                        disabled={purchasingOfferId !== null || purchasingBundleId !== null}
                        key={bundle.id}
                        offer={catalogState.catalog.bundles.find((offer) => offer.id === bundle.id)!}
                        onPurchase={() => void handleBundlePurchase(bundle.id)}
                        purchasing={purchasingBundleId === bundle.id}
                      />
                    ) : null
                  ))}
                </div>
              </section>
            ) : (
              <div className="shop-sections">
              <section className="shop-base-offers" aria-label="Постійні пропозиції карт">
                <ShopSectionHeading>По одній карті</ShopSectionHeading>
                {catalogState.catalog.offers.length ? (
                  [...catalogState.catalog.offers]
                    .sort((left, right) => {
                      if (!beginnerContext || !player) {
                        return (shopOfferRarityOrder.get(left.guaranteedRarity) ?? 99) - (shopOfferRarityOrder.get(right.guaranteedRarity) ?? 99);
                      }
                      const leftBalance = left.currency === "silver" ? player.silver : player.gold;
                      const rightBalance = right.currency === "silver" ? player.silver : player.gold;
                      const leftAffordable = Number(leftBalance >= left.price);
                      const rightAffordable = Number(rightBalance >= right.price);
                      if (leftAffordable !== rightAffordable) return rightAffordable - leftAffordable;
                      if (left.currency !== right.currency) return left.currency === "silver" ? -1 : 1;
                      if (left.price !== right.price) return left.price - right.price;
                      return (shopOfferRarityOrder.get(left.guaranteedRarity) ?? 99) - (shopOfferRarityOrder.get(right.guaranteedRarity) ?? 99);
                    })
                    .map((offer, index) => {
                    return (
                      <ShopOfferPanel
                        disabled={purchasingOfferId !== null || purchasingBundleId !== null}
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

              </div>
            )
          ) : null}
        </>
      ) : null}

      {errorMessage ? <p className="shop-error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}
