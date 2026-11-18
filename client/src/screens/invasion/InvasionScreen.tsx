import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DuelExchange,
  InvasionAttackResultView,
  InvasionBattleView,
  InvasionBossDefeatView,
  InvasionBossView,
  InvasionGuildRatingResponse,
  InvasionLogEntry,
  InvasionPrizeKindView,
  InvasionView,
} from "@cardastika/shared";
import { getDuelLogVisualState, getElementMultiplier, INVASION_CARD_SWAP_GOLD } from "@cardastika/game-core";
import { BattleAttackAnimation } from "../../components/BattleAttackAnimation";
import { BattleOutcomeHeader } from "../../components/BattleOutcome";
import { useCardArtworkSource } from "../../components/cardArtSource";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import { DiamondIcon } from "../../components/DiamondIcon";
import { MenuRow } from "../../components/MenuRow";
import { useBattleExchange, useBattleResultReady } from "../../components/useBattlePresentation";
import { formatUiNumber } from "../../i18n";
import { activateInvasionPermit, attackInvasion, autoAttackInvasion, InvasionApiError, loadInvasion, loadInvasionGuilds, strikeInvasion, swapInvasionCards } from "../../telegram/invasion";
import { BattleCard, getEffectLevel, HpPanel } from "../DuelScreen";
import { GuildState } from "../guild/GuildUi";

// The screen reuses the guild raid look: same wrapper classes, so every surface is the painted raid sprite.
const POLL_MS = 1_500;
const SWAP_GOLD = INVASION_CARD_SWAP_GOLD;
const PRIZE_LABELS: Record<InvasionPrizeKindView, string> = { first_place: "За 1-ше місце", damage: "За шкоду", super_strike: "За суперудар" };

interface InvasionScreenProps {
  gold: number | undefined;
  onBack: () => void;
  onGoldChange: (gold: number) => void;
  onOpenDuel: () => void;
  playerLevel: number;
  playerName: string;
  playerPhotoUrl: string | null;
}

function invasionErrorMessage(error: unknown) {
  if (!(error instanceof InvasionApiError)) return "Не вдалося зв’язатися із сервером. Перевірте з’єднання та повторіть спробу.";
  if (error.status === 401) return "Сесія завершилася. Відкрийте гру знову або увійдіть у свій профіль.";
  const messages: Record<string, string> = {
    insufficient_gold: "Недостатньо золота.",
    invasion_locked: "Навала ще закрита для вашої ліги.",
    invasion_state_conflict: "Стан бою змінився. Спробуйте ще раз.",
    invasion_price_changed: "Ціна змінилася. Перевірте її й спробуйте ще раз.",
    invasion_boss_not_ready: "Бос ще не з’явився.",
    invasion_battle_active: "Бій уже йде.",
    invasion_battle_finished: "Цей бій уже завершено.",
    invasion_slot_not_ready: "Ця карта ще не готова до удару.",
    invasion_deck_invalid: "Збери повну бойову колоду, щоб напасти.",
    invasion_not_active: "Навала ще не почалася.",
    invasion_permit_none: "У тебе немає дозволу на полювання.",
    invasion_permit_active: "Дозвіл уже діє на цього боса.",
  };
  return messages[error.code] ?? "Дію не виконано. Спробуйте ще раз.";
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours} год ${minutes} хв`;
  if (minutes) return `${minutes} хв ${seconds} с`;
  return `${seconds} с`;
}

function toInvasionExchange(entry: InvasionLogEntry): DuelExchange {
  // A super strike plays as a strong hit; ordinary strikes retain collection-adjusted multipliers.
  const playerMultiplier = entry.superStrike ? 1.5 : entry.playerMultiplier;
  const enemyMultiplier = entry.bossMultiplier;
  return {
    enemyCard: entry.bossCard,
    enemyDamage: entry.bossDamage,
    enemyMultiplier,
    playerCard: entry.playerCard,
    playerDamage: entry.playerDamage,
    playerMultiplier,
    slotIndex: entry.slotIndex,
    turnNumber: entry.turnNumber,
    visualState: getDuelLogVisualState(playerMultiplier, enemyMultiplier),
  };
}

function BossPortrait({ boss, lobby = false }: { boss: InvasionBossView; lobby?: boolean }) {
  const art = useCardArtworkSource(boss.artKey, boss.cardId);
  return <span className={lobby ? "guild-raid__portrait guild-raid__portrait--left" : "guild-raid__portrait guild-raid-battle__target-portrait"}>
    {art.source ? <img alt={boss.name} onError={art.onSourceError} src={art.source} /> : null}
  </span>;
}

function BossHealth({ boss }: { boss: InvasionBossView }) {
  const percent = boss.maxHealth > 0 ? Math.max(0, Math.min(100, boss.health / boss.maxHealth * 100)) : 0;
  return <section className="guild-raid-battle__target-panel">
    <div className="guild-raid-battle__target-header">
      <div className="guild-raid-battle__target-identity">
        <BossPortrait boss={boss} />
        <div><strong className="guild-raid__boss-name">{boss.name}</strong></div>
      </div>
      <div className="guild-raid-battle__target-hp"><strong>{formatUiNumber(boss.health)} / {formatUiNumber(boss.maxHealth)}</strong><span>{Math.round(percent)}%</span></div>
    </div>
    <span aria-label={`Здоров’я боса: ${Math.round(percent)}%`} className="guild-raid-battle__target-hpbar"><span style={{ width: `${percent}%` }} /></span>
  </section>;
}

function DefeatPanel({ defeat, onClose }: { defeat: InvasionBossDefeatView; onClose: () => void }) {
  return <section aria-label="Підсумок боса" className="battle-outcome-panel guild-raid-result">
    <BattleOutcomeHeader subtitle={`Бос переможений: ${defeat.bossName}`} won />
    <p className="guild-raid-result__meta">{`Бос ${defeat.bossNumber}`}</p>
    <div className="guild-raid-result__summary"><span>Нападів</span><strong>{formatUiNumber(defeat.attacks)}</strong></div>
    {defeat.lastAttack ? <>
      <div className="guild-raid-result__summary"><span>Досвід за останній напад</span><strong>{`+${formatUiNumber(defeat.lastAttack.xp)}`}</strong></div>
      <div className="guild-raid-result__summary"><span>Срібло за останній напад</span><strong><CurrencyIcon kind="silver" size={15} /> {`+${formatUiNumber(defeat.lastAttack.silver)}`}</strong></div>
    </> : null}
    {defeat.prizes.length ? <>
      <p className="guild-raid-result__leaders-title">Призові карти</p>
      <ol aria-label="Призові карти" className="guild-raid-result__standings">
        {defeat.prizes.map((prize, index) => <li key={`${prize.kind}-${prize.cardId}-${index}`}>
          <span aria-hidden="true" className="guild-raid-result__placement">{index + 1}</span>
          <span className="guild-raid-result__player"><strong>{prize.cardName}</strong><small>{PRIZE_LABELS[prize.kind]}</small></span>
          <strong className="guild-raid-result__damage">{`рів. ${prize.level} · сила ${formatUiNumber(prize.finalPower)}`}</strong>
        </li>)}
      </ol>
    </> : <p className="guild-raid-lobby__hint">Цього разу без призових карт.</p>}
    <button className="guild-raid__button guild-raid__button--green" onClick={onClose} type="button">Продовжити</button>
  </section>;
}

function AttackResultPanel({ result, onClose }: { result: InvasionAttackResultView; onClose: () => void }) {
  return <section aria-label="Підсумок нападу" className="battle-outcome-panel guild-raid-result">
    {result.bossKilled ? <BattleOutcomeHeader subtitle="Бос переможений" won /> : <p className="guild-raid-result__leaders-title">Напад завершено</p>}
    <div className="guild-raid-result__summary"><span>Шкода</span><strong>{formatUiNumber(result.damage)}</strong></div>
    <div className="guild-raid-result__summary"><span>Досвід</span><strong>{`+${formatUiNumber(result.xp)}`}</strong></div>
    <div className="guild-raid-result__summary"><span>Срібло</span><strong><CurrencyIcon kind="silver" size={15} /> {`+${formatUiNumber(result.silver)}`}</strong></div>
    {result.diamonds > 0 ? <div className="guild-raid-result__summary"><span>Алмази</span><strong><DiamondIcon size={15} /> {`+${formatUiNumber(result.diamonds)}`}</strong></div> : null}
    {result.superStrikes > 0 ? <p className="guild-raid-lobby__hint">{`Суперударів: ${result.superStrikes}`}</p> : null}
    <button className="guild-raid__button guild-raid__button--green" onClick={onClose} type="button">Продовжити</button>
  </section>;
}

function InvasionBattle({ battle, boss, cycle, nextCycleMs, pending, playerLevel, playerName, playerPhotoUrl, onStrike, onSwap }: {
  battle: InvasionBattleView;
  boss: InvasionBossView | null;
  cycle: number;
  nextCycleMs: number;
  pending: boolean;
  playerLevel: number;
  playerName: string;
  playerPhotoUrl: string | null;
  onStrike: (slot: 0 | 1 | 2) => void;
  onSwap: () => void;
}) {
  const latest = battle.log[battle.log.length - 1];
  const clash = useBattleExchange(latest ? toInvasionExchange(latest) : null, latest ? `${battle.id}:${latest.turnNumber}` : undefined);
  const clashSlot = clash?.slotIndex ?? null;
  const locked = clash !== null || pending || battle.finished;
  const multipliers = battle.playerSlots.map((slot, index) => {
    const enemy = battle.bossSlots[index];
    return enemy ? getElementMultiplier(slot.card.element, enemy.element) : null;
  });
  const playerHitLevel = clash ? getEffectLevel(clash.enemyMultiplier) : "normal";
  const log = [...battle.log].reverse();
  return <section aria-label="Бій з босом" className={`guild-raid-battle${clash ? " is-clashing" : ""}`}>
    <header className="guild-raid-battle__header">
      <span>{`Бій · цикл ${cycle + 1}`}</span>
      <strong>{boss?.name ?? "Навала Шуліки"}</strong>
    </header>
    <div className="guild-raid-battle__stage">
      {boss ? <BossHealth boss={boss} /> : null}
      <section aria-label="Бойове поле" className={`guild-raid-battle__field duel-board${clash ? " duel-board--clash" : ""}`}>
        {clash ? <BattleAttackAnimation key={clash.turnNumber} exchange={clash} /> : null}
        <div className="arena-battlefield__label"><span>БОС</span><span>ВИ</span></div>
        <div className="guild-raid-battle__card-matrix">
          <div aria-label="Карти боса" className="duel-card-row duel-card-row--enemy">
            {battle.bossSlots.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.enemyMultiplier) : undefined} clashing={clashSlot === index} disabled enemy key={card.instanceId} />)}
          </div>
          <div aria-label="Множники удару" className="duel-multiplier-row guild-raid-battle__multiplier-row">
            {multipliers.map((multiplier, index) => <span className={`duel-multiplier duel-multiplier--${String(multiplier ?? "none").replace(".", "-")}`} key={index}>{multiplier === null ? "—" : `×${multiplier}`}</span>)}
          </div>
          <div aria-label="Ваші карти" className="duel-card-row duel-card-row--player">
            {battle.playerSlots.map((slot, index) => <BattleCard card={slot.card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined} clashing={clashSlot === index} disabled={locked || cycle < slot.readyCycle} key={slot.card.instanceId} onClick={() => onStrike(index as 0 | 1 | 2)} />)}
          </div>
        </div>
      </section>
      <HpPanel currentHp={battle.playerHp} damageElement={clash?.enemyCard.element} damageLevel={playerHitLevel} hit={clash !== null} maximumHp={battle.playerMaxHp} side={{ name: playerName, level: playerLevel, photoUrl: playerPhotoUrl }} tone="player" />
    </div>
    <p className="guild-raid-lobby__hint">{`Нові карти через ${Math.max(1, Math.ceil(nextCycleMs / 1000))} с`}</p>
    {!battle.finished ? <button className="guild-raid__button guild-raid__button--green" disabled={pending || clash !== null} onClick={onSwap} type="button"><CurrencyIcon kind="gold" size={15} /> <span>{SWAP_GOLD}</span> <span>Змінити карти</span></button> : null}
    {log.length ? <ol aria-label="Журнал бою · останні 6 ударів" className="guild-raid-battle__log">
      {log.map((entry) => <li className={entry.superStrike ? "is-death" : "is-attack"} key={entry.turnNumber}>
        <span>{`${entry.playerCard.displayName ?? entry.playerCard.code} завдає ${formatUiNumber(entry.playerDamage)} шкоди`}</span>
        {entry.superStrike ? <small>Суперудар! ×10</small> : null}
        <small>{`Бос відповідає: ${formatUiNumber(entry.bossDamage)}`}</small>
      </li>)}
    </ol> : null}
  </section>;
}

function InvasionLobby({ view, boss, now, pending, gold, onAttack, onAuto, onGuilds, onPermit }: {
  view: InvasionView;
  boss: InvasionBossView | null;
  now: number;
  pending: boolean;
  gold: number | undefined;
  onAttack: () => void;
  onAuto: () => void;
  onGuilds: () => void;
  onPermit: () => void;
}) {
  const { quote, standing } = view;
  const bossWait = boss ? Date.parse(boss.appearsAt) - now : 0;
  const invasionWait = Date.parse(view.startsAt) - now;
  const waiting = bossWait > 0 || invasionWait > 0;
  const freeWait = quote?.readyAt ? Date.parse(quote.readyAt) - now : 0;
  const deckReady = view.deckPower > 0;
  const canAfford = (price: number) => deckReady && (gold === undefined || gold >= price);
  return <section className="guild-raid-lobby">
    {boss ? <div aria-label="Бос навали" className="guild-raid__bosses guild-raid__bosses--single">
      <strong>{`Бос ${boss.number} з ${boss.total}`}</strong>
      <div className="guild-raid__boss"><BossPortrait boss={boss} lobby /><strong className="guild-raid__boss-name">{boss.name}</strong><small>{formatUiNumber(boss.health)} / {formatUiNumber(boss.maxHealth)} HP</small></div>
    </div> : null}
    {invasionWait > 0 ? <p className="guild-raid-lobby__hint">{`Навала почнеться через ${formatCountdown(invasionWait)}`}</p>
      : bossWait > 0 ? <p className="guild-raid-lobby__hint">{`Бос з’явиться через ${formatCountdown(bossWait)}`}</p> : null}
    <p className="guild-raid-lobby__participants">{view.powerBonusPct > 0 ? `Сила колоди: ${formatUiNumber(view.deckPower)} (+${view.powerBonusPct}%)` : `Сила колоди: ${formatUiNumber(view.deckPower)}`}</p>
    {standing ? <>
      <p className="guild-raid-lobby__participants">{`Твоє місце: ${formatUiNumber(standing.place)}`}</p>
      {standing.ahead || standing.behind ? <p className="guild-raid-lobby__hint">
        {standing.ahead ? <span>{`До ${standing.ahead.place}: ${formatUiNumber(standing.ahead.gap)}`}</span> : null}
        {standing.ahead && standing.behind ? " · " : null}
        {standing.behind ? <span>{`Від ${standing.behind.place}: ${formatUiNumber(standing.behind.gap)}`}</span> : null}
      </p> : null}
    </> : null}
    {!deckReady ? <p className="guild-raid-lobby__hint">Збери повну бойову колоду, щоб напасти.</p> : null}
    {quote && boss && !waiting ? <>
      <button className="guild-raid__button guild-raid__button--green" disabled={pending || !canAfford(quote.gold)} onClick={onAttack} type="button">
        {quote.gold > 0 ? <><CurrencyIcon kind="gold" size={15} /> <span>{quote.gold}</span> </> : null}<span>Напасти</span>
      </button>
      {quote.gold > 0 && freeWait > 0 ? <p className="guild-raid-lobby__hint">{`Безкоштовний напад через ${formatCountdown(freeWait)}`}</p> : null}
      <button className="guild-raid__button guild-raid__button--green" disabled={pending || !canAfford(quote.autoGold)} onClick={onAuto} type="button">
        <CurrencyIcon kind="gold" size={15} /> <span>{quote.autoGold}</span> <span>Автобій</span>
      </button>
      <p className="guild-raid-lobby__hint">Автобій проводить увесь бій без тебе.</p>
      {view.huntingPermit.activeOnBoss ? <p className="guild-raid-lobby__hint">Дозвіл на полювання діє: напади на цього боса вдвічі дешевші.</p>
        : view.huntingPermit.owned > 0 ? <button className="guild-raid__button guild-raid__button--green" disabled={pending} onClick={onPermit} type="button">{`Дозвіл на полювання · є ${view.huntingPermit.owned}`}</button> : null}
    </> : null}
    <p className="guild-raid-lobby__hint"><DiamondIcon size={14} /> {`Алмази сьогодні: ${view.diamondsToday.norm} / ${view.diamondsToday.limit}`}</p>
    <h3 className="guild-raid-result__leaders-title">Топ-10 за шкодою</h3>
    {view.top.length ? <ol aria-label="Топ-10 за шкодою" className="guild-raid-result__standings">
      {view.top.slice(0, 10).map((row) => <li key={row.playerId}>
        <span aria-hidden="true" className="guild-raid-result__placement">{row.place}</span>
        <span className="guild-raid-result__player"><strong>{row.name}</strong></span>
        <strong className="guild-raid-result__damage">{formatUiNumber(row.damage)}</strong>
      </li>)}
    </ol> : <p className="guild-raid-lobby__hint">Ніхто ще не завдав шкоди.</p>}
    <div className="guild-raid__menu guild-menu-list"><MenuRow compact icon="ranking" onClick={onGuilds} title="Рейтинг гільдій" /></div>
  </section>;
}

export function InvasionScreen({ gold, onBack, onGoldChange, onOpenDuel, playerLevel, playerName, playerPhotoUrl }: InvasionScreenProps) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; view?: InvasionView; message?: string }>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [guilds, setGuilds] = useState<{ open: boolean; data?: InvasionGuildRatingResponse; failed?: boolean }>({ open: false });
  // Defeat panels and the last result are shown once, so they are captured here before the next poll replaces them.
  const [defeats, setDefeats] = useState<InvasionBossDefeatView[]>([]);
  const [result, setResult] = useState<InvasionAttackResultView | null>(null);
  const requestSeq = useRef(0);
  const clockOffset = useRef(0);
  const shownResultKey = useRef<string | null>(null);

  const goldChangeRef = useRef(onGoldChange);
  goldChangeRef.current = onGoldChange;
  // Defeats and results are granted once by the server, so they are kept from every response, even a stale poll.
  const captureOneTime = useCallback((view: InvasionView) => {
    if (view.defeats.length) {
      const key = (defeat: InvasionBossDefeatView) => `${defeat.bossNumber}:${defeat.attacks}:${defeat.prizes.length}`;
      setDefeats((current) => [...current, ...view.defeats.filter((defeat) => !current.some((item) => key(item) === key(defeat)))]);
    }
    if (view.lastResult) {
      const key = `${view.lastResult.bossNumber}:${view.lastResult.damage}:${view.lastResult.xp}:${view.lastResult.silver}:${view.attacksMade}`;
      if (key !== shownResultKey.current) {
        shownResultKey.current = key;
        setResult(view.lastResult);
      }
    }
  }, []);
  const applyView = useCallback((view: InvasionView) => {
    clockOffset.current = Date.parse(view.serverNow) - Date.now();
    setState({ status: "ready", view });
    if (view.gold !== null) goldChangeRef.current(view.gold);
    captureOneTime(view);
  }, [captureOneTime]);

  const reload = useCallback(async (initial = false) => {
    const seq = requestSeq.current;
    if (initial) setState({ status: "loading" });
    try {
      const view = await loadInvasion();
      // A strike or purchase made meanwhile returns a newer view; this poll is stale.
      if (seq === requestSeq.current) applyView(view);
      else captureOneTime(view);
    } catch (error) {
      if (initial || seq === requestSeq.current) setState((current) => initial || !current.view ? { status: "error", message: invasionErrorMessage(error) } : current);
    }
  }, [applyView, captureOneTime]);

  useEffect(() => { void reload(true); }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!pending) void reload(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pending, reload]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  async function perform(operation: () => Promise<InvasionView>) {
    if (pending) return;
    setPending(true);
    setNotice(null);
    requestSeq.current += 1;
    try {
      const view = await operation();
      requestSeq.current += 1;
      applyView(view);
    } catch (error) {
      setNotice(invasionErrorMessage(error));
      requestSeq.current += 1;
      await reload();
    } finally {
      setPending(false);
    }
  }

  async function openGuilds() {
    setGuilds({ open: true });
    try {
      setGuilds({ open: true, data: await loadInvasionGuilds() });
    } catch {
      setGuilds({ open: true, failed: true });
    }
  }

  const view = state.view ?? null;
  const battle = view?.battle ?? null;
  const battleFinished = Boolean(battle?.finished);
  // The last strike plays to the end before the result replaces the board.
  const resultReady = useBattleResultReady(Boolean(battle) && !battleFinished, battleFinished, null);
  const battleVisible = Boolean(battle) && !resultReady;
  const serverNow = now + clockOffset.current;
  const cycle = battle ? Math.floor((serverNow - Date.parse(battle.startedAt)) / battle.cycleMs) : 0;
  const nextCycleMs = battle ? battle.cycleMs - ((serverNow - Date.parse(battle.startedAt)) % battle.cycleMs) : 0;
  const quote = view?.quote ?? null;
  const defeat = defeats[0] ?? null;

  let body;
  if (state.status === "loading") body = <GuildState>Завантаження навали…</GuildState>;
  else if (state.status === "error" || !view) body = <GuildState error onRetry={() => void reload(true)}>{state.message ?? "Навала тимчасово недоступна."}</GuildState>;
  else if (!view.unlocked) body = <section className="guild-raid-lobby">
    <p className="guild-raid-lobby__hint">{`Навала відкривається з ліги ${view.requiredLeagueName}`}</p>
    <div className="guild-raid__menu guild-menu-list"><MenuRow compact icon="duel" onClick={onOpenDuel} title="Грати дуелі" /></div>
  </section>;
  else if (guilds.open) body = <section className="guild-raid-lobby">
    {guilds.failed ? <p className="guild-raid-lobby__hint">Рейтинг тимчасово недоступний.</p> : !guilds.data ? <GuildState>Завантаження рейтингу…</GuildState> : guilds.data.rows.length ? <ol aria-label="Рейтинг гільдій навали" className="guild-raid-result__standings">
      {guilds.data.rows.map((row) => <li key={row.guildId}>
        <span aria-hidden="true" className="guild-raid-result__placement">{row.place}</span>
        <span className="guild-raid-result__player"><strong>{row.name}</strong></span>
        <strong className="guild-raid-result__damage">{formatUiNumber(row.damage)}</strong>
      </li>)}
    </ol> : <p className="guild-raid-lobby__hint">Гільдії ще не завдали шкоди.</p>}
  </section>;
  else if (battleVisible && battle) body = <InvasionBattle
    battle={battle}
    boss={view.boss}
    cycle={cycle}
    nextCycleMs={nextCycleMs}
    onStrike={(slot) => { void perform(() => strikeInvasion({ battleId: battle.id, expectedVersion: battle.version, slotIndex: slot })); }}
    onSwap={() => { void perform(() => swapInvasionCards({ battleId: battle.id, expectedVersion: battle.version })); }}
    pending={pending}
    playerLevel={playerLevel}
    playerName={playerName}
    playerPhotoUrl={playerPhotoUrl}
  />;
  else if (defeat) body = <DefeatPanel defeat={defeat} onClose={() => setDefeats((current) => current.slice(1))} />;
  else if (result) body = <AttackResultPanel onClose={() => setResult(null)} result={result} />;
  else body = <InvasionLobby
    boss={view.boss}
    gold={gold}
    now={now + clockOffset.current}
    onAttack={() => { if (quote) void perform(() => attackInvasion({ expectedGold: quote.gold })); }}
    onAuto={() => { if (quote) void perform(() => autoAttackInvasion({ expectedGold: quote.autoGold })); }}
    onPermit={() => { void perform(() => activateInvasionPermit()); }}
    onGuilds={() => { void openGuilds(); }}
    pending={pending}
    view={view}
  />;

  return <section className="guild-screen">
    <section aria-labelledby="invasion-title" className="guild-raid">
      <div className="guild-section-bar guild-raid__title"><h2 id="invasion-title">{guilds.open ? "Рейтинг гільдій навали" : "Навала Шуліки"}</h2></div>
      {body}
      {notice ? <p className="guild-raid__status" role="status">{notice}</p> : null}
      {!battleVisible ? <div aria-label="Розділи навали" className="guild-raid__menu guild-menu-list">
        <MenuRow compact icon="campaign" onClick={guilds.open ? () => setGuilds({ open: false }) : onBack} title="Назад" />
      </div> : null}
    </section>
  </section>;
}
