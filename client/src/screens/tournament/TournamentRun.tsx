import { useEffect, useState } from "react";
import type { CardElement, DuelView, TournamentRunAction, TournamentRunView } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { CurrencyIcon } from "../../components/CurrencyDisplay";
import { ElementSymbol } from "../../components/ElementSymbol";
import { RibbonTitle } from "../../components/RibbonTitle";
import { useBattleResultReady } from "../../components/useBattlePresentation";
import { formatUiNumber } from "../../i18n";
import { BattleLog, DuelBattle } from "../DuelScreen";
import { TournamentPodium } from "./TournamentPodium";

const ELEMENT_NAMES: Record<CardElement, string> = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" };

function clock(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function signed(value: number) {
  return value > 0 ? `+${formatUiNumber(value)}` : value < 0 ? `−${formatUiNumber(-value)}` : "0";
}

function prizeText(run: TournamentRunView) {
  const granted = run.prizeGranted;
  const reward = run.prize?.reward;
  const parts = [
    reward?.kind === "card" ? `карта ${granted?.cardName ?? ""} рівня ${reward.level}`.replace("  ", " ") : null,
    reward?.kind === "source" ? `джерело рівня ${reward.level}` : null,
    run.prize?.diamonds ? `${formatUiNumber(run.prize.diamonds)} алмазів` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function TournamentRun({ run, clockOffset, pending, error, onAction, onExit }: {
  run: TournamentRunView;
  /** Server time minus local time, so countdowns follow the server's round clock. */
  clockOffset: number;
  pending: number | "buff" | "change" | null;
  error: string | null;
  onAction: (action: TournamentRunAction) => void;
  onExit: () => void;
}) {
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setLocalNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const now = localNow + clockOffset;
  const match = run.match;
  const live = run.status === "battle" || run.status === "buff_selection";
  const resultReady = useBattleResultReady(run.status === "battle", Boolean(match?.outcome), match?.outcome ?? null);

  if (match && (live || (match.outcome && !resultReady))) {
    const choosingBuff = run.status === "buff_selection";
    const duel: DuelView = {
      battleLog: match.log,
      duelId: match.id,
      enemyActiveCards: match.opponentCards,
      enemyHp: match.opponentHp,
      enemyMaxHp: match.opponentMaxHp,
      opponent: match.opponent,
      pairMultipliers: match.pairMultipliers,
      player: run.player ?? match.opponent,
      playerActiveCards: match.playerCards,
      playerHp: match.playerHp,
      playerMaxHp: match.playerMaxHp,
      status: "active",
      turnNumber: match.log[0]?.turnNumber ?? 0,
      version: match.log[0]?.turnNumber ?? 0,
    };
    const disabledSlots: [boolean, boolean, boolean] = now < match.cycleEndsAt ? match.playerUsedSlots : [false, false, false];
    const allSlotsUsed = disabledSlots.every(Boolean);
    const stage = run.stage;
    const hint = choosingBuff
      ? `Бій почнеться через ${clock((stage?.battleStartsAt ?? now) - now)}`
      : allSlotsUsed ? `Нові карти через ${clock(match.cycleEndsAt - now)}` : `${stage?.label ?? "Раунд"} · ${clock((stage?.endsAt ?? now) - now)}`;

    return <DuelBattle
      key={match.id}
      actionButtons={choosingBuff ? <div className="tournament-buff-options" aria-label="Підсилення перед боєм">
        {run.buffOptions?.map(option => <button
          aria-pressed={match.buffElement === option.element}
          className={`ui-button tournament-buff-option${match.buffElement === option.element ? " ui-button--primary" : ""}`}
          disabled={match.buffElement !== option.element && (pending !== null || run.goldAvailable < run.buffCost)}
          key={option.element}
          onClick={() => { if (match.buffElement !== option.element) onAction({ type: "buff", matchId: match.id, element: option.element }); }}
          type="button"
        >
          <ElementSymbol element={option.element} size={22} />
          <span>{ELEMENT_NAMES[option.element]} · +{formatUiNumber(option.addedPower)}</span>
          <small><CurrencyIcon kind="gold" size={13} />{formatUiNumber(run.buffCost)}</small>
        </button>)}
        {run.goldAvailable < run.buffCost && !match.buffElement ? <p className="tournament-buff-options__note">Недостатньо золота для підсилення.</p> : null}
      </div> : run.status === "battle" ? <div className="tournament-battle-actions">
        <button
          className="tournament-action"
          disabled={pending !== null || !match.freeChangeAvailable}
          onClick={() => onAction({ type: "change", matchId: match.id })}
          type="button"
        ><span aria-hidden="true" className="tournament-action__medallion"><AppIcon name="deck" size={28} /></span><span>Змінити карти</span><small>{match.freeChangeAvailable ? "безплатно" : "використано"}</small></button>
      </div> : undefined}
      actionHint={hint}
      actionNotice={error ? <p className="tournament-run-state__error" role="alert">{error}</p> : null}
      animateExchange={match.log.find(entry => entry.ownStrike) ?? null}
      disableCards={choosingBuff || run.status !== "battle" || pending !== null}
      disabledSlots={choosingBuff ? undefined : disabledSlots}
      duel={duel}
      onAction={slotIndex => onAction({ type: "attack", matchId: match.id, slotIndex })}
      pendingSlot={typeof pending === "number" && pending >= 0 ? pending as 0 | 1 | 2 : null}
    />;
  }

  const finished = run.status === "finished" || run.status === "eliminated";
  const standings = run.standings ?? [];
  const prize = prizeText(run);
  return <section className="tournament-run-state" aria-live="polite">
    <RibbonTitle as="h2" size="wide">{finished ? "Результати турніру" : run.leagueName}</RibbonTitle>
    {run.status === "waiting" ? <>
      <p className="tournament-run-state__lead">Турнір почнеться через {clock(Date.parse(run.startsAt) - now)}</p>
      <p className="tournament-run-state__note">Записано учасників: {formatUiNumber(run.participants)}</p>
    </> : null}
    {(run.status === "battle" || run.status === "buff_selection") && !match ? <p className="tournament-run-state__lead" role="status">Готуємо бій…</p> : null}
    {run.status === "cancelled" ? <p className="tournament-run-state__lead">Турнір не відбувся: для сітки потрібні щонайменше двоє гравців.</p> : null}
    {run.status === "round_wait" ? <>
      {match?.outcome ? <p className="tournament-run-state__lead">{match.outcome === "win" ? "Перемога в раунді" : "Поразка в раунді"}</p> : <p className="tournament-run-state__lead">Ти проходиш у наступний раунд без бою</p>}
      {match?.outcome ? <p className="tournament-run-state__note">Завдана шкода {formatUiNumber(match.playerDamage)} : {formatUiNumber(match.opponentDamage)}{match.ratingChange !== null ? ` · рейтинг ${signed(match.ratingChange)}` : ""}{match.xp !== null ? ` · досвід +${formatUiNumber(match.xp)}` : ""}</p> : null}
      {run.stage ? <p className="tournament-run-state__note">Пари наступного раунду визначаться через {clock(run.stage.pairedAt - now)}</p> : null}
    </> : null}
    {finished ? <>
      {standings.length ? <TournamentPodium league={run.league} standings={standings} viewerPlace={run.placement} /> : <p className="tournament-run-state__note">Результати ще підраховуються.</p>}
      <p className="tournament-run-state__lead">{run.placement ? `Твоє місце: ${run.placement}` : `Вибування: ${run.finishLabel ?? "раунд турніру"}`}</p>
      <p className="tournament-run-state__note">Рейтинг турніру {formatUiNumber(run.rating)} ({signed(run.ratingChange)}) · досвід +{formatUiNumber(run.xpEarned)}</p>
      {prize ? <p className="tournament-run-state__note">Приз: {prize}{run.prizeGranted?.sourcePending ? " (джерела з’являться в грі пізніше, приз збережено)" : ""}</p> : <p className="tournament-run-state__note">За цей результат приз не передбачений.</p>}
    </> : null}
    {error ? <p className="tournament-run-state__error" role="alert">{error}</p> : null}
    {match && !live && match.log.length ? <BattleLog entries={match.log} /> : null}
    <button className="ui-button ui-button--primary" onClick={onExit} type="button">До лобі турніру</button>
  </section>;
}
