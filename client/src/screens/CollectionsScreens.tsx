import { useEffect, useState } from "react";
import type {
  PlayerCollectionCardResponse,
  PlayerCollectionResponse,
  PlayerCollectionsResponse,
} from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { CardQualityBadge } from "../components/CardQualityBadge";
import { CardNameBadge } from "../components/CardNameBadge";
import { ElementSymbol } from "../components/ElementSymbol";
import { MenuTextureSlices } from "../components/MenuTextureSlices";
import { RibbonTitle } from "../components/RibbonTitle";
import { getTelegramInitData } from "../telegram";
import { loadCollection, loadCollectionCard, loadCollections } from "../telegram/collections";

const elementLabels = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" } as const;
const rarityLabels = { common: "Звичайна", uncommon: "Незвичайна", rare: "Рідкісна", epic: "Епічна", legendary: "Легендарна", mythic: "Міфічна" } as const;

type RemoteState<T> =
  | { status: "loading" | "unavailable" | "error" }
  | { status: "ready"; data: T };

function CollectionBack({ label, onClick }: { label: string; onClick: () => void }) {
  return <button aria-label={label} className="collection-back" onClick={onClick} type="button"><AppIcon name="chevron" size={20} /></button>;
}

function CollectionCover({ code, coverArtKey, completed }: { code: string; coverArtKey: string | null; completed?: boolean }) {
  return (
    <div aria-hidden="true" className={`collection-cover${completed ? " collection-cover--completed" : ""}`} data-collection={code}>
      <span />
      {coverArtKey ? <CardArtwork artKey={coverArtKey} element="fire" /> : <AppIcon name="collection" size={30} />}
      <span />
    </div>
  );
}

function CollectionState({ state, onRetry }: { state: RemoteState<unknown>; onRetry: () => void }) {
  return <div className="collection-state">
    {state.status === "loading" ? "Завантаження колекцій…" : null}
    {state.status === "unavailable" ? "Колекції доступні після запуску через Telegram." : null}
    {state.status === "error" ? <><span>Не вдалося завантажити колекції.</span><button onClick={onRetry} type="button">Повторити</button></> : null}
  </div>;
}

export function CollectionsScreen({ onBack, onOpenCollection, onOpenLimitedCard, tutorialCollectionId }: {
  onBack: () => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenLimitedCard?: (instanceId: string) => void;
  tutorialCollectionId?: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RemoteState<PlayerCollectionsResponse>>({ status: "loading" });
  const [filter, setFilter] = useState<"all" | "limited">("all");
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setState({ status: "unavailable" }); return; }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadCollections(initData, controller.signal).then((data) => setState({ status: "ready", data })).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error" });
    });
    return () => controller.abort();
  }, [attempt]);

  const limitedCards = state.status === "ready" ? state.data.limitedCards ?? [] : [];
  return <section className="collections-screen">
    <header className="collections-heading"><CollectionBack label="Назад на головну" onClick={onBack} /><div><h1>КОЛЕКЦІЇ</h1><p>Збирайте карти та відкривайте постійні бонуси</p></div></header>
    <div className="collection-filters" role="tablist" aria-label="Фільтр колекції">
      <button aria-selected={filter === "all"} className={filter === "all" ? "collection-filter collection-filter--active" : "collection-filter"} onClick={() => setFilter("all")} role="tab" type="button">Усі</button>
      <button aria-selected={filter === "limited"} className={filter === "limited" ? "collection-filter collection-filter--active" : "collection-filter"} onClick={() => setFilter("limited")} role="tab" type="button">Лімітовані</button>
    </div>
    {state.status !== "ready" ? <CollectionState state={state} onRetry={() => setAttempt((value) => value + 1)} /> : (
      filter === "all" ? (
        <div className="collection-grid" aria-label="Усі колекції">
          {state.data.collections.map((collection, index) => <button className={`collection-tile${collection.completed ? " collection-tile--completed" : ""}`} data-tutorial-target={tutorialCollectionId ? collection.id === tutorialCollectionId ? "collection-first" : undefined : index === 0 ? "collection-first" : undefined} key={collection.id} onClick={() => onOpenCollection(collection.id)} type="button">
            <CollectionCover code={collection.code} coverArtKey={collection.coverArtKey} completed={collection.completed} />
            <span className="collection-tile__meta">
              <strong>{collection.displayName}</strong>
              <span>{collection.discoveredCards}/{collection.totalCards}</span>
              {collection.source === "raid" ? <small className="collection-tile__source-badge">Рейдова колекція</small> : null}
            </span>
            {collection.completed ? <small aria-label="Колекцію зібрано">✓</small> : null}
          </button>)}
        </div>
      ) : limitedCards.length ? (
        <div className="collection-limited-grid" aria-label="Лімітовані карти">
          {limitedCards.map((card) => {
            const content = <>
              <CardArtwork artKey={card.artKey} cardId={card.id} element={card.element} />
              <CardQualityBadge rarity={card.minRarity} size="tiny" />
              <span className="collection-card-tile__element"><ElementSymbol element={card.element} /></span>
              <strong>{card.displayName}</strong>
              <small>{card.discovered ? "Знайдено" : "Не знайдено"}</small>
            </>;
            return card.strongestInstanceId && onOpenLimitedCard ? (
              <button className="collection-card-tile collection-card-tile--limited" key={card.id} onClick={() => onOpenLimitedCard(card.strongestInstanceId!)} type="button">{content}</button>
            ) : <article className="collection-card-tile collection-card-tile--limited" key={card.id}>{content}</article>;
          })}
        </div>
      ) : <div className="collection-state collection-state--empty">Лімітованих карт ще немає.</div>
    )}
  </section>;
}

export function CollectionDetailScreen({ collectionId, onBack, onOpenCard, onOpenShop, tutorialCardId }: {
  collectionId: string;
  onBack: () => void;
  onOpenCard: (cardId: string) => void;
  onOpenShop: () => void;
  tutorialCardId?: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RemoteState<PlayerCollectionResponse>>({ status: "loading" });
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setState({ status: "unavailable" }); return; }
    const controller = new AbortController(); setState({ status: "loading" });
    void loadCollection(initData, collectionId, controller.signal).then((data) => setState({ status: "ready", data })).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return; setState({ status: "error" });
    });
    return () => controller.abort();
  }, [attempt, collectionId]);
  if (state.status !== "ready") return <section className="collections-screen"><header className="collections-heading"><CollectionBack label="Назад до колекцій" onClick={onBack} /></header><CollectionState state={state} onRetry={() => setAttempt((value) => value + 1)} /></section>;
  const { collection, cards } = state.data;
  const highlightedCardId = tutorialCardId && cards.some((card) => card.id === tutorialCardId) ? tutorialCardId : null;
  const isRaidCollection = collection.source === "raid";
  return <section className={`collection-detail-screen${isRaidCollection ? " collection-detail-screen--raid" : ""}`}>
    <header className="collection-detail-heading"><CollectionBack label="Назад до колекцій" onClick={onBack} /><CardNameBadge name={collection.displayName} /></header>
    {isRaidCollection ? <div className="collection-source-badge" aria-label="Рейдова колекція">РЕЙДОВА КОЛЕКЦІЯ</div> : null}
    <div className="collection-hero" aria-hidden="true"><span /><CollectionCover code={collection.code} coverArtKey={collection.coverArtKey} completed={collection.completed} /><span /></div>
    <section className={`collection-bonus${collection.completed ? " collection-bonus--active" : ""}`}><span>{isRaidCollection ? "БОНУС ЗІБРАНОЇ КОЛЕКЦІЇ" : "БОНУС КОЛЕКЦІЇ"}</span><strong>{collection.bonusLabel}</strong><p>{collection.completed ? "Бонус активний" : "Бонус відкриється після збору всієї колекції"}</p></section>
    <p className="collection-progress">{isRaidCollection ? (collection.completed ? "Колекція зібрана" : <>Колекція: <strong>{collection.discoveredCards}/{collection.totalCards}</strong></>) : <>Знайдено <strong>{collection.discoveredCards}/{collection.totalCards}</strong> карт</>}</p>
    <RibbonTitle size="medium">КАРТИ КОЛЕКЦІЇ</RibbonTitle>
    <div className="collection-card-mosaic">
      <div className={`collection-card-grid${isRaidCollection ? " collection-card-grid--raid" : ""}`} aria-label={`Карти колекції ${collection.displayName}`}>
        {cards.map((card, index) => <button aria-label={`${card.displayName}, стихія: ${elementLabels[card.element]}, ${card.discovered ? "отримано" : "не отримано"}`} className={`collection-card-tile deck-card--${card.element} deck-card--${card.minRarity}${card.discovered ? "" : " collection-card-tile--unknown"}`} data-tutorial-target={highlightedCardId ? card.id === highlightedCardId ? "collection-first-card" : undefined : index === 0 ? "collection-first-card" : undefined} key={card.id} onClick={() => onOpenCard(card.id)} type="button">
          <CardArtwork artKey={card.artKey} cardId={card.id} element={card.element} />
          <CardQualityBadge rarity={card.minRarity} size="tiny" />
          <span className="collection-card-tile__element"><ElementSymbol element={card.element} /></span>
          <strong>{card.displayName}</strong>
          <small>{card.discovered ? "Отримано" : "Не отримано"}</small>
        </button>)}
      </div>
    </div>
    {isRaidCollection ? <div className="collection-source collection-source--raid"><span>Джерело карт</span><strong>Карти цієї колекції можна отримати лише в рейдах.</strong></div> : <div className="collection-source"><span>Де знайти карти цієї колекції?</span><button onClick={onOpenShop} type="button">Магазин <AppIcon name="chevron" size={17} /></button></div>}
  </section>;
}

export function CollectionCardScreen({ collectionId, cardId, onBack, onOpenInstance }: {
  collectionId: string;
  cardId: string;
  onBack: () => void;
  onOpenInstance: (instanceId: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RemoteState<PlayerCollectionCardResponse>>({ status: "loading" });
  useEffect(() => {
    const initData = getTelegramInitData(); if (!initData) { setState({ status: "unavailable" }); return; }
    const controller = new AbortController(); setState({ status: "loading" });
    void loadCollectionCard(initData, collectionId, cardId, controller.signal).then((data) => setState({ status: "ready", data })).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return; setState({ status: "error" });
    });
    return () => controller.abort();
  }, [attempt, cardId, collectionId]);
  if (state.status !== "ready") return <section className="collections-screen"><header className="collections-heading"><CollectionBack label="Назад до колекції" onClick={onBack} /></header><CollectionState state={state} onRetry={() => setAttempt((value) => value + 1)} /></section>;
  const { card, collection } = state.data;
  return <section className="collection-card-screen">
    <header className="collection-detail-heading"><CollectionBack label="Назад до колекції" onClick={onBack} /><CardNameBadge name={card.displayName} /></header>
    <p className="collection-card-meta">{elementLabels[card.element]} <span>•</span> Мінімум: {rarityLabels[card.minRarity]}</p>
    <div className={`collection-card-visual deck-card--${card.element} deck-card--${card.minRarity}${card.discovered ? "" : " collection-card-visual--unknown"}`}><CardArtwork artKey={card.artKey} cardId={card.id} element={card.element} /><CardQualityBadge rarity={card.minRarity} size="medium" /><span><ElementSymbol element={card.element} /></span></div>
    <p className="collection-card-description" data-tutorial-target="collection-card-info">{card.description}</p>
    <dl className="collection-card-facts"><div><dt>Колекція</dt><dd>{collection.displayName}</dd></div><div><dt>Статус</dt><dd className={card.discovered ? "is-found" : ""}>{card.discovered ? "Знайдено" : "Не знайдено"}</dd></div>{collection.source === "raid" ? <div><dt>Джерело</dt><dd>Лише рейди</dd></div> : null}{card.discovered ? <div><dt>Копій у власності</dt><dd>{card.ownedCopies}</dd></div> : null}</dl>
    {card.strongestInstanceId ? (
      <button className="collection-instance-link menu-row--metal-texture" onClick={() => onOpenInstance(card.strongestInstanceId!)} type="button">
        <MenuTextureSlices />
        <span className="collection-instance-link__icon"><AppIcon name="card-strength" size={20} /></span>
        <span className="collection-instance-link__title">Найсильніша карта</span>
      </button>
    ) : null}
    <button className="collection-return" onClick={onBack} type="button">Назад до колекції</button>
  </section>;
}
