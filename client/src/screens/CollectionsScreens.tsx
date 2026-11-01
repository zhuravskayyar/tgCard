import { ScreenHeading } from "../components/ScreenHeading";
import { useEffect, useState } from "react";
import type { PlayerCollectionCardResponse } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { MenuTextureSlices } from "../components/MenuTextureSlices";
import { getTelegramInitData } from "../telegram";
import { loadCollectionCard } from "../telegram/collections";

const elementLabels = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" } as const;
const rarityLabels = { common: "Звичайна", uncommon: "Незвичайна", rare: "Рідкісна", epic: "Епічна", legendary: "Легендарна", mythic: "Міфічна" } as const;

type RemoteState<T> =
  | { status: "loading" | "unavailable" | "error" }
  | { status: "ready"; data: T };

function CollectionState({ state, onRetry }: { state: RemoteState<unknown>; onRetry: () => void }) {
  return <div className="collection-state">
    {state.status === "loading" ? "Завантаження колекцій…" : null}
    {state.status === "unavailable" ? "Колекції доступні після запуску через Telegram." : null}
    {state.status === "error" ? <><span>Не вдалося завантажити колекції.</span><button onClick={onRetry} type="button">Повторити</button></> : null}
  </div>;
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
  if (state.status !== "ready") return <section className="collections-screen"><ScreenHeading backLabel="Назад до колекції" onBack={onBack} title="Карта колекції" /><CollectionState state={state} onRetry={() => setAttempt((value) => value + 1)} /></section>;
  const { card, collection } = state.data;
  if (!card.discovered) return <section className="collection-card-screen">
    <ScreenHeading backLabel="Назад до колекції" onBack={onBack} title="Невідома карта" />
    <p className="collection-card-description">Цю карту ще не знайдено.</p>
    <button className="collection-return" onClick={onBack} type="button">Назад до колекції</button>
  </section>;
  return <section className="collection-card-screen">
    <ScreenHeading backLabel="Назад до колекції" onBack={onBack} title={card.displayName} />
    <p className="collection-card-meta">{elementLabels[card.element]} <span>•</span> Мінімум: {rarityLabels[card.minRarity]}</p>
    <div className={`collection-card-visual deck-card--${card.element} deck-card--${card.minRarity}${card.discovered ? "" : " collection-card-visual--unknown"}`}><CardArtwork artKey={card.artKey} cardId={card.id} element={card.element} rarity={card.minRarity} /></div>
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
