import { useCallback, useEffect, useState } from "react";
import type {
  DuelCardSnapshot,
  DuelExchange,
  DuelSearchResponse,
  DuelSideSnapshot,
  DuelView,
  PlayerSummary,
} from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { BattleSwordIcon } from "../components/BattleSwordIcon";
import { CardArtwork } from "../components/CardArtwork";
import { ElementSymbol } from "../components/ElementSymbol";
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

type DuelScreenState =
  | { status: "loading" | "searching" }
  | { status: "preview"; search: DuelSearchResponse }
  | { status: "duel"; duel: DuelView }
  | { status: "no-opponent" }
  | { status: "error"; message: string };

interface DuelScreenProps {
  onBack: () => void;
  onPlayerSummaryChange: (player: Partial<Pick<PlayerSummary, "level" | "silver" | "gold">>) => void;
}

function PlayerAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
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

function HpPanel({ currentHp, maximumHp, side, tone }: {
  currentHp: number;
  maximumHp: number;
  side: DuelSideSnapshot;
  tone: "enemy" | "player";
}) {
  const percentage = maximumHp > 0 ? Math.max(0, Math.min(100, currentHp / maximumHp * 100)) : 0;
  return (
    <section className={`duel-hp-panel duel-hp-panel--${tone}`}>
      <PlayerAvatar name={side.name} photoUrl={side.photoUrl} />
      <div className="duel-hp-panel__body">
        <div>
          <strong>{side.name}</strong>
          <span>Рівень {side.level}</span>
        </div>
        <div className="duel-hp-panel__value">
          <span>HP</span>
          <strong>{currentHp} / {maximumHp}</strong>
        </div>
        <div className="duel-hp-bar" aria-label={`HP ${currentHp} з ${maximumHp}`}>
          <span style={{ width: `${percentage}%` }} />
        </div>
      </div>
    </section>
  );
}

function BattleCard({ card, disabled, enemy = false, onClick, selected = false }: {
  card: DuelCardSnapshot;
  disabled?: boolean;
  enemy?: boolean;
  onClick?: () => void;
  selected?: boolean;
}) {
  const className = [
    "duel-card",
    `deck-card--${card.element}`,
    `deck-card--${card.rarity}`,
    enemy ? "duel-card--enemy" : "duel-card--player",
    selected ? "duel-card--selected" : "",
  ].filter(Boolean).join(" ");
  const contents = (
    <>
      <CardArtwork artKey={card.artKey} element={card.element} />
      <strong className="duel-card__power">{card.finalPower}</strong>
      <span className="duel-card__element"><ElementSymbol element={card.element} /></span>
      <span className="duel-card__rarity" />
    </>
  );
  if (enemy) return <div className={className}>{contents}</div>;
  return (
    <button
      aria-label={`Атакувати картою ${card.displayName ?? card.code}`}
      className={className}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {contents}
    </button>
  );
}

function BattleLogRow({ exchange }: { exchange: DuelExchange }) {
  const playerStrong = exchange.visualState === "player_strong";
  const enemyStrong = exchange.visualState === "enemy_strong";
  return (
    <li className={`battle-log-row battle-log-row--${exchange.visualState}`}>
      <span className="battle-log-art"><CardArtwork artKey={exchange.playerCard.artKey} element={exchange.playerCard.element} /></span>
      <strong className="battle-log-damage battle-log-damage--player">{exchange.playerDamage}</strong>
      <BattleSwordIcon tone={playerStrong ? "gold" : "gray"} />
      <BattleSwordIcon tone={enemyStrong ? "gold" : "gray"} />
      <strong className="battle-log-damage battle-log-damage--enemy">{exchange.enemyDamage}</strong>
      <span className="battle-log-art"><CardArtwork artKey={exchange.enemyCard.artKey} element={exchange.enemyCard.element} /></span>
    </li>
  );
}

function BattleLog({ entries }: { entries: DuelExchange[] }) {
  return (
    <section className="battle-log">
      <header>
        <h2>Журнал бою</h2>
        <span>{entries.length ? `Хід ${entries[0]!.turnNumber}` : "Очікує першого ходу"}</span>
      </header>
      {entries.length ? (
        <ol>{entries.map((entry) => <BattleLogRow exchange={entry} key={entry.turnNumber} />)}</ol>
      ) : <p>Оберіть одну зі своїх карт, щоб розпочати обмін.</p>}
    </section>
  );
}

function DuelBattle({ duel, pendingSlot, onAction }: {
  duel: DuelView;
  pendingSlot: 0 | 1 | 2 | null;
  onAction: (slotIndex: 0 | 1 | 2) => void;
}) {
  return (
    <div className="duel-battle">
      <HpPanel currentHp={duel.enemyHp} maximumHp={duel.enemyMaxHp} side={duel.opponent} tone="enemy" />
      <div className="duel-board" aria-label="Бойове поле">
        <div className="duel-card-row duel-card-row--enemy">
          {duel.enemyActiveCards.map((card) => <BattleCard card={card} enemy key={card.instanceId} />)}
        </div>
        <div className="duel-multiplier-row" aria-label="Множники атаки гравця">
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
              disabled={pendingSlot !== null}
              key={card.instanceId}
              onClick={() => onAction(index as 0 | 1 | 2)}
              selected={pendingSlot === index}
            />
          ))}
        </div>
      </div>
      <HpPanel currentHp={duel.playerHp} maximumHp={duel.playerMaxHp} side={duel.player} tone="player" />
      <p className="duel-action-hint">{pendingSlot === null ? "Оберіть свою карту" : "Обмін ударами…"}</p>
      <BattleLog entries={duel.battleLog} />
    </div>
  );
}

function DuelResultView({ duel, onReturn }: { duel: DuelView; onReturn: () => void }) {
  const result = duel.result;
  if (!result) return null;
  const latestLevel = result.reachedLevels.at(-1);
  return (
    <section className={`duel-result duel-result--${result.outcome}`}>
      <span>{result.outcome === "win" ? "Випробування завершено" : "Бій завершено"}</span>
      <h1>{result.outcome === "win" ? "ПЕРЕМОГА" : "ПОРАЗКА"}</h1>
      <div className="duel-result__rewards">
        <div><span>Досвід</span><strong>+{result.xp} XP</strong></div>
        <div><span>Срібло</span><strong>+{result.silver}</strong></div>
      </div>
      {latestLevel ? (
        <div className="duel-level-up">
          <span>Новий рівень</span>
          <strong>{latestLevel}</strong>
          <small>+{result.gold} Gold</small>
        </div>
      ) : null}
      {result.outcome === "win" ? <p>Серія перемог: <strong>{result.winStreak}</strong></p> : null}
      <button className="duel-primary-button" onClick={onReturn} type="button">До дуелей</button>
    </section>
  );
}

export function DuelScreen({ onBack, onPlayerSummaryChange }: DuelScreenProps) {
  const [state, setState] = useState<DuelScreenState>({ status: "loading" });
  const [pendingSlot, setPendingSlot] = useState<0 | 1 | 2 | null>(null);

  const showDuel = useCallback((duel: DuelView) => {
    window.localStorage.setItem(LAST_DUEL_STORAGE_KEY, duel.duelId);
    if (duel.result) onPlayerSummaryChange(duel.result.player);
    setState({ status: "duel", duel });
  }, [onPlayerSummaryChange]);

  const search = useCallback(async (initData: string, signal?: AbortSignal) => {
    setState({ status: "searching" });
    try {
      setState({ status: "preview", search: await searchDuelOpponent(initData, signal) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof DuelApiError && error.code === "no_opponent_found") {
        setState({ status: "no-opponent" });
        return;
      }
      setState({ status: "error", message: "Не вдалося виконати пошук суперника" });
    }
  }, []);

  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) {
      setState({ status: "error", message: "Дуель доступна лише в Telegram Mini App" });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const active = await loadActiveDuel(initData, controller.signal);
        if (active.duel) {
          showDuel(active.duel);
          return;
        }
        const rememberedId = window.localStorage.getItem(LAST_DUEL_STORAGE_KEY);
        if (rememberedId) {
          try {
            const remembered = await loadDuel(initData, rememberedId, controller.signal);
            showDuel(remembered);
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            window.localStorage.removeItem(LAST_DUEL_STORAGE_KEY);
          }
        }
        await search(initData, controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: "Не вдалося відновити стан Дуелі" });
      }
    })();
    return () => controller.abort();
  }, [search, showDuel]);

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
      ? <DuelBattle duel={state.duel} onAction={handleAction} pendingSlot={pendingSlot} />
      : <DuelResultView duel={state.duel} onReturn={returnToDuels} />;
  }

  return (
    <div className="duel-search-screen">
      <DuelHeading onBack={onBack} />
      {state.status === "loading" || state.status === "searching" ? (
        <div className="duel-search-state">
          <span className="duel-search-mark"><AppIcon name="duel" size={42} /></span>
          <strong>{state.status === "searching" ? "Шукаємо суперника" : "Завантажуємо Дуель"}</strong>
          <span>Підбір за силою колоди</span>
        </div>
      ) : null}
      {state.status === "preview" ? (
        <section className="duel-opponent-preview">
          <span>Знайдено суперника</span>
          <PlayerAvatar name={state.search.opponent.name} photoUrl={state.search.opponent.photoUrl} />
          <h2>{state.search.opponent.name}</h2>
          <p>Рівень {state.search.opponent.level}</p>
          <div><span>Сила колоди</span><strong>{state.search.opponent.effectiveDeckPower}</strong></div>
          <small>Різниця сили: {state.search.opponent.powerDifferencePct > 0 ? "+" : ""}{state.search.opponent.powerDifferencePct}%</small>
          <button className="duel-primary-button" onClick={() => void handleStart(state.search.searchId)} type="button">Напасти</button>
          <button className="duel-secondary-button" onClick={() => void handleSearchAgain()} type="button">Шукати ще</button>
        </section>
      ) : null}
      {state.status === "no-opponent" ? (
        <div className="duel-search-state">
          <strong>Суперника не знайдено</strong>
          <span>Зараз немає реального гравця з відповідною силою колоди.</span>
          <button className="duel-primary-button" onClick={() => void handleSearchAgain()} type="button">Шукати ще</button>
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="duel-search-state duel-search-state--error">
          <strong>Дуель недоступна</strong>
          <span>{state.message}</span>
          <button className="duel-secondary-button" onClick={() => void handleSearchAgain()} type="button">Спробувати ще</button>
        </div>
      ) : null}
    </div>
  );
}
