import { useCallback, useEffect, useRef, useState } from "react";
import type { CardElement, GuardianDragonHikeHoursValue, GuardianDragonView } from "@cardastika/shared";
import { getGuardianDragonFeedMinutes } from "@cardastika/game-core";
import { DeckCard } from "../components/DeckCard";
import { ElementArt } from "../components/ElementAura";
import { ElementSymbol } from "../components/ElementSymbol";
import { RibbonTitle } from "../components/RibbonTitle";
import { GuardianDragonBattles, GuardianDragonMagic } from "./GuardianDragonTabs";
import { MenuRow } from "../components/MenuRow";
import { Pagination } from "../components/Pagination";
import { ScreenHeading } from "../components/ScreenHeading";
import { useWeakCards } from "../hooks/useWeakCards";
import { formatUiNumber, getUiNumberLocale } from "../i18n";
import { getTelegramInitData } from "../telegram";
import { cancelGuardianDragonHike, feedGuardianDragon, GuardianDragonApiError, loadGuardianDragon, startGuardianDragonHike } from "../telegram/guardianDragon";

interface GuardianDragonScreenProps {
  onBack: () => void;
  onGoldChange: (gold: number) => void;
  onOpenDeck: () => void;
  onOpenWeakCards: () => void;
}

type DragonState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; data: GuardianDragonView };

/** Feeding tabs, one per element, as on the reference dragon page. */
const FEED_ELEMENTS: readonly CardElement[] = ["fire", "water", "earth", "air"];
const ELEMENT_NAMES: Record<CardElement, string> = { fire: "Вогонь", water: "Вода", earth: "Земля", air: "Повітря" };
/** How long a fed card burns before the list refreshes. */
const BURN_MS = 750;

const homeSprite = (name: string) => `/assets/ui/home/sprites/${name}.webp`;
/** Painted dragon looks: 0 is the egg. The files come from the sprite list in docs/reference-elem-guardian-dragon.md. */
const stageSprite = (stage: number) => `/assets/ui/guardian-dragon/stage-${stage}.webp`;

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} год ${rest} хв` : `${rest} хв`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(getUiNumberLocale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function dragonErrorMessage(error: unknown) {
  if (!(error instanceof GuardianDragonApiError)) return "Дію не виконано. Оновіть дані та спробуйте ще раз.";
  if (error.code === "guardian_dragon_locked") return "Дракон з’являється в третій епічній лізі дуелей.";
  if (error.code === "hike_running") return "Дракон уже в поході.";
  if (error.code === "no_hike") return "Дракон уже повернувся з походу.";
  if (error.code === "not_enough_progress") return "Згодуйте дракону більше карт для цього походу.";
  if (error.code === "progress_full") return "Шкала прогресу вже заповнена.";
  if (error.code === "nothing_to_feed") return "Немає слабких карт для годування.";
  if (error.code === "card_not_feedable") return "Цю карту не можна згодувати.";
  return "Дію не виконано. Оновіть дані та спробуйте ще раз.";
}

function useGuardianDragon() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DragonState>({ status: "loading" });
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadGuardianDragon(initData, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);
  return { retry, setState, state };
}

function DragonProgress({ dragon }: { dragon: GuardianDragonView }) {
  const percent = Math.min(100, dragon.progressMinutes / dragon.progressMaxMinutes * 100);
  return <div className="guardian-dragon__progress">
    <span aria-label={`Прогрес походу: ${formatMinutes(dragon.progressMinutes)}`} className="guardian-dragon__rail" role="img"><span style={{ width: `${percent}%` }} /></span>
    <ol aria-hidden="true" className="guardian-dragon__marks">
      {dragon.hikes.map((hike) => <li key={hike.hours} style={{ left: `${hike.hours * 60 / dragon.progressMaxMinutes * 100}%` }}>{`${hike.hours} год`}</li>)}
    </ol>
  </div>;
}

export function GuardianDragonScreen({ onBack, onGoldChange, onOpenDeck, onOpenWeakCards }: GuardianDragonScreenProps) {
  const { retry, setState, state } = useGuardianDragon();
  const [page, setPage] = useState(1);
  const [feedElement, setFeedElement] = useState<CardElement>("fire");
  const weak = useWeakCards(page, feedElement);
  const [burning, setBurning] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Until the painted looks are added, the portrait stays empty instead of a broken image.
  const [portraitMissing, setPortraitMissing] = useState(false);
  const stage = state.status === "ready" ? state.data.stage : null;
  useEffect(() => setPortraitMissing(false), [stage]);
  const screenRef = useRef<HTMLElement>(null);
  const fedCount = useRef(0);
  const burnedIds = useRef<string[]>([]);
  const fedByHand = useRef(true);
  const dragon = state.status === "ready" ? state.data : null;
  // A short pulse when the dragon eats or comes back from a hike.
  const [reaction, setReaction] = useState<"fed" | "grew" | null>(null);
  const previous = useRef<{ progress: number; health: number } | null>(null);
  useEffect(() => {
    if (!dragon) return;
    const before = previous.current;
    previous.current = { progress: dragon.progressMinutes, health: dragon.health };
    if (!before) return;
    const next = dragon.health > before.health ? "grew" : dragon.progressMinutes > before.progress ? "fed" : null;
    if (!next) return;
    setReaction(next);
    const timer = window.setTimeout(() => setReaction(null), 900);
    return () => window.clearTimeout(timer);
  }, [dragon?.progressMinutes, dragon?.health]);
  const locked = Boolean(dragon && !dragon.unlocked);
  const [tab, setTab] = useState<"hikes" | "fights" | "magic">("hikes");

  async function perform(operation: (initData: string) => Promise<GuardianDragonView>, refreshCards = false) {
    fedCount.current = 0;
    burnedIds.current = [];
    const initData = getTelegramInitData();
    if (!initData || pending) return;
    setPending(true);
    setNotice(null);
    try {
      const next = await operation(initData);
      // Fed cards burn on the page first; the dragon and the list update when the fire is out.
      if (refreshCards && burnedIds.current.length) {
        setBurning(new Set(burnedIds.current));
        await new Promise((resolve) => window.setTimeout(resolve, BURN_MS));
        setBurning(new Set());
      }
      setState({ status: "ready", data: next });
      // Feeding the last cards of a later page would leave it empty: step back a page instead.
      const pageCards = weak.state.status === "ready" ? weak.state.data.cards : [];
      const eatenHere = pageCards.filter((card) => burnedIds.current.includes(card.instanceId)).length;
      // Feed-all may also eat cards from earlier pages, so the first page is the safe place to land.
      if (refreshCards && page > 1 && !fedByHand.current) setPage(1);
      else if (refreshCards && page > 1 && pageCards.length && eatenHere >= pageCards.length) setPage(page - 1);
      else if (refreshCards) weak.retry();
    } catch (error) {
      setNotice(dragonErrorMessage(error));
      // A hike may have ended or cards changed meanwhile: show the server's state again.
      retry();
      weak.retry();
    } finally {
      setPending(false);
    }
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    requestAnimationFrame(() => screenRef.current?.closest<HTMLElement>(".app-content")?.scrollTo({ top: 0 }));
  }

  const feed = (instanceIds?: string[]) => perform(async (initData) => {
    fedByHand.current = Boolean(instanceIds);
    const result = await feedGuardianDragon(initData, instanceIds, instanceIds ? undefined : feedElement);
    fedCount.current = result.consumedInstanceIds.length;
    burnedIds.current = result.consumedInstanceIds;
    return result.dragon;
  }, true);
  const hike = (hours: GuardianDragonHikeHoursValue) => perform((initData) => startGuardianDragonHike(initData, hours));
  const progressFull = dragon ? dragon.progressMinutes >= dragon.progressMaxMinutes : true;

  return (
    <section className="weak-cards-screen guardian-dragon-screen" ref={screenRef}>
      <ScreenHeading onBack={onBack} title="Дракон-захисник" action={<strong>{dragon ? `${formatUiNumber(dragon.health)} HP` : "— HP"}</strong>} />

      {state.status === "loading" ? <div className="deck-state">Завантаження дракона…</div> : null}
      {state.status === "unavailable" ? <div className="deck-state">Дракон доступний після запуску через Telegram.</div> : null}
      {state.status === "error" ? <div className="deck-state deck-state--error"><span>Не вдалося завантажити дракона.</span><button onClick={retry} type="button">Повторити</button></div> : null}

      {dragon ? <div className="shop-tabs" role="tablist" aria-label="Розділи дракона">
        {([["hikes", "Походи"], ["fights", "Битви"], ["magic", "Магія"]] as const).map(([value, label]) => <button aria-selected={tab === value} className={`shop-tab${tab === value ? " shop-tab--active" : ""}`} key={value} onClick={() => setTab(value)} role="tab" type="button"><span>{label}</span></button>)}
      </div> : null}

      {dragon && tab === "fights" ? <GuardianDragonBattles dragon={dragon} locked={locked} onDragon={(next) => setState({ status: "ready", data: next })} onGoldChange={onGoldChange} onRefresh={retry} /> : null}
      {dragon && tab === "magic" ? <GuardianDragonMagic dragon={dragon} /> : null}

      {dragon && tab === "hikes" ? <>
        <p className="deck-note deck-note--info weak-cards-intro">{locked ? "Дракон з’являється в третій епічній лізі дуелей." : "Дракон додає вам здоров’я, рівне своєму. Годуйте його слабкими картами й відправляйте в похід."}</p>
        <figure className={`guardian-dragon__portrait guardian-dragon__portrait--stage-${dragon.stage}${dragon.hike ? " is-away" : ""}${locked ? " is-locked" : ""}${reaction ? ` is-${reaction}` : ""}`}>
          {portraitMissing ? null : <span className="guardian-dragon__art"><ElementArt alt={dragon.stage === 0 ? "Яйце дракона" : "Дракон-захисник"} cardId="guardian_dragon" element="fire" key={dragon.stage} onError={() => setPortraitMissing(true)} src={stageSprite(dragon.stage)} /></span>}
          <figcaption>
            <strong>{`Здоров’я дракона: ${formatUiNumber(dragon.health)} / ${formatUiNumber(dragon.maxHealth)}`}</strong>
            <span>{dragon.hike ? "У поході дракон не додає здоров’я." : `У бою: +${formatUiNumber(dragon.battleHealthBonus)} HP`}</span>
            <span>{`Майстерність: ${dragon.mastery}`}</span>
          </figcaption>
        </figure>

        <div className={reaction === "fed" ? "guardian-dragon__meter is-fed" : "guardian-dragon__meter"}><DragonProgress dragon={dragon} /></div>
        <p className="deck-note weak-cards-intro">{`Прогрес: ${formatMinutes(dragon.progressMinutes)}`}</p>

        {dragon.hike ? <div className="guardian-dragon__hike">
          <p className="deck-note weak-cards-intro">{`Дракон вирушив у похід на ${dragon.hike.hours} год (+${dragon.hike.healthGain} HP) і повернеться ${formatTime(dragon.hike.endsAt)} ще могутнішим.`}</p>
          <button className="guardian-dragon__button" disabled={pending} onClick={() => { void perform(cancelGuardianDragonHike); }} type="button">Перервати похід</button>
          <small className="guardian-dragon__caption">Якщо перервати похід, здоров’я дракону не додасться, але прогрес згодованих карт не зміниться.</small>
        </div> : <div aria-label="Походи" className="guardian-dragon__hikes">
          {dragon.hikes.map((option) => <div className="guardian-dragon__hike-option" key={option.hours}>
            <button className="guardian-dragon__button" data-ready={!locked && dragon.progressMinutes >= option.hours * 60 ? "" : undefined} disabled={locked || pending || dragon.progressMinutes < option.hours * 60} onClick={() => { void hike(option.hours); }} type="button">{`На ${option.hours} год`}</button>
            <small>{`+${option.healthGain} HP`}</small>
          </div>)}
        </div>}

        {notice ? <p className="deck-note deck-note--error weak-cards-intro" role="status">{notice}</p> : null}

        {locked || dragon.hike ? null : <>
        <RibbonTitle>Карти на прокорм</RibbonTitle>
        <div aria-label="Стихія карт на прокорм" className="guardian-dragon__elements">
          {FEED_ELEMENTS.map((element) => <button aria-label={`Карти стихії ${ELEMENT_NAMES[element]}`} aria-pressed={element === feedElement} className={`guardian-dragon__element guardian-dragon__element--${element}${element === feedElement ? " is-active" : ""}`} key={element} onClick={() => { setFeedElement(element); setPage(1); }} type="button"><ElementSymbol element={element} size={22} /></button>)}
        </div>
        {weak.state.status === "loading" ? <div className="deck-state">Завантаження слабких карт…</div> : null}
        {weak.state.status === "error" ? <div className="deck-state deck-state--error"><span>Не вдалося завантажити слабкі карти.</span><button onClick={weak.retry} type="button">Повторити</button></div> : null}
        {weak.state.status === "ready" && weak.state.data.totalCards === 0 ? <p className="deck-note deck-note--info weak-cards-intro">{`Слабких карт стихії «${ELEMENT_NAMES[feedElement]}» немає.`}</p> : null}
        {weak.state.status === "ready" && weak.state.data.totalCards > 0 ? <>
          <button className="guardian-dragon__button guardian-dragon__feed-all" disabled={pending || progressFull} onClick={() => { void feed(); }} type="button">Згодувати все</button>
          <div aria-label="Карти на прокорм" className="deck-grid weak-cards-grid">
            {weak.state.data.cards.map((card) => <div className={burning.has(card.instanceId) ? "guardian-dragon__feed-card is-burning" : "guardian-dragon__feed-card"} key={card.instanceId}>
              <span className="guardian-dragon__feed-art"><DeckCard card={card} /></span>
              <button className="guardian-dragon__button guardian-dragon__button--small" disabled={pending || progressFull} onClick={() => { void feed([card.instanceId]); }} type="button">Згодувати</button>
              <small>{`+${formatMinutes(getGuardianDragonFeedMinutes(card.finalPower))}`}</small>
            </div>)}
          </div>
          <Pagination currentPage={weak.state.data.page} onPageChange={changePage} totalPages={weak.state.data.totalPages} />
        </> : null}

        <p className="deck-note weak-cards-intro">{`Дракон переродиться з нульовим здоров’ям ${formatTime(dragon.rebirthAt)}.`}</p>
        </>}
      </> : null}

      <nav className="deck-actions" aria-label="Куди далі">
        <MenuRow chevron icon="weak-cards" iconSrc={homeSprite("row-icon-weak-cards")} illustrationSrc={homeSprite("row-weak-cards")} onClick={onOpenWeakCards} title="Слабкі карти" />
        <MenuRow chevron icon="deck" iconSrc={homeSprite("mode-deck")} illustrationSrc={homeSprite("row-deck")} onClick={onOpenDeck} title="Бойова колода" />
      </nav>
    </section>
  );
}
