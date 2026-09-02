import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CardElement,
  DuelCardSnapshot,
  DuelExchange,
  DuelSearchResponse,
  DuelSideSnapshot,
  DuelView,
  PlayerSummary,
} from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { BattleSwordIcon } from "../components/BattleSwordIcon";
import { CardArtwork, preloadCardArtwork } from "../components/CardArtwork";
import { CardHud } from "../components/CardHud";
import { CardFxWrapper, type CardFxArtworkLayers } from "../components/CardFxWrapper";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { LeagueProgressCard } from "../components/LeagueProgressCard";
import { Lariska } from "../components/Lariska";
import { ResourceIcon } from "../components/ResourceIcon";
import { getUiNumberLocale } from "../i18n";
import { getTelegramInitData } from "../telegram";
import {
  DuelApiError,
  loadActiveDuel,
  loadDuel,
  searchDuelOpponent,
  startDuel,
  submitDuelAction,
} from "../telegram/duel";

const LAST_DUEL_STORAGE_KEY = "cardastika:last-duel-id";
const DUEL_SEARCH_MIN_DISPLAY_MS = 620;
const DUEL_LOG_SWORDS_NEUTRAL = "/assets/ui/world-tree/game-icons/swords-neutral.svg";
const DUEL_LOG_SWORDS_ADVANTAGE = "/assets/ui/world-tree/game-icons/swords-gold-gray.svg";
const DUEL_RESULT_ARTWORK = {
  win: "/assets/ui/duel/duel-result-victory.png",
  loss: "/assets/ui/duel/duel-result-defeat.png",
} as const;
export type DuelEffectLevel = "weak" | "normal" | "strong";

export function getEffectLevel(multiplier: DuelExchange["playerMultiplier"]): DuelEffectLevel {
  if (multiplier === 0.5) return "weak";
  if (multiplier === 1.5) return "strong";
  return "normal";
}

export function getImpactLevel(playerLevel: DuelEffectLevel, enemyLevel: DuelEffectLevel): DuelEffectLevel {
  if (playerLevel === "strong" || enemyLevel === "strong") return "strong";
  if (playerLevel === "normal" || enemyLevel === "normal") return "normal";
  return "weak";
}

function preloadDuelArtwork(duel: DuelView) {
  const cards = [...duel.playerActiveCards, ...duel.enemyActiveCards];
  const latestExchange = duel.battleLog[0];
  if (latestExchange) cards.push(latestExchange.playerCard, latestExchange.enemyCard);
  const seen = new Set<string>();
  cards.forEach((card) => {
    const cacheKey = `${card.artKey ?? ""}:${card.cardId}`;
    if (seen.has(cacheKey)) return;
    seen.add(cacheKey);
    preloadCardArtwork(card.artKey, card.cardId);
  });
}

type DuelScreenState =
  | { status: "loading" | "searching" }
  | { status: "preview"; search: DuelSearchResponse }
  | { status: "duel"; duel: DuelView }
  | { status: "no-opponent" }
  | { status: "error"; message: string };

interface DuelScreenProps {
  onBack: () => void;
  onPlayerSummaryChange: (player: Partial<Pick<PlayerSummary, "duelHighestLeagueIndex" | "duelRating" | "level" | "silver" | "gold">>) => void;
  onTutorialResult?: () => void | Promise<void>;
  onTutorialDuelState?: (duel: DuelView) => void;
  tutorialAllowedSlot?: 0 | 1 | null;
  tutorialMode?: boolean;
}

type DuelSearchRunePhase = "searching" | "found";
type DuelSearchRuneVariant = "outer" | "inner" | "core";

const DUEL_SEARCH_RUNE_VARIANTS: DuelSearchRuneVariant[] = ["outer", "inner", "core"];
const DUEL_SEARCH_RUNE_SOURCES: Record<DuelSearchRuneVariant, string> = {
  outer: "/assets/ui/duel-search/magic-swirl.svg",
  inner: "/assets/ui/duel-search/rune-stone.svg",
  core: "/assets/ui/duel-search/vortex.svg",
};

function DuelSearchRune({ phase, variant }: { phase: DuelSearchRunePhase; variant: DuelSearchRuneVariant }) {
  return (
    <div aria-hidden="true" className={`duel-search-rune duel-search-rune--${phase} duel-search-rune--${variant}`}>
      <img alt="" className={`duel-search-rune__${variant}`} src={DUEL_SEARCH_RUNE_SOURCES[variant]} />
      <span className="duel-search-rune__particles">
        {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
      </span>
    </div>
  );
}

function getOpponentStrengthCategory(powerDifferencePct: number) {
  if (powerDifferencePct <= -20) return { label: "ЗНАЧНО СЛАБШИЙ", tone: "much-weaker" };
  if (powerDifferencePct < -8) return { label: "СЛАБШИЙ", tone: "weaker" };
  if (powerDifferencePct <= 8) return { label: "ДОСТОЙНИЙ СУПЕРНИК", tone: "worthy" };
  if (powerDifferencePct < 20) return { label: "СИЛЬНІШИЙ", tone: "stronger" };
  return { label: "НЕБЕЗПЕЧНИЙ СУПЕРНИК", tone: "dangerous" };
}

function estimatePlayerDeckPower(opponentPower: number, powerDifferencePct: number) {
  const ratio = 1 + powerDifferencePct / 100;
  return ratio > 0 ? Math.max(0, Math.round(opponentPower / ratio)) : opponentPower;
}

export function PlayerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return (
    <span className="duel-avatar" aria-hidden="true">
      {photoUrl ? <img alt="" src={photoUrl} /> : <span>{name.slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}

function DuelHeading({ onBack }: { onBack: () => void }) {
  return (
    <header className="duel-heading">
      <button aria-label="Назад" onClick={onBack} type="button">
        <AppIcon name="chevron" size={18} />
      </button>
      <div>
        <span>Зала випробувань</span>
        <h1>Дуель</h1>
      </div>
    </header>
  );
}

function AnimatedHpValue({ currentHp, maximumHp }: { currentHp: number; maximumHp: number }) {
  const [displayedHp, setDisplayedHp] = useState(currentHp);
  const previousHpRef = useRef(currentHp);

  useEffect(() => {
    const from = previousHpRef.current;
    previousHpRef.current = currentHp;
    if (from === currentHp) {
      setDisplayedHp(currentHp);
      return;
    }

    const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    let frame: number | null = null;
    const animate = (time: number) => {
      const elapsed = time - startedAt;
      const progress = Math.min(1, elapsed / 300);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayedHp(Math.round(from + (currentHp - from) * eased));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [currentHp]);

  return <strong>{displayedHp} / {maximumHp}</strong>;
}

function HpImpactEffect({ element, level }: { element: CardElement; level: DuelEffectLevel }) {
  const particleCount = level === "strong" ? 8 : level === "normal" ? 5 : 3;
  return (
    <span aria-hidden="true" className={`duel-hp-impact duel-hp-impact--${element} duel-hp-impact--${level}`}>
      <span className="duel-hp-impact__core" />
      {Array.from({ length: particleCount }, (_, index) => <i key={index} />)}
    </span>
  );
}

export function HpPanel({ currentHp, maximumHp, side, tone, hit = false, damageElement, damageLevel = "normal", tutorialTarget }: {
  currentHp: number;
  maximumHp: number;
  side: Pick<DuelSideSnapshot, "level" | "name" | "photoUrl">;
  tone: "enemy" | "player";
  hit?: boolean;
  damageElement?: CardElement;
  damageLevel?: DuelEffectLevel;
  tutorialTarget?: string;
}) {
  const percentage = maximumHp > 0 ? Math.max(0, Math.min(100, currentHp / maximumHp * 100)) : 0;
  return (
    <section className={`duel-hp-panel duel-hp-panel--${tone}${hit ? ` duel-hp-panel--hit duel-hp-panel--hit-${damageLevel}` : ""}`} data-tutorial-target={tutorialTarget}>
      <PlayerAvatar name={side.name} photoUrl={side.photoUrl} />
      <div className="duel-hp-panel__body">
        <div>
          <strong>{side.name}</strong>
          <span>Рівень {side.level}</span>
        </div>
        <div className="duel-hp-panel__value">
          <span>HP</span>
          <AnimatedHpValue currentHp={currentHp} maximumHp={maximumHp} />
        </div>
        <div className="duel-hp-bar" aria-label={`HP ${currentHp} з ${maximumHp}`}>
          <span style={{ width: `${percentage}%` }} />
        </div>
      </div>
      {hit && damageElement ? <HpImpactEffect element={damageElement} level={damageLevel} /> : null}
    </section>
  );
}

export function BattleCard({ card, clashLevel, clashing = false, depthAssets, disabled, enemy = false, introActive = false, onClick, selected = false, tutorialTarget }: {
  card: DuelCardSnapshot;
  clashLevel?: DuelEffectLevel;
  clashing?: boolean;
  disabled?: boolean;
  depthAssets?: CardFxArtworkLayers;
  enemy?: boolean;
  introActive?: boolean;
  onClick?: () => void;
  selected?: boolean;
  tutorialTarget?: string;
}) {
  const className = [
    "duel-card",
    `deck-card--${card.element}`,
    `deck-card--${card.rarity}`,
    enemy ? "duel-card--enemy" : "duel-card--player",
    clashing ? `duel-card--clash-${enemy ? "enemy" : "player"}` : "",
    clashing && clashLevel ? `duel-card--clash-${enemy ? "enemy" : "player"}-${clashLevel}` : "",
    selected ? "duel-card--selected" : "",
    card.source === "guild" ? "duel-card--guild" : "",
  ].filter(Boolean).join(" ");
  const contents = (
    <CardFxWrapper artKey={card.artKey} cardId={card.cardId} compact depthAssets={depthAssets} element={card.element} rarity={card.rarity}>
      <CardHud element={card.element} power={card.finalPower} rarity={card.rarity} />
      {card.source === "guild" ? <span className="duel-card__guild-mark">Гільдія</span> : null}
    </CardFxWrapper>
  );
  if (enemy) return <div className={className}>{contents}</div>;
  return (
    <button
      aria-label={`${card.source === "guild" ? "Карта гільдії. " : ""}Атакувати картою ${card.displayName ?? card.code}`}
      className={className}
      data-tutorial-target={tutorialTarget}
      disabled={disabled || introActive}
      onClick={onClick}
      type="button"
    >
      {contents}
    </button>
  );
}

export function DuelFlyingCard({ card, side, impactLevel, slotIndex }: {
  card: DuelCardSnapshot;
  side: "player" | "enemy";
  impactLevel: DuelEffectLevel;
  slotIndex: 0 | 1 | 2;
}) {
  return (
    <div
      aria-hidden="true"
      className={`duel-card duel-flying-card duel-flying-card--${side} duel-flying-card--${impactLevel} duel-flying-card--slot-${slotIndex} duel-card--${card.element} deck-card--${card.rarity}${card.source === "guild" ? " duel-card--guild" : ""}`}
    >
      <CardFxWrapper artKey={card.artKey} cardId={card.cardId} compact element={card.element} rarity={card.rarity}>
        <CardHud element={card.element} power={card.finalPower} rarity={card.rarity} />
        {card.source === "guild" ? <span className="duel-card__guild-mark">Гільдія</span> : null}
      </CardFxWrapper>
    </div>
  );
}

function DuelIntroOverlay() {
  return (
    <div aria-hidden="true" className="duel-intro">
      <span>ТВОЯ КОЛОДА</span>
      <strong>VS</strong>
      <span>КОЛОДА СУПЕРНИКА</span>
      <b>ДУЕЛЬ</b>
    </div>
  );
}

export function DuelClashOverlay({ exchange }: { exchange: DuelExchange }) {
  const playerLevel = getEffectLevel(exchange.playerMultiplier);
  const enemyLevel = getEffectLevel(exchange.enemyMultiplier);
  const impactLevel = getImpactLevel(playerLevel, enemyLevel);
  const playerStrong = playerLevel === "strong";
  const enemyStrong = enemyLevel === "strong";
  const advantage = exchange.visualState !== "neutral";
  const particleCount = impactLevel === "strong" ? 8 : impactLevel === "normal" ? 4 : 2;

  return (
    <div aria-hidden="true" className={`duel-clash duel-clash--${exchange.playerCard.element} duel-clash--impact-${impactLevel} duel-clash--${exchange.visualState} duel-clash--slot-${exchange.slotIndex}`}>
      <span className={`duel-clash__trail duel-clash__trail--player duel-clash__trail--${exchange.playerCard.element}`} />
      <span className={`duel-clash__trail duel-clash__trail--enemy duel-clash__trail--${exchange.enemyCard.element}`} />
      <span className="duel-clash__flash" />
      <span className={`duel-clash__damage duel-clash__damage--player duel-clash__damage--${playerLevel}${playerStrong ? " is-strong" : ""}`}>
        <strong>−{exchange.playerDamage}</strong>
        <small>×{exchange.playerMultiplier}</small>
      </span>
      <BattleSwordIcon tone={playerStrong || enemyStrong ? "gold" : "gray"} />
      <span className={`duel-clash__damage duel-clash__damage--enemy duel-clash__damage--${enemyLevel}${enemyStrong ? " is-strong" : ""}`}>
        <strong>−{exchange.enemyDamage}</strong>
        <small>×{exchange.enemyMultiplier}</small>
      </span>
      {advantage ? <strong className="duel-clash__advantage">ПЕРЕВАГА</strong> : null}
      <span className="duel-clash__particles">
        {Array.from({ length: particleCount }, (_, index) => <i key={index} />)}
      </span>
    </div>
  );
}

function BattleLogRow({ exchange, latest = false }: { exchange: DuelExchange; latest?: boolean }) {
  const playerStrong = exchange.visualState === "player_strong";
  const enemyStrong = exchange.visualState === "enemy_strong";
  const swordSource = playerStrong || enemyStrong ? DUEL_LOG_SWORDS_ADVANTAGE : DUEL_LOG_SWORDS_NEUTRAL;
  return (
    <li className={`battle-log-row battle-log-row--${exchange.visualState}${latest ? " battle-log-row--latest" : ""}`}>
      <span className="battle-log-art"><CardArtwork artKey={exchange.playerCard.artKey} cardId={exchange.playerCard.cardId} element={exchange.playerCard.element} /></span>
      <strong className="battle-log-damage battle-log-damage--player">{exchange.playerDamage}</strong>
      <span
        aria-label={playerStrong ? "Перевага вашої стихії" : enemyStrong ? "Перевага стихії суперника" : "Стихії рівноцінні"}
        className={`battle-log-advantage battle-log-advantage--${exchange.visualState}`}
      >
        <img
          alt=""
          aria-hidden="true"
          className={`battle-log-advantage__icon${playerStrong ? " battle-log-advantage__icon--mirrored" : ""}`}
          src={swordSource}
        />
      </span>
      <strong className="battle-log-damage battle-log-damage--enemy">{exchange.enemyDamage}</strong>
      <span className="battle-log-art"><CardArtwork artKey={exchange.enemyCard.artKey} cardId={exchange.enemyCard.cardId} element={exchange.enemyCard.element} /></span>
    </li>
  );
}

export function BattleLog({ entries, animateLatest = false, emptyMessage = "Оберіть одну зі своїх карт, щоб розпочати обмін.", headerAction }: {
  entries: DuelExchange[];
  animateLatest?: boolean;
  emptyMessage?: string;
  headerAction?: ReactNode;
}) {
  const latestTurn = entries[0]?.turnNumber;
  return (
    <section className="battle-log">
      <header>
        <h2>Журнал бою</h2>
        {headerAction ? (
          <div className="battle-log__header-actions">
            <span>{entries.length ? `Хід ${entries[0]!.turnNumber}` : "Очікує першого ходу"}</span>
            {headerAction}
          </div>
        ) : <span>{entries.length ? `Хід ${entries[0]!.turnNumber}` : "Очікує першого ходу"}</span>}
      </header>
      {entries.length ? (
        <ol>{entries.map((entry) => <BattleLogRow exchange={entry} key={entry.turnNumber} latest={animateLatest && entry.turnNumber === latestTurn} />)}</ol>
      ) : <p>{emptyMessage}</p>}
    </section>
  );
}

function DuelBattle({ duel, pendingSlot, onAction, tutorialAllowedSlot = null, tutorialMode }: {
  duel: DuelView;
  pendingSlot: 0 | 1 | 2 | null;
  onAction: (slotIndex: 0 | 1 | 2) => void;
  tutorialAllowedSlot?: 0 | 1 | null;
  tutorialMode?: boolean;
}) {
  const initialExchange = duel.battleLog[0] ?? null;
  const [introActive, setIntroActive] = useState(() => duel.battleLog.length === 0);
  const [clash, setClash] = useState<DuelExchange | null>(null);
  const lastTurnRef = useRef(initialExchange?.turnNumber ?? 0);

  useEffect(() => {
    if (!introActive) return;
    const timer = window.setTimeout(() => setIntroActive(false), 720);
    return () => window.clearTimeout(timer);
  }, [introActive]);

  useEffect(() => {
    const latest = duel.battleLog[0];
    if (!latest || latest.turnNumber <= lastTurnRef.current) return;
    lastTurnRef.current = latest.turnNumber;
    setClash(latest);
    const timer = window.setTimeout(() => setClash(null), 900);
    return () => window.clearTimeout(timer);
  }, [duel.battleLog]);

  const clashSlot = clash?.slotIndex ?? null;
  const battleClassName = [
    "duel-battle",
    introActive ? "duel-battle--intro" : "",
    clash ? "duel-battle--clash" : "",
  ].filter(Boolean).join(" ");
  const boardClassName = [
    "duel-board",
    introActive ? "duel-board--intro" : "",
    clash ? "duel-board--clash" : "",
  ].filter(Boolean).join(" ");
  const enemyHitLevel = clash ? getEffectLevel(clash.playerMultiplier) : "normal";
  const playerHitLevel = clash ? getEffectLevel(clash.enemyMultiplier) : "normal";
  const clashImpactLevel = getImpactLevel(enemyHitLevel, playerHitLevel);

  return (
    <div className={battleClassName}>
      <HpPanel
        currentHp={duel.enemyHp}
        damageElement={clash?.playerCard.element}
        damageLevel={enemyHitLevel}
        maximumHp={duel.enemyMaxHp}
        side={duel.opponent}
        tone="enemy"
        hit={clash !== null}
      />
      <div className={boardClassName} aria-label="Бойове поле">
        {introActive ? <DuelIntroOverlay /> : null}
        {clash ? (
          <div aria-hidden="true" className="duel-flight-layer">
            <DuelFlyingCard
              card={clash.playerCard}
              impactLevel={clashImpactLevel}
              side="player"
              slotIndex={clash.slotIndex}
            />
            <DuelFlyingCard
              card={clash.enemyCard}
              impactLevel={clashImpactLevel}
              side="enemy"
              slotIndex={clash.slotIndex}
            />
          </div>
        ) : null}
        {clash ? <DuelClashOverlay exchange={clash} /> : null}
        <div className="duel-card-row duel-card-row--enemy">
          {duel.enemyActiveCards.map((card, index) => (
            <BattleCard
              card={card}
              clashLevel={clashSlot === index && clash ? getEffectLevel(clash.enemyMultiplier) : undefined}
              clashing={clashSlot === index}
              enemy
              key={card.instanceId}
            />
          ))}
        </div>
        <div className="duel-multiplier-row" aria-label="Множники атаки гравця" data-tutorial-target={tutorialMode ? "duel-multiplier" : undefined}>
          {duel.pairMultipliers.map((multiplier, index) => (
            <span className={`duel-multiplier duel-multiplier--${String(multiplier).replace(".", "-")}`} key={index}>
              ×{multiplier}
            </span>
          ))}
        </div>
        <div className="duel-card-row duel-card-row--player">
          {duel.playerActiveCards.map((card, index) => (
            <BattleCard
              card={card}
              clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined}
              clashing={clashSlot === index}
              disabled={pendingSlot !== null || (tutorialAllowedSlot !== null && tutorialAllowedSlot !== index)}
              introActive={introActive}
              key={card.instanceId}
              onClick={() => onAction(index as 0 | 1 | 2)}
              selected={pendingSlot === index}
              tutorialTarget={tutorialMode
                ? index === 0
                  ? "duel-card-first duel-card"
                  : index === 1
                    ? "duel-card-second duel-card"
                    : "duel-card"
                : undefined}
            />
          ))}
        </div>
      </div>
      <HpPanel
        currentHp={duel.playerHp}
        damageElement={clash?.enemyCard.element}
        damageLevel={playerHitLevel}
        maximumHp={duel.playerMaxHp}
        side={duel.player}
        tone="player"
        hit={clash !== null}
        tutorialTarget={tutorialMode ? "player-hp" : undefined}
      />
      <p className="duel-action-hint">{pendingSlot === null ? "Оберіть свою карту" : "Обмін ударами…"}</p>
      <section data-tutorial-target={tutorialMode ? "duel-log" : undefined}>
        <BattleLog animateLatest={clash !== null} entries={duel.battleLog} />
      </section>
    </div>
  );
}

function DuelResultView({ duel, onReturn, onTutorialResult, tutorialMode }: { duel: DuelView; onReturn: () => void; onTutorialResult?: () => void | Promise<void>; tutorialMode?: boolean }) {
  const result = duel.result;
  const [tutorialResultPending, setTutorialResultPending] = useState(false);
  if (!result) return null;
  if (tutorialMode) {
    return (
      <section className="duel-result duel-result--tutorial" data-tutorial-target="duel-result">
        <div className="tutorial-result__banner" aria-hidden="true"><span>ПЕРЕМОГА</span></div>
        <p className="tutorial-result__received">Ти отримав:</p>
        <div aria-label="Нагороди за перемогу" className="tutorial-result__rewards">
          <span><CurrencyIcon kind="silver" size={18} />{result.silver}</span>
          <span><ResourceIcon kind="xp" size={18} />{result.xp}</span>
        </div>
        <p className="tutorial-result__wins">Перемог у дуелях: {result.player.duelWins}</p>
        <div className="tutorial-result__dialogue">
          <div aria-hidden="true"><Lariska emotion="happy" /></div>
          <p>Вперед за нагородою. І не загуби колоду дорогою!</p>
        </div>
        <button
          className="tutorial-result__button"
          disabled={tutorialResultPending}
          onClick={() => {
            if (!onTutorialResult) {
              onReturn();
              return;
            }
            setTutorialResultPending(true);
            void Promise.resolve(onTutorialResult()).finally(() => setTutorialResultPending(false));
          }}
          type="button"
        >
          {tutorialResultPending ? "Завантаження…" : "За нагородою"}
        </button>
      </section>
    );
  }
  const latestLevel = result.reachedLevels.at(-1);
  const duelGoldReward = result.duelGoldReward ?? 0;
  const levelUpGoldReward = result.levelUpGoldReward ?? result.gold;
  const totalSilverEarned = result.totalSilverEarned ?? result.silver;
  const totalPlayerDamage = duel.battleLog.reduce((total, exchange) => total + exchange.playerDamage, 0);
  const streakTone = result.winStreak >= 10 ? "legendary" : result.winStreak >= 5 ? "hot" : result.winStreak >= 3 ? "warm" : "normal";
  const lariskaEmotion = result.outcome === "loss" ? "sad" : result.winStreak >= 3 ? "happy" : "sly";
  const lariskaMessage = result.outcome === "loss"
    ? "Гаразд, цього разу карти перемогли. Наступного разу не дай їм такої радості."
    : result.winStreak >= 3
      ? "Оце серія. Не звикай — тепер суперники будуть уважніші."
      : "Непогано. Я очікувала гіршого.";
  const formatNumber = (value: number) => new Intl.NumberFormat(getUiNumberLocale()).format(value);
  const formatReward = (value: number) => value > 0 ? `+${formatNumber(value)}` : "—";
  return (
    <section className={`duel-result duel-result--${result.outcome}`} data-tutorial-target={tutorialMode ? "duel-result" : undefined}>
      <div className="duel-result__content">
        <div className="duel-result__artwork-wrap">
          <img alt="" aria-hidden="true" className="duel-result__artwork" src={DUEL_RESULT_ARTWORK[result.outcome]} />
        </div>
        <div className="duel-result__title">
          <span className="duel-result__eyebrow">{result.outcome === "win" ? "Випробування завершено" : "Бій завершено"}</span>
          <h1>{result.outcome === "win" ? "ПЕРЕМОГА" : "ПОРАЗКА"}</h1>
        </div>
        <div aria-label="Нагороди за дуель" className="duel-result__rewards">
          <div className="duel-result__reward duel-result__reward--xp">
            <span><ResourceIcon kind="xp" size={17} />XP</span>
            <strong>{formatReward(result.xp)}</strong>
          </div>
          <div className="duel-result__reward duel-result__reward--silver">
            <span><CurrencyIcon kind="silver" size={17} />Срібло</span>
            <strong>{formatReward(totalSilverEarned)}</strong>
          </div>
          <div className={`duel-result__reward duel-result__reward--gold${duelGoldReward === 0 ? " duel-result__reward--empty" : ""}`}>
            <span><CurrencyIcon kind="gold" size={17} />Gold</span>
            <strong>{formatReward(duelGoldReward)}</strong>
          </div>
        </div>
        {result.leagueProgression ? (
          <LeagueProgressCard
            compact
            nextLabel="plain"
            rating={result.leagueProgression.ratingAfter}
            ratingChange={result.leagueProgression.ratingChange}
            showRewards={false}
          />
        ) : null}
        {result.outcome === "win" ? (
          <div className={`duel-result__streak duel-result__streak--${streakTone}`}>
            <AppIcon name="tournament" size={17} />
            <span>Серія перемог</span>
            <strong>×{result.winStreak}</strong>
          </div>
        ) : null}
        <p className="duel-result__summary">
          <AppIcon name="duel" size={16} />
          <span>{duel.battleLog.length} {duel.battleLog.length === 1 ? "обмін" : "обмінів"}</span>
          <i>·</i>
          <span>Завдано {formatNumber(totalPlayerDamage)} шкоди</span>
        </p>
        <div className={`duel-result__mascot duel-result__mascot--${lariskaEmotion}`}>
          <Lariska emotion={lariskaEmotion} />
          <p>{lariskaMessage}</p>
        </div>
        {latestLevel ? (
          <div className="duel-result__level-up">
            <span><AppIcon name="card-strength" size={16} />Новий рівень</span>
            <strong>{latestLevel}</strong>
            <small><CurrencyIcon kind="gold" size={14} />+{formatNumber(levelUpGoldReward)} GOLD</small>
          </div>
        ) : null}
        {result.accountBoostMultiplier === 2 ? <p className="duel-result__boost"><strong>Буст ×2 активний</strong></p> : null}
        <button className="duel-primary-button" data-tutorial-target={tutorialMode ? "duel-result" : undefined} onClick={tutorialMode && onTutorialResult ? onTutorialResult : onReturn} type="button">{tutorialMode ? "ЗА НАГОРОДОЮ" : "До дуелей"}</button>
      </div>
    </section>
  );
}

export function DuelScreen({ onBack, onPlayerSummaryChange, onTutorialDuelState, onTutorialResult, tutorialAllowedSlot = null, tutorialMode = false }: DuelScreenProps) {
  const [state, setState] = useState<DuelScreenState>({ status: "loading" });
  const [pendingSlot, setPendingSlot] = useState<0 | 1 | 2 | null>(null);
  const searchRuneIndexRef = useRef(0);
  const [searchRuneVariant, setSearchRuneVariant] = useState<DuelSearchRuneVariant>(DUEL_SEARCH_RUNE_VARIANTS[0]!);

  const showDuel = useCallback((duel: DuelView) => {
    if (duel.status === "active") {
      window.localStorage.setItem(LAST_DUEL_STORAGE_KEY, duel.duelId);
    } else {
      window.localStorage.removeItem(LAST_DUEL_STORAGE_KEY);
    }
    preloadDuelArtwork(duel);
    if (duel.result) onPlayerSummaryChange(duel.result.player);
    if (tutorialMode) onTutorialDuelState?.(duel);
    setState({ status: "duel", duel });
  }, [onPlayerSummaryChange, onTutorialDuelState, tutorialMode]);

  const search = useCallback(async (initData: string, signal?: AbortSignal) => {
    const searchStartedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    const nextRuneVariant = DUEL_SEARCH_RUNE_VARIANTS[searchRuneIndexRef.current % DUEL_SEARCH_RUNE_VARIANTS.length]!;
    searchRuneIndexRef.current += 1;
    setSearchRuneVariant(nextRuneVariant);
    setState({ status: "searching" });
    try {
      const searchResult = await searchDuelOpponent(initData, signal);
      const elapsed = (typeof performance === "undefined" ? Date.now() : performance.now()) - searchStartedAt;
      if (elapsed < DUEL_SEARCH_MIN_DISPLAY_MS) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, DUEL_SEARCH_MIN_DISPLAY_MS - elapsed));
      }
      if (signal?.aborted) return;
      if (tutorialMode) {
        showDuel(await startDuel(initData, searchResult.searchId, tutorialMode, signal));
      } else {
        setState({ status: "preview", search: searchResult });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const elapsed = (typeof performance === "undefined" ? Date.now() : performance.now()) - searchStartedAt;
      if (elapsed < DUEL_SEARCH_MIN_DISPLAY_MS) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, DUEL_SEARCH_MIN_DISPLAY_MS - elapsed));
      }
      if (signal?.aborted) return;
      if (error instanceof DuelApiError && error.code === "no_opponent_found") {
        setState({ status: "no-opponent" });
        return;
      }
      setState({ status: "error", message: "Не вдалося виконати пошук суперника" });
    }
  }, [showDuel, tutorialMode]);

  const searchRef = useRef(search);
  const showDuelRef = useRef(showDuel);

  useEffect(() => {
    searchRef.current = search;
    showDuelRef.current = showDuel;
  }, [search, showDuel]);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error", message: "Дуель доступна лише в Telegram Mini App" });
      return;
    }
    const controller = new AbortController();
    const presentDuel = showDuelRef.current;
    const searchOpponent = searchRef.current;
    void (async () => {
      try {
        const active = await loadActiveDuel(initData, controller.signal);
        if (active.duel) {
          presentDuel(active.duel);
          return;
        }
        const rememberedId = window.localStorage.getItem(LAST_DUEL_STORAGE_KEY);
        if (rememberedId) {
          try {
            const remembered = await loadDuel(initData, rememberedId, controller.signal);
            if (remembered.status === "active") {
              presentDuel(remembered);
              return;
            }
            window.localStorage.removeItem(LAST_DUEL_STORAGE_KEY);
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            window.localStorage.removeItem(LAST_DUEL_STORAGE_KEY);
          }
        }
        await searchOpponent(initData, controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Не вдалося відновити стан Дуелі" });
      }
    })();
    return () => controller.abort();
  }, []);

  async function handleSearchAgain() {
    const initData = getTelegramInitData();
    if (initData) await search(initData);
  }

  async function handleStart(searchId: string) {
    const initData = getTelegramInitData();
    if (!initData) return;
    setState({ status: "loading" });
    try {
      showDuel(await startDuel(initData, searchId));
    } catch (error) {
      if (error instanceof DuelApiError && error.code === "no_opponent_found") {
        setState({ status: "no-opponent" });
        return;
      }
      setState({ status: "error", message: "Не вдалося розпочати Дуель" });
    }
  }

  async function handleAction(slotIndex: 0 | 1 | 2) {
    if (state.status !== "duel" || state.duel.status !== "active" || pendingSlot !== null) return;
    const initData = getTelegramInitData();
    if (!initData) return;
    setPendingSlot(slotIndex);
    try {
      showDuel(await submitDuelAction(initData, state.duel.duelId, {
        slotIndex,
        expectedVersion: state.duel.version,
      }));
    } catch (error) {
      if (error instanceof DuelApiError && error.code === "duel_state_conflict") {
        try {
          showDuel(await loadDuel(initData, state.duel.duelId));
        } catch {
          setState({ status: "error", message: "Не вдалося синхронізувати стан Дуелі" });
        }
      } else {
        setState({ status: "error", message: "Хід не виконано. Спробуйте ще раз" });
      }
    } finally {
      setPendingSlot(null);
    }
  }

  function returnToDuels() {
    window.localStorage.removeItem(LAST_DUEL_STORAGE_KEY);
    void handleSearchAgain();
  }

  if (state.status === "duel") {
    return state.duel.status === "active"
      ? <DuelBattle duel={state.duel} onAction={handleAction} pendingSlot={pendingSlot} tutorialAllowedSlot={tutorialAllowedSlot} tutorialMode={tutorialMode} />
      : <DuelResultView duel={state.duel} onReturn={returnToDuels} onTutorialResult={onTutorialResult} tutorialMode={tutorialMode} />;
  }

  return (
    <div className="duel-search-screen">
      <DuelHeading onBack={onBack} />
      {state.status === "loading" || state.status === "searching" ? (
        <div aria-live="polite" className="duel-search-state" role="status">
          <DuelSearchRune phase="searching" variant={searchRuneVariant} />
          <strong>{state.status === "searching" ? "ШУКАЄМО СУПЕРНИКА" : "ЗАВАНТАЖУЄМО ДУЕЛЬ"}</strong>
          <span>Підбір за силою колоди</span>
          {state.status === "searching" ? <span aria-label="Пошук триває" className="duel-search-dots"><i /><i /><i /></span> : null}
        </div>
      ) : null}
      {state.status === "preview" ? (
        <section aria-live="polite" className="duel-opponent-preview duel-opponent-preview--found">
          <div className="duel-opponent-preview__mark">
            <span className="duel-opponent-preview__avatar"><PlayerAvatar name={state.search.opponent.name} photoUrl={state.search.opponent.photoUrl} /></span>
          </div>
          <div className="duel-opponent-preview__intro">
            <span>ЗНАЙДЕНО СУПЕРНИКА</span>
            <h2>{state.search.opponent.name}</h2>
            <p>Рівень {state.search.opponent.level}</p>
          </div>
          {(() => {
            const category = getOpponentStrengthCategory(state.search.opponent.powerDifferencePct);
            return <>
              <p className={`duel-opponent-category duel-opponent-category--${category.tone}`}>{category.label}</p>
              <div
                aria-label={`Сила колоди: ви ${estimatePlayerDeckPower(state.search.opponent.effectiveDeckPower, state.search.opponent.powerDifferencePct)}, суперник ${state.search.opponent.effectiveDeckPower}`}
                className="duel-power-comparison"
              >
                <div><strong>{estimatePlayerDeckPower(state.search.opponent.effectiveDeckPower, state.search.opponent.powerDifferencePct)}</strong><span>ВИ</span></div>
                <BattleSwordIcon tone="gold" />
                <div><strong>{state.search.opponent.effectiveDeckPower}</strong><span>СУПЕРНИК</span></div>
              </div>
            </>;
          })()}
          <div className="duel-opponent-preview__actions">
            <button className="duel-primary-button" onClick={() => void handleStart(state.search.searchId)} type="button">НАПАСТИ</button>
            <button className="duel-secondary-button" onClick={() => void handleSearchAgain()} type="button">ШУКАТИ ІНШОГО</button>
          </div>
        </section>
      ) : null}
      {state.status === "no-opponent" ? (
        <div aria-live="polite" className="duel-search-state duel-search-state--empty" role="status">
          <strong>Суперника не знайдено</strong>
          <span>Зараз немає реального гравця з відповідною силою колоди.</span>
          <button className="duel-primary-button" onClick={() => void handleSearchAgain()} type="button">ШУКАТИ ІНШОГО</button>
        </div>
      ) : null}
      {state.status === "error" ? (
        <div aria-live="assertive" className="duel-search-state duel-search-state--error" role="alert">
          <strong>Дуель недоступна</strong>
          <span>{state.message}</span>
          <button className="duel-secondary-button" onClick={() => void handleSearchAgain()} type="button">СПРОБУВАТИ ЩЕ</button>
        </div>
      ) : null}
    </div>
  );
}
