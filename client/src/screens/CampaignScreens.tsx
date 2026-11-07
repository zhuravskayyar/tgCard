import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { CampaignBossView, CampaignMapView, PlayerSummary, StoryTrialsView } from "@cardastika/shared";
import { ScreenHeading } from "../components/ScreenHeading";
import { CardBack } from "../components/CardBack";
import { BattleAttackAnimation } from "../components/BattleAttackAnimation";
import { useBattleExchange, useBattleResultReady } from "../components/useBattlePresentation";
import { CardFxWrapper } from "../components/CardFxWrapper";
import { CardHud } from "../components/CardHud";
import { RewardCardSurface } from "../components/RewardCardSurface";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import { MenuRow } from "../components/MenuRow";
import { useCardArtworkSource } from "../components/cardArtSource";
import { formatFullUiNumber, getUiLocale, translateUi } from "../i18n";
import { getTelegramInitData } from "../telegram";
import { CampaignApiError, claimCampaignBossRewards, loadActiveCampaignBoss, loadCampaign, loadCampaignBoss, startCampaignBoss, submitCampaignBossAction } from "../telegram/campaign";
import { BattleCard, BattleLog, DuelIntroOverlay, getEffectLevel, HpPanel } from "./DuelScreen";
import "../styles/campaign-adventures.css";

const tx = (value: string) => translateUi(value, getUiLocale());

export function CampaignGiver({ view }: { view: Pick<StoryTrialsView, "location" | "story"> }) {
  const art = useCardArtworkSource(view.location.giverArtKey, view.location.giverCardId);
  return <section className="campaign-giver adventure-plate">
    {art.source ? <span className="campaign-giver__portrait"><img alt={tx(view.location.giverName)} onError={art.onSourceError} src={art.source} /></span> : null}
    <div><strong>{tx(view.location.giverName)}</strong>{view.story.text.map(text => <p key={text}>{tx(text)}</p>)}</div>
  </section>;
}

function countdown(availableAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(availableAt) - now) / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, "0")).join(":");
}

export function CampaignScreen({ onBack, onOpenBoss, onOpenTrials }: {
  onBack: () => void; onOpenBoss: (location: number) => void; onOpenTrials: () => void;
}) {
  const [view, setView] = useState<CampaignMapView | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const load = useCallback((signal?: AbortSignal) => {
    const credential = getTelegramInitData();
    if (!credential) { setError(true); return; }
    setError(false);
    void loadCampaign(credential, signal).then(setView).catch(e => {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(true);
    });
  }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const expiresAt = view?.locations.map(row => row.boss.availableAt).filter((value): value is string => value !== null).sort()[0];
  const currentLocation = view?.locations.find(location => location.state !== "passed") ?? view?.locations[0] ?? null;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(() => load(), Math.max(0, Date.parse(expiresAt) - Date.now()) + 100);
    return () => window.clearTimeout(timer);
  }, [expiresAt, load]);
  return <div className="campaign-screen campaign-adventures">
    <ScreenHeading onBack={onBack} title={tx("Кампанія")} />
    {error ? <div className="adventure-plate" role="alert">{tx("Не вдалося завантажити кампанію.")}<button className="adventure-button ui-button ui-button--primary" onClick={() => load()} type="button">{tx("Спробувати ще раз")}</button></div> : null}
    {!view && !error ? <p className="adventure-plate" role="status">{tx("Розгортаємо карту пригод…")}</p> : null}
    {view ? <>
      <section aria-label={tx("Мапа кампанії")} className="adventure-route-map">
        <h2>{tx(currentLocation?.name ?? "Кампанія")}</h2>
      </section>
      <ol aria-label={tx("Локації кампанії")} className="adventure-map">{view.locations.map(location => {
      const resume = view.activeBattleLocation === location.number;
      return <li className={`adventure-location adventure-location--${location.state}`} key={location.number}>
        <article className="adventure-plate">
          <h2>{tx(location.name)}</h2>
          {location.state === "trials" ? <>
            <p>{tx(`Пройди випробування! ${formatFullUiNumber(location.trialsClaimed)} / ${formatFullUiNumber(location.trialsTotal)}`)}</p>
            <button className="adventure-button ui-button ui-button--primary" onClick={onOpenTrials} type="button">{tx(location.claimableTrials > 0 ? "Нагорода!" : "Випробування")}</button>
          </> : resume || location.boss.canFight ? <button className="adventure-button ui-button ui-button--primary" onClick={() => onOpenBoss(location.number)} type="button">{tx(resume ? "Продовжити бій" : "Бити боса")}</button>
            : location.boss.availableAt ? <p>{tx("Битися знову через")} <time dateTime={location.boss.availableAt}>{countdown(location.boss.availableAt, now)}</time></p>
            : <p>{tx(location.state === "passed" ? "Пригоду пройдено" : "Бос готується до бою")}</p>}
        </article>
      </li>;
    })}</ol>
    </> : null}
  </div>;
}

type BossState = { status: "loading" } | { status: "battle"; battle: CampaignBossView } | { status: "error"; message: string };

function CampaignBossOutcomeBanner({ won }: { won: boolean }) {
  const title = tx(won ? "Перемога!" : "Поразка").toLocaleUpperCase(getUiLocale());
  return <div className={`campaign-boss-outcome campaign-boss-outcome--${won ? "win" : "loss"}`}>
    <span aria-hidden="true" className="campaign-boss-outcome__particles">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</span>
    <h2 aria-label={title}>{Array.from(title, (letter, index) => <span key={`${letter}-${index}`} style={{ "--letter-index": index } as CSSProperties}>{letter === " " ? "\u00a0" : letter}</span>)}</h2>
  </div>;
}

function PendingBossReward({ pending, error, onRetry }: { pending: boolean; error: string | null; onRetry: () => void }) {
  if (error) return <div className="campaign-boss-reward__status" role="alert">
    <p>{tx(error)}</p>
    <button className="adventure-button ui-button ui-button--primary" onClick={onRetry} type="button">{tx("Спробувати ще раз")}</button>
  </div>;
  return <p aria-live="polite" className="campaign-boss-reward__status" role="status">
    {tx(pending ? "Зараховуємо нагороду…" : "Готуємо нагороду…")}
    <span aria-hidden="true" className="campaign-boss-reward__waiting"><i /><i /><i /></span>
  </p>;
}

function BossVictoryResult({ battle, claimPending, claimError, onClaim, onReturn, onOpenTrials, onOpenTasks }: {
  battle: CampaignBossView; claimPending: boolean; claimError: string | null; onClaim: () => void;
  onReturn: () => void; onOpenTrials: () => void; onOpenTasks: () => void;
}) {
  const result = battle.result;
  return <div className="campaign-adventures">
    <ScreenHeading onBack={onReturn} title={tx(battle.opponent.name)} />
    <section className="adventure-plate campaign-adventure-result">
      <CampaignBossOutcomeBanner won />
      {result ? <>
        {result.thanks?.map(text => <p key={text}>{tx(text)}</p>)}
        {result.gold > 0 || result.silver > 0 ? <p>{tx("Нагорода:")} {formatFullUiNumber(result.gold)}<CurrencyIcon kind="gold" size={17} /> {formatFullUiNumber(result.silver)}<CurrencyIcon kind="silver" size={17} /></p> : null}
        <p>{tx(`Досвід: +${formatFullUiNumber(result.xp)} XP`)}</p>
      </> : <PendingBossReward error={claimError} onRetry={onClaim} pending={claimPending} />}
      {result?.rewardCard ? <div className="campaign-boss-reward">
        <strong>{tx("Ти здобув карту!")}</strong>
        <div className="shop-reveal__stage">
          <div className="shop-reveal__card-shell" key={result.rewardCard.instanceId}>
            <RewardCardSurface
              ariaLabel={`${tx(result.rewardCard.displayName ?? result.rewardCard.code)}. ${tx("Сила")}: ${formatFullUiNumber(result.rewardCard.finalPower)}. ${tx("Рівень")}: ${formatFullUiNumber(result.rewardCard.level)}. ${tx("Карта нагороди. Проведи пальцем або мишею, щоб повернути.")}`}
              className={`deck-card--${result.rewardCard.element} deck-card--${result.rewardCard.rarity}`}
            >
              <CardFxWrapper artKey={result.rewardCard.artKey} cardId={result.rewardCard.cardId} element={result.rewardCard.element} rarity={result.rewardCard.rarity}>
                <CardHud element={result.rewardCard.element} level={result.rewardCard.level} power={result.rewardCard.finalPower} rarity={result.rewardCard.rarity} showLevel />
              </CardFxWrapper>
            </RewardCardSurface>
          </div>
        </div>
        <strong>{tx(result.rewardCard.displayName ?? result.rewardCard.code)}</strong>
        {result.cardIsWeak ? <p>{tx("Карта впала в слабкі")}</p> : null}
      </div> : null}
      {result ? <>
        <p>{tx(`Битися знову з ${tx(battle.opponent.name)} можна через ${formatFullUiNumber(result.respawnHours ?? 0)} год.`)}</p>
        <button className="adventure-button ui-button ui-button--primary" onClick={result.firstWin && battle.locationNumber < 10 ? onOpenTrials : onReturn} type="button">{tx(result.firstWin && battle.locationNumber < 10 ? "Нова пригода" : "До кампанії")}</button>
      </> : null}
    </section>
    {result ? <>
      <BattleLog entries={battle.battleLog} />
      <MenuRow compact icon="tasks" metalTexture onClick={onOpenTasks} title={tx("Завдання")} />
    </> : null}
  </div>;
}

function BossDefeatResult({ battle, claimPending, claimError, onClaim, onReturn }: {
  battle: CampaignBossView; claimPending: boolean; claimError: string | null; onClaim: () => void; onReturn: () => void;
}) {
  const result = battle.result;
  return <div className="campaign-adventures">
    <ScreenHeading onBack={onReturn} title={tx(battle.opponent.name)} />
    <section className="adventure-plate campaign-adventure-result">
      <CampaignBossOutcomeBanner won={false} />
      {result ? <>
        <p>{tx("Переглянь колоду й спробуй ще раз.")}</p>
        <p>{tx(`Досвід: +${formatFullUiNumber(result.xp)} XP`)}</p>
        <button className="adventure-button ui-button ui-button--primary" onClick={onReturn} type="button">{tx("До кампанії")}</button>
      </> : <PendingBossReward error={claimError} onRetry={onClaim} pending={claimPending} />}
    </section>
    {result ? <BattleLog entries={battle.battleLog} /> : null}
  </div>;
}

export function CampaignBossScreen({ locationNumber, onCampaignCompleted, onDeckPowerChange, onPlayerSummaryChange, onReturn, onOpenTrials, onOpenTasks }: {
  locationNumber: number | null; onCampaignCompleted: () => void; onDeckPowerChange: (power: number) => void;
  onPlayerSummaryChange: (player: Partial<Pick<PlayerSummary, "gold" | "level" | "silver">>) => void;
  onReturn: () => void; onOpenTrials: () => void; onOpenTasks: () => void;
}) {
  const [state, setState] = useState<BossState>({ status: "loading" });
  const [pendingSlot, setPendingSlot] = useState<0 | 1 | 2 | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [introActive, setIntroActive] = useState(false);
  const introBattleId = useRef<string | null>(null);
  const clash = useBattleExchange(state.status === "battle" ? state.battle.battleLog[0] ?? null : null);
  const resultReady = useBattleResultReady(state.status === "battle" && state.battle.status === "active", state.status === "battle" && state.battle.status !== "active", state.status === "battle" && state.battle.status !== "active" ? state.battle.status === "won" ? "win" : "loss" : null);
  const resultId = useRef<string | null>(null);
  const claimInFlightRef = useRef<string | null>(null);
  const showBattle = useCallback((battle: CampaignBossView) => {
    setState({ status: "battle", battle });
    if (battle.battleLog.length === 0 && introBattleId.current !== battle.battleId) {
      introBattleId.current = battle.battleId;
      setIntroActive(true);
    } else if (battle.battleLog.length > 0) {
      setIntroActive(false);
    }
  }, []);
  const result = state.status === "battle" ? state.battle.result : undefined;
  const battleId = state.status === "battle" ? state.battle.battleId : null;
  useEffect(() => {
    if (!result || state.status !== "battle" || !state.battle.rewardsGranted || resultId.current === battleId) return;
    resultId.current = battleId;
    onPlayerSummaryChange(result.player);
    if (result.deckPower !== undefined) onDeckPowerChange(result.deckPower);
    if (result.firstWin) onCampaignCompleted();
  }, [result, battleId, state, onPlayerSummaryChange, onDeckPowerChange, onCampaignCompleted]);
  useEffect(() => {
    if (!introActive) return;
    const timer = window.setTimeout(() => setIntroActive(false), 720);
    return () => window.clearTimeout(timer);
  }, [introActive]);

  const start = useCallback(async (signal?: AbortSignal) => {
    const credential = getTelegramInitData();
    if (!credential) { setState({ status: "error", message: "Увійди в гру, щоб розпочати бій." }); return; }
    setState({ status: "loading" });
    try {
      const active = await loadActiveCampaignBoss(credential, signal);
      if (active.battle) { showBattle(active.battle); return; }
      if (!locationNumber) { setState({ status: "error", message: "Обери боса на карті кампанії." }); return; }
      showBattle(await startCampaignBoss(credential, locationNumber, signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error", message: error instanceof CampaignApiError && error.code === "campaign_already_completed" ? "Бос ще відновлюється або ця пригода вже поза останніми трьома." : "Не вдалося розпочати бій. Перевір випробування й спробуй ще раз." });
    }
  }, [locationNumber, showBattle]);
  useEffect(() => { const controller = new AbortController(); void start(controller.signal); return () => controller.abort(); }, [start]);

  async function action(slotIndex: 0 | 1 | 2) {
    if (state.status !== "battle" || state.battle.status !== "active" || pendingSlot !== null) return;
    const credential = getTelegramInitData();
    if (!credential) return;
    setPendingSlot(slotIndex); setActionError(null);
    try {
      showBattle(await submitCampaignBossAction(credential, state.battle.battleId, { slotIndex, expectedVersion: state.battle.version }));
    } catch {
      try { showBattle(await loadCampaignBoss(credential, state.battle.battleId)); }
      catch { setActionError("Хід не підтверджено. Спробуй ще раз."); }
    } finally { setPendingSlot(null); }
  }
  const claimRewards = useCallback(async () => {
    if (state.status !== "battle" || state.battle.status === "active" || state.battle.rewardsGranted) return;
    const currentBattleId = state.battle.battleId;
    if (claimInFlightRef.current === currentBattleId) return;
    const credential = getTelegramInitData();
    if (!credential) { setClaimError("Не вдалося отримати нагороду. Увійди в гру й спробуй ще раз."); return; }
    claimInFlightRef.current = currentBattleId;
    setClaimPending(true);
    setClaimError(null);
    try {
      showBattle(await claimCampaignBossRewards(credential, currentBattleId));
    } catch {
      setClaimError("Не вдалося отримати нагороду. Спробуй ще раз.");
    } finally {
      claimInFlightRef.current = null;
      setClaimPending(false);
    }
  }, [showBattle, state]);
  useEffect(() => {
    if (!resultReady || state.status !== "battle" || state.battle.status === "active" || state.battle.rewardsGranted || claimError) return;
    void claimRewards();
  }, [claimError, claimRewards, resultReady, state]);
  if (state.status === "loading") return <p className="adventure-plate" role="status">{tx("Відкриваємо лігво…")}</p>;
  if (state.status === "error") return <div className="adventure-plate" role="alert"><p>{tx(state.message)}</p><button className="adventure-button ui-button ui-button--primary" onClick={onReturn} type="button">{tx("До кампанії")}</button></div>;
  const battle = state.battle;
  if (resultReady && battle.status === "won") return <BossVictoryResult battle={battle} claimError={claimError} claimPending={claimPending} onClaim={() => void claimRewards()} onOpenTasks={onOpenTasks} onOpenTrials={onOpenTrials} onReturn={onReturn} />;
  if (resultReady && battle.status === "lost") return <BossDefeatResult battle={battle} claimError={claimError} claimPending={claimPending} onClaim={() => void claimRewards()} onReturn={onReturn} />;
  const clashSlot = clash?.slotIndex ?? null;
  const enemyHitLevel = clash ? getEffectLevel(clash.playerMultiplier) : "normal";
  const playerHitLevel = clash ? getEffectLevel(clash.enemyMultiplier) : "normal";
  const battleClassName = ["duel-page", "duel-battle", introActive ? "duel-battle--intro" : "", clash ? "duel-battle--clash" : ""].filter(Boolean).join(" ");
  const boardClassName = ["duel-board", introActive ? "duel-board--intro" : "", clash ? "duel-board--clash" : ""].filter(Boolean).join(" ");
  return <div className="campaign-boss-battle">
    <ScreenHeading onBack={onReturn} title={tx(battle.opponent.name)} />
    {actionError ? <p className="adventure-plate" role="alert">{tx(actionError)}</p> : null}
    <div className={battleClassName}>
      <HpPanel currentHp={battle.enemyHp} damageElement={clash?.playerCard.element} damageLevel={enemyHitLevel} hit={clash !== null} maximumHp={battle.enemyMaxHp} side={battle.opponent} tone="enemy" />
      <div className={boardClassName} aria-label={tx("Бойове поле боса")}>
        {introActive ? <DuelIntroOverlay /> : null}
        {clash ? <BattleAttackAnimation key={clash.turnNumber} exchange={clash} /> : null}
        <div className="duel-card-row duel-card-row--enemy">{battle.enemyActiveCards.map(slot => <div aria-label={tx("Прихована карта боса")} className={`duel-card duel-card--enemy campaign-boss-hidden-card${clashSlot === slot.slotIndex ? " duel-card--clash-enemy" : ""}`} key={slot.slotIndex} role="img"><CardBack /></div>)}</div>
        <div aria-hidden="true" className="duel-multiplier-row campaign-boss-multiplier-row">
          {battle.enemyActiveCards.map(slot => <span className="duel-multiplier" key={slot.slotIndex}>?</span>)}
        </div>
        <div className="duel-card-row duel-card-row--player">{battle.playerActiveCards.map((card, index) => <BattleCard card={card} clashLevel={clashSlot === index && clash ? getEffectLevel(clash.playerMultiplier) : undefined} clashing={clashSlot === index} disabled={introActive || pendingSlot !== null || clash !== null || battle.status !== "active"} introActive={introActive} key={card.instanceId} onClick={() => void action(index as 0 | 1 | 2)} selected={pendingSlot === index} />)}</div>
      </div>
      <HpPanel currentHp={battle.playerHp} damageElement={clash?.enemyCard.element} damageLevel={playerHitLevel} hit={clash !== null} maximumHp={battle.playerMaxHp} side={battle.player} tone="player" />
      <p className="duel-action-hint">{tx(pendingSlot === null ? "Оберіть свою карту" : "Обмін ударами…")}</p>
      <BattleLog entries={battle.battleLog} />
    </div>
  </div>;
}
