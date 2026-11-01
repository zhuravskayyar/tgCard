import { ScreenHeading } from "../components/ScreenHeading";
import { useEffect, useState } from "react";
import type { PlayerCollectionCardResponse } from "@cardastika/shared";
import { CardSilhouette } from "../components/bestiary/CardSilhouette";
import { CardArtwork } from "../components/CardArtwork";
import { ElementSymbol } from "../components/ElementSymbol";
import { MenuRow } from "../components/MenuRow";
import { getTelegramInitData } from "../telegram";
import { loadCollectionCard } from "../telegram/collections";

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

export function CollectionCardScreen({ collectionId, cardId, onBack, onOpenDeck, onOpenInstance }: {
  collectionId: string;
  cardId: string;
  onBack: () => void;
  onOpenDeck: () => void;
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
  const { card } = state.data;
  return <section className="collection-card-screen">
    <ScreenHeading backLabel="Назад до колекції" onBack={onBack} title={<span className="collection-card-title"><ElementSymbol element={card.element} size={20} />{card.displayName}</span>} />
    {card.discovered
      ? <div className={`collection-card-visual deck-card--${card.element} deck-card--${card.minRarity}`}><CardArtwork artKey={card.artKey} cardId={card.id} element={card.element} rarity={card.minRarity} /></div>
      : <div className="collection-card-visual collection-card-visual--unknown"><CardSilhouette artKey={card.artKey} cardId={card.id} /></div>}
    <p className="collection-card-description" data-tutorial-target="collection-card-info">{card.description}</p>
    {card.strongestInstanceId ? <MenuRow chevron icon="card-strength" onClick={() => onOpenInstance(card.strongestInstanceId!)} title="Найсильніша карта" /> : null}
    <button className="collection-return" onClick={onBack} type="button">Назад до колекції</button>
    <MenuRow chevron icon="deck" onClick={onOpenDeck} title="Бойова колода" />
  </section>;
}
