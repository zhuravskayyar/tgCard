import { ScreenHeading } from "../components/ScreenHeading";
import { useBattleExchange, useBattleResultReady } from "../components/useBattlePresentation";
import { BattleAttackAnimation } from "../components/BattleAttackAnimation";
import { CardBack } from "../components/CardBack";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ArenaBattleLogEntry,
  ArenaCardSlot,
  ArenaDailyTasksView,
  ArenaLeaderboardResponse,
  ArenaParticipantView,
  ArenaProfileResponse,
  ArenaQueueView,
  ArenaView,
  DuelExchange,
  PlayerSummary,
} from "@cardastika/shared";
import { getArenaQueueDurationMs, getElementMultiplier } from "@cardastika/game-core";
import { AppIcon } from "../components/AppIcon";
import { BattleCard, BattleLog, getEffectLevel, HpPanel, PlayerAvatar } from "./DuelScreen";
import type { DuelEffectLevel } from "./DuelScreen";
import { FirstVisitHint } from "../components/FirstVisitHint";
import { GameChat } from "../components/GameChat";
import { MenuRow } from "../components/MenuRow";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { getTelegramInitData } from "../telegram";
import { formatUiNumber } from "../i18n";
import {
  ArenaApiError,
  changeArenaCards,
  changeArenaTarget,
  joinArenaQueue,
  leaveArenaQueue,
  loadActiveArena,
  loadArenaChat,
  loadArenaLeaderboard,
  loadArenaProfile,
  sendArenaChatMessage,
  submitArenaAction,
} from "../telegram/arena";
import "../styles/arena-book.css";

type ArenaPage = "lobby" | "league" | "rules";

interface ArenaScreenProps {
  onBack: () => void;
  onOpenTasks: () => void;
  onPlayerSummaryChange: (summary: Partial<Pick<PlayerSummary, "arenaLeagueIndex" | "arenaRating" | "arenaTop3Count" | "arenaWins" | "cardShards" | "gold" | "silver">>) => void;
}

const homeSprite = (name: string) => `/assets/ui/home/sprites/${name}.webp`;

function cooldownSeconds(until: string | null, now = Date.now()) {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1_000));
}

function ArenaHeading({ onBack, title = "Арена" }: { onBack: () => void; title?: string }) {
  return (
    <ScreenHeading onBack={onBack} title={title} />
  );
}

/** Rating rows and tasks under the lobby and the result, as in every mode menu. */
function ArenaMenu({ onOpenLeague, onOpenTasks }: { onOpenLeague: () => void; onOpenTasks: () => void }) {
  return (
    <nav aria-label="Розділи арени" className="arena-menu">
      <MenuRow chevron icon="ranking" iconSrc={homeSprite("row-icon-ranking")} illustrationSrc={homeSprite("row-ranking")} onClick={onOpenLeague} title="Рейтинг арени" />
      <MenuRow chevron icon="tasks" iconSrc={homeSprite("row-icon-tasks")} illustrationSrc={homeSprite("row-tasks")} onClick={onOpenTasks} title="Завдання" />
    </nav>
  );
}

function ArenaChat() {
  return <GameChat inputLabel="Повідомлення в чат арени" load={loadArenaChat} send={sendArenaChatMessage} signInNotice="Увійди в гру, щоб переглянути чат арени." title="Чат арени" unavailableNotice="Чат арени тимчасово недоступний." />;
}

function arenaTasksText(tasks: ArenaDailyTasksView) {
  const play = Math.max(0, tasks.play.target - tasks.play.progress);
  const win = Math.max(0, tasks.win.target - tasks.win.progress);
  if (!play && !win) return "Щоденні завдання арени виконано.";
  const parts = [play ? `зіграти ${play}` : null, win ? `виграти ${win}` : null].filter(Boolean);
  return `До виконання завдань лишилось: ${parts.join(", ")}.`;
}

function ArenaRatingMeter({ profile }: { profile: ArenaProfileResponse }) {
  const next = profile.nextArenaLeague;
  const floor = profile.arenaLeague.minRating;
  const progress = next ? percentage(profile.arenaRating - floor, next.minRating - floor) : 100;
  return (
    <div className="arena-rating-meter">
      <strong>Ваш рейтинг арени: {profile.arenaRating}</strong>
      <div aria-label={next ? `До ліги ${next.name}: ${Math.round(progress)}%` : "Найвища ліга"} className="arena-rating-meter__rail"><i style={{ width: `${progress}%` }} /></div>
      <small>{next ? `Ліга «${profile.arenaLeague.name}» · до «${next.name}» ${Math.max(0, next.minRating - profile.arenaRating)}` : `Ліга «${profile.arenaLeague.name}» — найвища`}</small>
    </div>
  );
}

function ArenaLobby({ profile, pending, onQueue, onRefresh, onOpenRules }: { profile: ArenaProfileResponse; pending: string | null; onQueue: () => void; onRefresh: () => void; onOpenRules: () => void }) {
  return (
    <section className="arena-lobby">
      <img alt="" className="arena-lobby__banner" height={260} src={homeSprite("mode-arena")} width={456} />
      <p className="arena-lobby__wait">Час очікування в черзі — не більше {getArenaQueueDurationMs(profile.arenaLeague.index, 1) / 1_000} секунд.</p>
      <div className="arena-lobby__actions">
        <button className="duel-primary-button" disabled={pending !== null} onClick={onQueue} type="button">{pending === "queue" ? "Записуємо…" : "Записатися"}</button>
        <button className="duel-secondary-button" disabled={pending !== null} onClick={onRefresh} type="button">Оновити</button>
      </div>
      <ArenaRatingMeter profile={profile} />
      <p className="arena-lobby__tasks">{arenaTasksText(profile.dailyTasks)}</p>
      <button className="arena-rules-link" onClick={onOpenRules} type="button">Правила арени</button>
    </section>
  );
}

function ArenaRules() {
  return (
    <section className="arena-rules">
      <h2>Як проходить бій</h2>
      <ul>
        <li>На арені б’ються шестеро. Справжні гравці, що записалися до старту, потрапляють в один бій, решту місць займають боти.</li>
        <li>Час до старту залежить від ліги: від 5 до 25 секунд. Кожен новий живий гравець наближає старт на 5 секунд.</li>
        <li>Бій іде циклами по 9 секунд; перші 9 секунд карти закриті. За цикл можна вдарити кожною з трьох карт. Використана карта закривається до кінця циклу, а невикористані лишаються на наступний.</li>
        <li>Удар — це обмін: карта суперника на тій самій лінії відповідає одразу. Ціль можна змінити кнопкою або торкнувшись аватара.</li>
        <li>Карти можна замінити: перша заміна безплатна, далі — 5 золота.</li>
      </ul>
      <h2>Хто перемагає</h2>
      <ul>
        <li>Бій триває, доки не лишиться один учасник, або завершується через три хвилини без ваших ударів.</li>
        <li>Перемагають троє, хто завдав найбільше шкоди; далі рахуються вбивства і залишок здоров’я.</li>
        <li>Менше трьох ходів — бій не зараховується: −3 рейтингу без перемоги й прогресу завдань.</li>
      </ul>
      <h2>Нагороди</h2>
      <ul>
        <li>Рейтинг арени окремий від дуелей і починається з 1400.</li>
        <li>Кожна нова ліга, досягнута вперше, дає срібло. Пониження настає, лише коли рейтинг на 100 нижчий за межу ліги.</li>
        <li>Щоденні завдання: 10 боїв і 5 перемог на арені.</li>
      </ul>
    </section>
  );
}

function percentage(value: number, maximum: number) {
  return maximum > 0 ? Math.max(0, Math.min(100, value / maximum * 100)) : 0;
}

function queueSeconds(queue: ArenaQueueView) {
  return Math.max(0, Math.ceil((new Date(queue.startsAt).getTime() - Date.now()) / 1_000));
}

function sameQueueView(left: ArenaQueueView | null, right: ArenaQueueView | null) {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.queueId === right.queueId
    && left.participantCount === right.participantCount
    && left.maxParticipants === right.maxParticipants
    && left.startsAt === right.startsAt;
}

function sameArenaView(left: ArenaView | null, right: ArenaView | null) {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.matchId === right.matchId
    && left.status === right.status
    && left.version === right.version
    && left.targetId === right.targetId;
}

function arenaLogToDuelExchange(entry: ArenaBattleLogEntry, playerId: string, turnNumber: number): DuelExchange | null {
  if (!entry.attackerCard || !entry.targetCard) return null;
  const playerAttack = entry.attackerId === playerId;
  const playerHit = entry.targetId === playerId;
  const botExchange = !playerAttack && !playerHit;
  const playerMultiplier = playerAttack ? entry.multiplier : 0.5;
  const enemyMultiplier = playerHit ? entry.multiplier : 0.5;
  return {
    enemyCard: playerAttack || botExchange ? entry.targetCard : entry.attackerCard,
    enemyDamage: playerHit ? entry.damage : entry.counterDamage ?? 0,
    enemyMultiplier,
    playerCard: playerAttack || botExchange ? entry.attackerCard : entry.targetCard,
    playerDamage: playerAttack || botExchange ? entry.damage : entry.counterDamage ?? 0,
    playerMultiplier: botExchange ? entry.multiplier : playerMultiplier,
    slotIndex: entry.slotIndex,
    turnNumber,
    visualState: (playerAttack || botExchange) && entry.multiplier === 1.5
      ? "player_strong"
      : playerHit && entry.multiplier === 1.5 ? "enemy_strong" : "neutral",
  };
}

function ArenaQueuePanel({ queue, pending, onLeave }: { queue: ArenaQueueView; pending: string | null; onLeave: () => void }) {
  const [remaining, setRemaining] = useState(() => queueSeconds(queue));

  useEffect(() => {
    setRemaining(queueSeconds(queue));
    const timer = window.setInterval(() => setRemaining((current) => {
      const next = queueSeconds(queue);
      return current === next ? current : next;
    }), 1_000);
    return () => window.clearInterval(timer);
  }, [queue]);

  const total = Math.max(1, Math.round((new Date(queue.startsAt).getTime() - new Date(queue.createdAt).getTime()) / 1_000));
  const shownRemaining = Math.min(remaining, total);
  const progress = Math.max(0, Math.min(100, (1 - shownRemaining / total) * 100));
  return (
    <section aria-live="polite" className="arena-queue-panel">
      <div className="arena-queue-panel__crest"><AppIcon name="arena" size={42} /></div>
      <span>РЕЄСТРАЦІЯ НА АРЕНУ</span>
      <h2>Бій почнеться через</h2>
      <strong className="arena-queue-panel__timer">00:{String(shownRemaining).padStart(2, "0")}</strong>
      <div aria-label={`Підготовка бою: ${Math.round(progress)}%`} className="arena-queue-panel__progress"><span style={{ width: `${progress}%` }} /></div>
      <p><b>{queue.participantCount} / {queue.maxParticipants}</b> живих учасників у черзі</p>
      <small>Справжні гравці можуть приєднатися до завершення таймера. Вільні місця заповнять боти після відліку.</small>
      <button className="duel-secondary-button" disabled={pending !== null} onClick={onLeave} type="button">Скасувати запис</button>
    </section>
  );
}

function ArenaSlot({ slot, enemy, disabled, defeated = false, onClick, lane, clashLevel, clashing = false }: { slot: ArenaCardSlot; enemy?: boolean; disabled?: boolean; defeated?: boolean; onClick?: () => void; lane: number; clashLevel?: DuelEffectLevel; clashing?: boolean }) {
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  useEffect(() => {
    if (!slot.cooldownUntil) return;
    const cooldownEnd = new Date(slot.cooldownUntil).getTime();
    let timer: number | undefined;
    const refresh = () => {
      const now = Date.now();
      setCooldownNow(now);
      const remaining = cooldownEnd - now;
      // Tick on the whole seconds left before the shared cycle end, so lanes closing together show the same number.
      if (remaining > 0) timer = window.setTimeout(refresh, remaining % 1_000 || 1_000);
    };
    timer = window.setTimeout(refresh, Math.max(0, cooldownEnd - Date.now()) % 1_000 || 1_000);
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [slot.cooldownUntil]);

  const cooldown = cooldownSeconds(slot.cooldownUntil, cooldownNow);
  const canAttack = Boolean(slot.card && !enemy && !disabled && !defeated && cooldown <= 0);
  const handleClick = () => {
    if (canAttack) onClick?.();
  };
  return (
    <div className={`arena-slot${cooldown > 0 ? " is-cooldown" : " is-ready"}${defeated ? " is-defeated" : ""}${slot.card ? "" : " is-hidden"}`}>
      {slot.card ? <BattleCard card={slot.card} clashLevel={clashLevel} clashing={clashing} enemy={enemy} disabled={!canAttack} key={`${slot.card.instanceId}-${lane}`} onClick={handleClick} /> : <div aria-label={cooldown > 0 ? `Лінія ${lane + 1}: карта відкриється через ${cooldown} с` : `Лінія ${lane + 1}: карта прихована`} className="arena-hidden-card"><CardBack className="arena-hidden-card__back" />{cooldown > 0 ? <span className="arena-hidden-card__timer">{cooldown}</span> : null}</div>}
    </div>
  );
}

function ArenaLog({ animateLatest, match }: { animateLatest: boolean; match: ArenaView }) {
  const [expanded, setExpanded] = useState(false);
  const exchanges = match.battleLog
    .map((entry, index) => arenaLogToDuelExchange(entry, match.playerId, match.battleLog.length - index))
    .filter((entry): entry is DuelExchange => entry !== null);
  const entries = expanded ? exchanges : exchanges.slice(0, 7);
  return (
    <BattleLog
      animateLatest={animateLatest}
      emptyMessage="Ваша перша атака або удар по вас ще попереду."
      entries={entries}
      headerAction={<button aria-expanded={expanded} className="battle-log__toggle" onClick={() => setExpanded((value) => !value)} type="button">{entries.length}/{exchanges.length || 0} {expanded ? "⌃" : "⌄"}</button>}
    />
  );
}

function ArenaBattle({ match, pending, onAction, onTarget, onCards }: {
  match: ArenaView;
  pending: string | null;
  onAction: (slotIndex: 0 | 1 | 2) => void;
  onTarget: (targetId?: string) => void;
  onCards: () => void;
}) {
  const latestAttack = match.battleLog.find(entry => entry.attackerId === match.playerId);
  const clash = useBattleExchange(latestAttack?.attackerId === match.playerId ? arenaLogToDuelExchange(latestAttack, match.playerId, match.battleLog.length) : null, latestAttack?.id);

  const target = match.participants.find((participant) => participant.id === match.targetId);
  const player = match.participants.find((participant) => participant.id === match.playerId);
  const playerDefeated = player?.alive === false;
  const clashSlot = clash?.slotIndex ?? null;
  const enemyHitLevel = clash ? getEffectLevel(clash.playerMultiplier) : "normal";
  const aliveEnemies = match.participants.filter((participant) => participant.id !== match.playerId && participant.alive).length;
  const multipliers = match.playerSlots.map((slot, index) => {
    const enemyCard = match.targetSlots?.[index]?.card;
    return slot.card && enemyCard ? getElementMultiplier(slot.card.element, enemyCard.element) : null;
  });
  return (
    <div className={`duel-page duel-battle arena-battle${clash ? " duel-battle--clash" : ""}`}>
      {target ? <HpPanel currentHp={target.hp} damageElement={clash?.playerCard.element} damageLevel={enemyHitLevel} detail={`Вороги: ${aliveEnemies}`} hit={clash !== null} maximumHp={target.maxHp} side={target} tone="enemy" /> : null}
      <section aria-label="Бойове поле" className={`duel-board${clash ? " duel-board--clash" : ""}`}>
        {clash ? <BattleAttackAnimation key={clash.turnNumber} exchange={clash} /> : null}
          <div className="duel-card-row duel-card-row--enemy">{match.targetSlots ? match.targetSlots.map((slot, index) => <ArenaSlot clashLevel={clashSlot === index && clash ? getEffectLevel(clash.enemyMultiplier) : undefined} clashing={clashSlot === index} enemy key={index} lane={index} slot={slot} />) : clash ? [0, 1, 2].map(index => index === clash.slotIndex ? <BattleCard card={clash.enemyCard} enemy key={index} /> : <div aria-hidden="true" key={index} />) : null}</div>
          <div className="duel-multiplier-row" aria-label="Множники удару">
            {multipliers.map((multiplier, index) => <span className={multiplier === null ? "duel-multiplier arena-multiplier--none" : `duel-multiplier duel-multiplier--${String(multiplier).replace(".", "-")}`} key={index}>{multiplier === null ? " " : `×${multiplier}`}</span>)}
          </div>
          <div className="duel-card-row duel-card-row--player">{match.playerSlots.map((slot, index) => <ArenaSlot clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined} clashing={clashSlot === index} defeated={playerDefeated} key={index} lane={index} slot={slot} disabled={clash !== null || match.status !== "active" || pending !== null} onClick={() => onAction(index as 0 | 1 | 2)} />)}</div>
      </section>
      {player ? <HpPanel currentHp={player.hp} detail={`Завдано: ${formatUiNumber(player.totalDamageDealt)}`} maximumHp={player.maxHp} side={player} tone="player" /> : null}
      <div className="arena-controls">
        <div className="arena-actions">
          <button className="arena-action" disabled={clash !== null || match.status !== "active" || pending !== null} onClick={() => onTarget()} type="button"><span aria-hidden="true" className="arena-action__medallion"><AppIcon name="target" size={28} /></span><span>Змінити ціль</span></button>
          <button className="arena-action" disabled={clash !== null || match.status !== "active" || pending !== null} onClick={onCards} type="button"><span aria-hidden="true" className="arena-action__medallion"><AppIcon name="deck" size={28} /></span><span>Змінити карти</span><small>{match.changeCardsCost === 0 ? "безплатно" : <><CurrencyIcon kind="gold" size={14} />{formatUiNumber(match.changeCardsCost)}</>}</small></button>
        </div>
        {playerDefeated ? <p aria-live="polite" className="arena-action-status">Вибули</p> : null}
      </div>
    </div>
  );
}

function ArenaResult({ match, onArena, onQueue, pending }: { match: ArenaView; onArena: () => void; onQueue: () => void; pending: string | null }) {
  const result = match.result;
  if (!result) return null;
  const won = result.reward.status === "win";
  const ordered = [...match.participants].sort((left, right) => (left.placement ?? 99) - (right.placement ?? 99));
  const renderParticipant = (participant: ArenaParticipantView) => (
    <li className={participant.id === match.playerId ? "is-player" : ""} key={participant.id}>
      <span className="arena-result__rank">{participant.placement}</span>
      <PlayerAvatar name={participant.name} photoUrl={participant.photoUrl} />
      <strong>{participant.name}</strong>
      <span className="arena-result__damage"><AppIcon name="duel" size={16} /> {formatUiNumber(participant.totalDamageDealt)}<small>ходи: {participant.moves}</small></span>
    </li>
  );
  return (
    <section className={`arena-result ${won ? "is-win" : "is-loss"}`}>
      <span>Арена завершена</span>
      <h1>{won ? "ПЕРЕМОГА" : "ПОРАЗКА"}</h1>
      {won ? <p className="arena-result__subtitle">Ви один із переможців!</p> : null}
      {!result.reward.counted ? <p className="arena-result__subtitle">Ви не билися в цьому бою. Його не зараховано.</p> : null}
      <strong className="arena-result__place">Рейтинг арени: {result.reward.ratingAfter} ({result.reward.ratingChange > 0 ? "+" : ""}{result.reward.ratingChange})</strong>
      {result.leagueAfter.index > result.leagueBefore.index ? <p className="arena-result__subtitle">Нова ліга: {result.leagueAfter.name}</p> : null}
      <div className="arena-result__standings">
        <div className="arena-result__group arena-result__group--winners"><h2>Переможці</h2><ol>{ordered.slice(0, 3).map(renderParticipant)}</ol></div>
        <div className="arena-result__group arena-result__group--contenders"><h2>Претенденти</h2><ol>{ordered.slice(3).map(renderParticipant)}</ol></div>
      </div>
      {result.reward.promotionSilver > 0 ? <div className="arena-result__rewards"><span><CurrencyIcon kind="silver" size={18} />+{formatUiNumber(result.reward.promotionSilver)} срібла за нову лігу</span></div> : null}
      <div className="arena-result__actions"><button className="duel-primary-button" disabled={pending !== null} onClick={onQueue} type="button">Записатися знову</button><button className="duel-secondary-button" onClick={onArena} type="button">На арену</button></div>
    </section>
  );
}
function ArenaLeague({ profile, initData }: { profile: ArenaProfileResponse; initData: string | null }) {
  const [board, setBoard] = useState<ArenaLeaderboardResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!initData) return;
    const controller = new AbortController();
    void loadArenaLeaderboard(initData, controller.signal).then(setBoard).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setFailed(true); });
    return () => controller.abort();
  }, [initData, profile.arenaRating]);
  const next = profile.nextArenaLeague;
  const floor = profile.arenaLeague.minRating;
  const progress = next ? percentage(profile.arenaRating - floor, next.minRating - floor) : 100;
  const playerListed = board?.entries.some(({ playerId }) => playerId === board.player.playerId);
  return (
    <section className="arena-league-panel">
      <div className="arena-league-panel__crest"><AppIcon name="arena" size={48} /></div>
      <span>Ліга арени</span><h2>{profile.arenaLeague.name}</h2>
      <strong>Рейтинг арени: {profile.arenaRating}</strong>
      <div className="arena-league-panel__progress" aria-label={next ? `До ліги ${next.name}: ${Math.round(progress)}%` : "Найвища ліга"}><i style={{ width: `${progress}%` }} /></div>
      {next ? <p>До ліги «{next.name}»: {Math.max(0, next.minRating - profile.arenaRating)} рейтингу. Перший перехід: +{next.promotionReward.toLocaleString("uk-UA")} срібла.</p> : <p>Це найвища ліга арени.</p>}
      <div className="arena-league-panel__stats"><span>Перемоги <b>{formatUiNumber(profile.arenaWins)}</b></span><span>Топ-3 <b>{formatUiNumber(profile.arenaTop3Count)}</b></span></div>
      <h3 className="arena-league-panel__title">Рейтинг ліги</h3>
      {board ? <ol className="arena-leaderboard">
        {board.entries.map((entry) => <li className={entry.playerId === board.player.playerId ? "is-player" : ""} key={entry.playerId}><span>{entry.rank}</span><PlayerAvatar name={entry.name} photoUrl={entry.photoUrl} /><strong>{entry.name}</strong><b>{entry.rating}</b></li>)}
        {!playerListed ? <li className="is-player"><span>{board.player.rank}</span><PlayerAvatar name={board.player.name} photoUrl={board.player.photoUrl} /><strong>{board.player.name}</strong><b>{board.player.rating}</b></li> : null}
      </ol> : <p role={failed ? "alert" : "status"}>{failed ? "Не вдалося завантажити рейтинг ліги." : "Завантажуємо рейтинг ліги…"}</p>}
    </section>
  );
}

export function ArenaScreen({ onBack, onOpenTasks, onPlayerSummaryChange }: ArenaScreenProps) {
  const [profile, setProfile] = useState<ArenaProfileResponse | null>(null);
  const [match, setMatch] = useState<ArenaView | null>(null);
  const resultReady = useBattleResultReady(match?.status === "active", match?.status === "finished", match?.result?.reward.status ?? null);
  const [queueState, setQueueState] = useState<ArenaQueueView | null>(null);
  const [page, setPage] = useState<ArenaPage>("lobby");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingRef = useRef<string | null>(null);
  const pollInFlightRef = useRef(false);
  const syncRevisionRef = useRef(0);

  const initData = getTelegramInitData();

  function retrySync() {
    setError(null);
    setLoadAttempt((current) => current + 1);
  }

  function beginPending(kind: string) {
    if (pendingRef.current !== null) return false;
    pendingRef.current = kind;
    syncRevisionRef.current += 1;
    setPending(kind);
    return true;
  }

  function endPending() {
    pendingRef.current = null;
    setPending(null);
  }

  const syncProfile = useCallback(async (signal?: AbortSignal) => {
    if (!initData) throw new Error("Telegram unavailable");
    const next = await loadArenaProfile(initData, signal);
    setProfile(next);
    onPlayerSummaryChange({ arenaLeagueIndex: next.arenaLeague.index, arenaRating: next.arenaRating, arenaTop3Count: next.arenaTop3Count, arenaWins: next.arenaWins, cardShards: next.cardShards });
    return next;
  }, [initData, onPlayerSummaryChange]);

  const syncMatch = useCallback(async (signal?: AbortSignal, hideFinished = false) => {
    if (!initData) throw new Error("Telegram unavailable");
    const syncRevision = syncRevisionRef.current;
    const response = await loadActiveArena(initData, signal);
    if (syncRevision !== syncRevisionRef.current) return null;
    const next = hideFinished && response.arena?.status === "finished" ? null : response.arena;
    setQueueState((current) => sameQueueView(current, response.queue) ? current : response.queue);
    setMatch((current) => sameArenaView(current, next) ? current : next);
    if (next?.result) {
      onPlayerSummaryChange(next.result.player);
      setProfile((current) => current ? {
        ...current,
        arenaLeague: next.result!.leagueAfter,
        arenaRating: next.result!.reward.ratingAfter,
        arenaTop3Count: next.result!.player.arenaTop3Count ?? current.arenaTop3Count,
        arenaWins: next.result!.player.arenaWins ?? current.arenaWins,
        cardShards: next.result!.player.cardShards ?? current.cardShards,
      } : current);
    }
    return next;
  }, [initData, onPlayerSummaryChange]);

  useEffect(() => {
    if (!initData) { setError("Арена доступна лише в Telegram Mini App"); return; }
    const controller = new AbortController();
    void Promise.all([syncProfile(controller.signal), syncMatch(controller.signal, true)]).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("Не вдалося завантажити арену"); });
    return () => controller.abort();
  }, [initData, loadAttempt, syncMatch, syncProfile]);

  useEffect(() => {
    const shouldPoll = Boolean(initData && pending === null && (match?.status === "active" || queueState));
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (pendingRef.current !== null || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      void syncMatch().catch(() => undefined).finally(() => { pollInFlightRef.current = false; });
    }, 1_200);
    return () => window.clearInterval(timer);
  }, [initData, match?.status, pending, queueState, syncMatch]);

  async function queue() {
    if (!initData) return;
    if (!beginPending("queue")) return;
    setError(null);
    try {
      const response = await joinArenaQueue(initData);
      setMatch(response.match);
      setQueueState(response.queue);
      await syncProfile();
    } catch (reason: unknown) { setError(reason instanceof ArenaApiError && reason.code === "invalid_battle_deck" ? "Потрібна повна бойова колода 3/2/2/2." : "Не вдалося поставити бій у чергу"); } finally { endPending(); }
  }

  async function leaveQueue() {
    if (!initData) return;
    if (!beginPending("leave-queue")) return;
    setError(null);
    try { await leaveArenaQueue(initData); setQueueState(null); } catch { setError("Не вдалося скасувати запис."); } finally { endPending(); }
  }

  async function mutate(kind: string, call: () => Promise<ArenaView>) {
    if (!match || !beginPending(kind)) return;
    setError(null);
    try { const next = await call(); setMatch(next); if (next.result) onPlayerSummaryChange(next.result.player); } catch (reason: unknown) {
      if (reason instanceof ArenaApiError && reason.code === "arena_state_conflict") await syncMatch();
      else setError("Стан бою змінився. Синхронізуйте та спробуйте ще раз.");
    } finally { endPending(); }
  }

  const errorNotice = error ? <><p className="arena-error" role="alert">{error}</p><button className="duel-secondary-button" disabled={pending !== null} onClick={retrySync} type="button">Оновити стан</button></> : null;
  const menu = <ArenaMenu onOpenLeague={() => setPage("league")} onOpenTasks={onOpenTasks} />;

  if (!profile) return <div className="arena-screen"><ArenaHeading onBack={onBack} /><div className="arena-empty-state" role={error ? "alert" : "status"}><span>{error ?? "Завантажуємо арену…"}</span>{error && initData ? <button className="duel-secondary-button" onClick={retrySync} type="button">Повторити</button> : null}</div></div>;
  if (match && !resultReady) return <div className="arena-screen arena-screen--battle"><ArenaBattle match={match} pending={pending} onAction={(slot) => { if (initData) void mutate(`slot-${slot}`, () => submitArenaAction(initData, match.matchId, { slotIndex: slot, expectedVersion: match.version })); }} onTarget={(targetId) => { if (initData) void mutate("target", () => changeArenaTarget(initData, match.matchId, { expectedVersion: match.version, ...(targetId ? { targetId } : {}) })); }} onCards={() => { if (initData) void mutate("cards", () => changeArenaCards(initData, match.matchId, { expectedVersion: match.version })); }} /></div>;
  if (page === "league") return <div className="arena-screen"><ArenaHeading onBack={() => setPage("lobby")} title="Рейтинг арени" /><ArenaLeague initData={initData} profile={profile} /></div>;
  if (page === "rules") return <div className="arena-screen"><ArenaHeading onBack={() => setPage("lobby")} title="Правила арени" /><ArenaRules /></div>;
  if (match?.status === "finished") return (
    <div className="arena-screen">
      <ArenaHeading onBack={onBack} />
      {errorNotice}
      <ArenaResult match={match} onArena={() => { setMatch(null); setQueueState(null); setError(null); }} onQueue={() => void queue()} pending={pending} />
      <ArenaLog animateLatest={false} match={match} />
      {menu}
    </div>
  );
  if (queueState) return <div className="arena-screen"><ArenaHeading onBack={onBack} /><ArenaQueuePanel onLeave={() => void leaveQueue()} pending={pending} queue={queueState} /><ArenaChat /></div>;

  return (
    <div className="arena-screen">
      <ArenaHeading onBack={onBack} />
      <FirstVisitHint id="arena" title="Арена" items={["Обери суперника.", "Обери карту для атаки.", "Переможці — троє з найбільшою шкодою. Менше 3 ходів — бій не зараховується."]} />
      {errorNotice}
      <ArenaLobby onOpenRules={() => setPage("rules")} onQueue={() => void queue()} onRefresh={retrySync} pending={pending} profile={profile} />
      <ArenaChat />
      {menu}
    </div>
  );
}
