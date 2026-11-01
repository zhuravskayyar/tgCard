import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { PlayerCollectionResponse, PlayerCollectionsResponse } from "@cardastika/shared";
import { getTelegramInitData } from "../../telegram";
import { loadCollection, loadCollections } from "../../telegram/collections";
import { ScreenHeading } from "../ScreenHeading";
import { BestiaryCard } from "./BestiaryCard";
import { CollectionEntry } from "./CollectionEntry";
import { CollectionPage } from "./CollectionPage";

const FLIP_HALF_MS = 190;
const TURN_SHEET_SOURCE = "/assets/ui/bestiary/turn-sheet-v1.webp";

type RemoteState<T> =
  | { status: "loading" | "unavailable" | "error" }
  | { status: "ready"; data: T };

function useRemote<T>(load: ((initData: string, signal: AbortSignal) => Promise<T>) | null, key: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" });
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const run = loadRef.current;
    if (!run) return;
    const initData = getTelegramInitData();
    if (!initData) { setState({ status: "unavailable" }); return; }
    const controller = new AbortController();
    setState({ status: "loading" });
    void run(initData, controller.signal).then((data) => setState({ status: "ready", data })).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error" });
    });
    return () => controller.abort();
  }, [attempt, key]);
  return { retry: () => setAttempt((value) => value + 1), state };
}

function BookState({ onRetry, status }: { onRetry: () => void; status: "loading" | "unavailable" | "error" }) {
  return (
    <div className="collection-state bestiary-state">
      {status === "loading" ? "Завантаження колекцій…" : null}
      {status === "unavailable" ? "Колекції доступні після запуску через Telegram." : null}
      {status === "error" ? <><span>Не вдалося завантажити колекції.</span><button onClick={onRetry} type="button">Повторити</button></> : null}
    </div>
  );
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function BestiaryBook({ collectionId, onBack, onBackToContents, onOpenCard, onOpenCollection, onOpenLimitedCard, onOpenShop }: {
  collectionId: string | null;
  onBack: () => void;
  onBackToContents: () => void;
  onOpenCard: (cardId: string) => void;
  onOpenCollection: (collectionId: string) => void;
  onOpenLimitedCard: (instanceId: string) => void;
  onOpenShop: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "limited">("all");
  // The page on show lags the route by half a turn, so the swap happens while the leaf is edge-on.
  const [shownId, setShownId] = useState(collectionId);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [sheet, setSheet] = useState<{ forward: boolean; style: CSSProperties } | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const contentsScrollRef = useRef(0);

  // Loaded ahead so the first turn never sweeps an empty sheet.
  useEffect(() => { new Image().src = TURN_SHEET_SOURCE; }, []);

  useEffect(() => {
    if (collectionId === shownId) return;
    const scroller = rootRef.current?.closest(".app-content");
    if (collectionId && scroller) contentsScrollRef.current = scroller.scrollTop;
    const restore = () => scroller?.scrollTo(0, collectionId ? 0 : contentsScrollRef.current);
    if (prefersReducedMotion()) { setShownId(collectionId); restore(); return; }
    // The sheet spans the visible screen area, so the swap and scroll jump below stay hidden under it.
    const area = scroller?.getBoundingClientRect();
    if (area) {
      const top = document.querySelector(".top-hud")?.getBoundingClientRect().bottom ?? area.top;
      const bottom = document.querySelector(".bottom-navigation")?.getBoundingClientRect().top ?? area.bottom;
      setSheet({ forward: collectionId !== null, style: { height: bottom - top, left: area.left, top, width: area.width } });
    }
    setPhase("out");
    const swap = window.setTimeout(() => {
      setShownId(collectionId);
      restore();
      setPhase("in");
    }, FLIP_HALF_MS);
    return () => window.clearTimeout(swap);
  }, [collectionId, shownId]);

  // Separate from the swap above: changing shownId re-runs that effect, which would cancel this timer.
  useEffect(() => {
    if (phase !== "in") return;
    const settle = window.setTimeout(() => { setPhase("idle"); setSheet(null); }, FLIP_HALF_MS);
    return () => window.clearTimeout(settle);
  }, [phase]);

  // A book opened directly on a collection fetches its contents only when first turned back to them.
  const contentsSeenRef = useRef(false);
  contentsSeenRef.current ||= shownId === null;
  const list = useRemote<PlayerCollectionsResponse>(contentsSeenRef.current ? loadCollections : null, contentsSeenRef.current ? "contents" : "idle");
  const page = useRemote<PlayerCollectionResponse>(collectionId
    ? (initData, signal) => loadCollection(initData, collectionId, signal)
    : null, collectionId ?? "");

  const limitedCards = list.state.status === "ready" ? list.state.data.limitedCards ?? [] : [];

  return (
    <section className="bestiary" ref={rootRef}>
      <ScreenHeading backLabel="Назад на головну" onBack={onBack} title="КОЛЕКЦІЇ" />
      {shownId === null ? (
        <div aria-label="Фільтр колекції" className="collection-filters" role="tablist">
          <button aria-selected={filter === "all"} className={filter === "all" ? "collection-filter collection-filter--active" : "collection-filter"} onClick={() => setFilter("all")} role="tab" type="button">Усі</button>
          <button aria-selected={filter === "limited"} className={filter === "limited" ? "collection-filter collection-filter--active" : "collection-filter"} onClick={() => setFilter("limited")} role="tab" type="button">Лімітовані</button>
        </div>
      ) : null}
      <div className="bestiary-book">
        <span aria-hidden="true" className="bestiary-book__bookmarks"><i /><i /><i /></span>
        <div className="bestiary-leaf">
          {shownId === null ? (
            list.state.status !== "ready" ? <BookState onRetry={list.retry} status={list.state.status} /> : filter === "all" ? (
              list.state.data.collections.length ? (
                <div aria-label="Усі колекції" className="bestiary-contents">
                  {list.state.data.collections.map((collection) => <CollectionEntry collection={collection} key={collection.id} onOpen={() => onOpenCollection(collection.id)} />)}
                </div>
              ) : <div className="collection-state collection-state--empty bestiary-state">Поки що немає колекцій із нового набору карт.</div>
            ) : limitedCards.length ? (
              <div aria-label="Лімітовані карти" className="bestiary-page__cards">
                {limitedCards.map((card) => <BestiaryCard card={card} key={card.id} onOpen={card.strongestInstanceId ? () => onOpenLimitedCard(card.strongestInstanceId!) : undefined} settled={phase === "idle"} />)}
              </div>
            ) : <div className="collection-state collection-state--empty bestiary-state">Лімітованих карт ще немає.</div>
          ) : page.state.status === "ready" ? (
            <CollectionPage data={page.state.data} onBack={onBackToContents} onOpenCard={onOpenCard} onOpenShop={onOpenShop} settled={phase === "idle"} />
          ) : (
            <div className="bestiary-page">
              <button className="collection-return bestiary-page__back" onClick={onBackToContents} type="button">Назад до змісту</button>
              <BookState onRetry={page.retry} status={page.state.status} />
            </div>
          )}
        </div>
      </div>
      {sheet ? createPortal(
        <div aria-hidden="true" className="bestiary-turn" style={sheet.style}>
          <span className={`bestiary-turn__sheet${sheet.forward ? "" : " bestiary-turn__sheet--back"}`} />
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
