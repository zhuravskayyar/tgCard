import { useEffect, useState } from "react";
import type {
  PlayerCollectionCardResponse,
  PlayerCollectionResponse,
  PlayerCollectionsResponse,
} from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { CardNameBadge } from "../components/CardNameBadge";
import { ElementSymbol } from "../components/ElementSymbol";
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

function CollectionCover({ code, completed }: { code: string; completed?: boolean }) {
  return (
    <div aria-hidden="true" className={`collection-cover${completed ? " collection-cover--completed" : ""}`} data-collection={code}>
      <span /><AppIcon name="collection" size={30} /><span />
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

export function CollectionsScreen({ onBack, onOpenCollection }: {
  onBack: () => void;
  onOpenCollection: (collectionId: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RemoteState<PlayerCollectionsResponse>>({ status: "loading" });
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

  return <section className="collections-screen">
    <header className="collections-heading"><CollectionBack label="Назад на головну" onClick={onBack} /><div><h1>КОЛЕКЦІЇ</h1><p>Збирайте карти та відкривайте постійні бонуси</p></div></header>
    {state.status !== "ready" ? <CollectionState state={state} onRetry={() => setAttempt((value) => value + 1)} /> : (
      <div className="collection-grid" aria-label="Усі колекції">
        {state.data.collections.map((collection) => <button className={`collection-tile${collection.completed ? " collection-tile--completed" : ""}`} key={collection.id} onClick={() => onOpenCollection(collection.id)} type="button">
          <CollectionCover code={collection.code} completed={collection.completed} />
          <strong>{collection.displayName}</strong>
          <span>{collection.discoveredCards}/{collection.totalCards}</span>
          {collection.completed ? <small aria-label="Колекцію зібрано">✓</small> : null}
        </button>)}
      </div>
    )}
  </section>;
}

export function CollectionDetailScreen({ collectionId, onBack, onOpenCard }: {
  collectionId: string;
  onBack: () => void;
  onOpenCard: (cardId: string) => void;
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
  return <section className="collection-detail-screen">
    <header className="collection-detail-heading"><CollectionBack label="Назад до колекцій" onClick={onBack} /><CardNameBadge name={collection.displayName} /></header>
    <CollectionCover code={collection.code} completed={collection.completed} />
    <section className={`collection-bonus${collection.completed ? " collection-bonus--active" : ""}`}><span>БОНУС КОЛЕКЦІЇ</span><strong>{collection.bonusLabel}</strong><p>{collection.completed ? "Бонус активний" : "Бонус відкриється після збору всієї колекції"}</p></section>
    <p className="collection-progress">Знайдено <strong>{collection.discoveredCards}/{collection.totalCards}</strong> карт</p>
    <div className="collection-card-grid" aria-label={`Карти колекції ${collection.displayName}`}>
      {cards.map((card) => <button aria-label={`${card.displayName}: ${card.discovered ? "знайдено" : "не знайдено"}`} className={`collection-card-tile deck-card--${card.element} deck-card--${card.minRarity}${card.discovered ? "" : " collection-card-tile--unknown"}`} key={card.id} onClick={() => onOpenCard(card.id)} type="button">
        <CardArtwork artKey={card.discovered ? card.artKey : null} element={card.element} />
        <span className="collection-card-tile__element"><ElementSymbol element={card.element} /></span>
        <strong>{card.displayName}</strong>
      </button>)}
    </div>
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
    <div className={`collection-card-visual deck-card--${card.element} deck-card--${card.minRarity}${card.discovered ? "" : " collection-card-visual--unknown"}`}><CardArtwork artKey={card.discovered ? card.artKey : null} element={card.element} /><span><ElementSymbol element={card.element} /></span></div>
    <dl className="collection-card-facts"><div><dt>Колекція</dt><dd>{collection.displayName}</dd></div><div><dt>Статус</dt><dd className={card.discovered ? "is-found" : ""}>{card.discovered ? "Знайдено" : "Не знайдено"}</dd></div>{card.discovered ? <div><dt>Копій у власності</dt><dd>{card.ownedCopies}</dd></div> : null}</dl>
    {card.strongestInstanceId ? <button className="collection-instance-link" onClick={() => onOpenInstance(card.strongestInstanceId!)} type="button">Найсильніша карта <AppIcon name="chevron" size={18} /></button> : null}
    <button className="collection-return" onClick={onBack} type="button">Назад до колекції</button>
  </section>;
}
