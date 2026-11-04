import { useEffect, useState } from "react";
import type { CardRarity, ShopCardInfoResponse } from "@cardastika/shared";
import { CardArtwork } from "../components/CardArtwork";
import { ElementSymbol } from "../components/ElementSymbol";
import { MenuRow } from "../components/MenuRow";
import { ScreenHeading } from "../components/ScreenHeading";
import { RibbonTitle } from "../components/RibbonTitle";
import { getTelegramInitData } from "../telegram";
import { loadShopCardInfo } from "../telegram/shop";

type CardInfoState = { status: "loading" | "unavailable" | "error" } | { status: "ready"; data: ShopCardInfoResponse };

interface ShopCardInfoScreenProps {
  cardId: string;
  rarity: CardRarity;
  onBack: () => void;
  onOpenDeck: () => void;
  onOpenShop: () => void;
  onOpenWeakCards: () => void;
}

export function ShopCardInfoScreen({ cardId, rarity, onBack, onOpenDeck, onOpenShop, onOpenWeakCards }: ShopCardInfoScreenProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CardInfoState>({ status: "loading" });
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setState({ status: "unavailable" }); return; }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadShopCardInfo(initData, cardId, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt, cardId]);

  const card = state.status === "ready" ? state.data.card : null;
  return <>
    <ScreenHeading backLabel="До пропозиції" onBack={onBack} title={card ? <span className="collection-card-title"><ElementSymbol element={card.element} size={20} />{card.displayName}</span> : "Карта магазину"} />
    {state.status === "loading" ? <p className="shop-state">Завантаження карти…</p> : null}
    {state.status === "unavailable" ? <p className="shop-state">Увійдіть у гру, щоб переглянути карту.</p> : null}
    {state.status === "error" ? <div className="shop-state shop-state--error" role="alert"><p>Не вдалося завантажити карту.</p><button onClick={() => setAttempt((current) => current + 1)} type="button">Повторити</button></div> : null}
    {state.status === "ready" ? <>
      <div className={`collection-card-visual deck-card--${state.data.card.element} deck-card--${rarity}`}>
        <CardArtwork artKey={state.data.card.artKey} cardId={cardId} element={state.data.card.element} rarity={rarity} />
      </div>
      <div className="shop-text-plate shop-card-info__copy">
        <p className="collection-card-description">{state.data.card.description}</p>
        <p className="shop-card-info__ownership">{state.data.card.ownedCopies > 0 ? `У вас копій: ${state.data.card.ownedCopies}` : state.data.card.discovered ? "Ця карта вже випадала вам." : "Ця карта вам ще не випадала."}</p>
      </div>
      {state.data.collections.length ? <section className="shop-card-info__collections" aria-label="Колекції карти">
        <RibbonTitle>Входить до колекцій</RibbonTitle>
        {state.data.collections.map((collection) => <article className="shop-text-plate" key={collection.id}>
          <h3>{collection.displayName}</h3>
          <p>Бонус зібраної колекції: {collection.bonusLabel}</p>
        </article>)}
      </section> : null}
    </> : null}
    <div className="shop-card-info__actions">
      <MenuRow icon="deck" onClick={onOpenDeck} title="Колода" variant="book" />
      <MenuRow icon="weak-cards" onClick={onOpenWeakCards} title="Слабкі карти" variant="book" />
      <MenuRow icon="shop" onClick={onOpenShop} title="Магазин" variant="book" />
    </div>
  </>;
}
