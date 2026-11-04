import { useEffect, useState } from "react";
import type { CardElement, DuelView, TournamentRunView } from "@cardastika/shared";
import { CardArtwork } from "../../components/CardArtwork";
import { ElementSymbol } from "../../components/ElementSymbol";
import { RibbonTitle } from "../../components/RibbonTitle";
import { formatUiNumber } from "../../i18n";
import { DuelBattle } from "../DuelScreen";

function Standing({ place, participant, champion = false }: {
  place: number;
  participant: NonNullable<TournamentRunView["standings"]>[number]["participant"];
  champion?: boolean;
}) {
  const card = participant.cards[0];
  return <article className={`tournament-standing${champion ? " tournament-standing--champion" : ""}`}>
    <strong>{place} місце</strong>
    {card ? <span className="tournament-standing__art"><CardArtwork artKey={card.artKey} cardId={card.cardId} element={card.element} rarity={card.rarity} /></span> : null}
    <span>{participant.name}</span>
  </article>;
}

const ELEMENT_NAMES: Record<CardElement, string> = { fire: "Вогонь", water: "Вода", air: "Повітря", earth: "Земля" };

export function TournamentRun({ run, pending, error, onAction, onContinue, onExit }: {
  run: TournamentRunView;
  pending: number | "buff" | null;
  error: string | null;
  onAction: (action: { type: "buff"; matchId: string; element: CardElement } | { type: "attack"; matchId: string; slotIndex: 0 | 1 | 2 }) => void;
  onContinue: () => void;
  onExit: () => void;
}) {
  const match = run.match;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!match || run.status !== "battle") return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, match.playerCycleEndsAt - Date.now() + 40));
    return () => window.clearTimeout(timer);
  }, [match?.playerCycleEndsAt, run.status]);

  if (match) {
    const duel: DuelView = {
      battleLog: match.log,
      duelId: match.id,
      enemyActiveCards: match.opponentCards as DuelView["enemyActiveCards"],
      enemyHp: match.opponentHp,
      enemyMaxHp: match.opponentMaxHp,
      opponent: match.opponent,
      pairMultipliers: match.pairMultipliers,
      player: run.player,
      playerActiveCards: match.playerCards as DuelView["playerActiveCards"],
      playerHp: match.playerHp,
      playerMaxHp: match.playerMaxHp,
      status: "active",
      turnNumber: match.log[0]?.turnNumber ?? 0,
      version: match.log[0]?.turnNumber ?? 0,
    };
    const choosingBuff = run.status === "buff_selection";
    const disabledSlots: [boolean, boolean, boolean] = now < match.playerCycleEndsAt ? match.playerUsedSlots : [false, false, false];
    const allSlotsUsed = disabledSlots.every(Boolean);

    return <DuelBattle
      key={`${match.id}:${choosingBuff ? "buff" : "battle"}`}
      actionButtons={choosingBuff ? <div className="tournament-buff-options" aria-label="Підсилення перед боєм">
        {run.buffOptions?.map(option => <button
          className="ui-button tournament-buff-option"
          disabled={pending !== null}
          key={option.element}
          onClick={() => onAction({ type: "buff", matchId: match.id, element: option.element })}
          type="button"
        >
          <ElementSymbol element={option.element} size={22} />
          <span>{ELEMENT_NAMES[option.element]} · +{option.addedPower}</span>
          {run.buffCost !== undefined ? <small>{run.buffCost === 0 ? "Безкоштовно" : `${formatUiNumber(run.buffCost)} золота`}</small> : null}
        </button>)}
      </div> : undefined}
      actionHint={choosingBuff ? "Оберіть стихію для цього бою" : allSlotsUsed ? "Очікуйте наступний цикл карт" : undefined}
      actionNotice={error ? <p className="tournament-run-state__error" role="alert">{error}</p> : null}
      disableCards={choosingBuff || pending !== null}
      disabledSlots={choosingBuff ? undefined : disabledSlots}
      duel={duel}
      onAction={slotIndex => onAction({ type: "attack", matchId: match.id, slotIndex })}
      pendingSlot={typeof pending === "number" && pending >= 0 ? pending as 0 | 1 | 2 : null}
    />;
  }

  const finished = run.status === "finished" || run.status === "eliminated";
  const standings = run.standings ?? [];
  return <section className="tournament-run-state" aria-live="polite">
    {run.status === "between_rounds" ? <>
      <h2>Раунд завершено</h2>
      {error ? <p className="tournament-run-state__error" role="alert">{error}</p> : null}
      <button className="ui-button ui-button--primary" disabled={pending !== null} onClick={onContinue} type="button">Наступний бій</button>
    </> : finished ? <>
      <RibbonTitle as="h2" size="wide">Результати турніру</RibbonTitle>
      {standings.length === 4 ? <div className="tournament-standings" aria-label="Місця турніру">
        <Standing champion participant={standings[0]!.participant} place={1} />
        <div className="tournament-standings__podium">
          <Standing participant={standings[1]!.participant} place={2} />
          <Standing participant={standings[2]!.participant} place={3} />
        </div>
        <Standing participant={standings[3]!.participant} place={4} />
      </div> : null}
      {run.placement !== undefined ? <p>Твоє місце: {run.placement}</p> : <p>Ти вибув із турніру</p>}
      {run.prize ? <p className="tournament-run-state__note">Приз за місце{run.prize.reward ? ` · ${run.prize.reward.kind === "card" ? "карта" : "джерело"} рівня ${run.prize.reward.level}` : ""}{run.prize.diamonds ? ` · ${formatUiNumber(run.prize.diamonds)} алмазів` : ""}</p> : null}
      {error ? <p className="tournament-run-state__error" role="alert">{error}</p> : null}
      <button className="ui-button ui-button--primary" onClick={onExit} type="button">Турнір</button>
    </> : <p className="tournament-run-state__error" role="alert">Турнірний бій недоступний.</p>}
  </section>;
}
