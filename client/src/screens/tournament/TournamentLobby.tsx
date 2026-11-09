import { useEffect, useState } from "react";
import { ARENA_LEAGUE_CONFIG, type TournamentLobbyView } from "@cardastika/shared";
import { formatUiNumber } from "../../i18n";
import { RibbonTitle } from "../../components/RibbonTitle";
import { TournamentChat } from "./TournamentChat";
import { TournamentLeagueEmblem } from "./TournamentLeagueEmblem";
import { TournamentPodium } from "./TournamentPodium";
import { TournamentTrophy } from "./TournamentTrophy";

function clockLabel(offset: number) {
  if (offset === 0) return "GMT";
  const sign = offset < 0 ? "−" : "+";
  const absolute = Math.abs(offset);
  return `UTC${sign}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, "0")}` : ""}`;
}

function countdown(value: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(value) - now) / 1000));
  if (seconds < 120) return `${seconds} с`;
  const minutes = Math.ceil(seconds / 60);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  if (days) return `${days} д ${hours} год`;
  if (hours) return `${hours} год ${rest} хв`;
  return `${rest} хв`;
}

export function TournamentLobby({ data, error = null, onOpenRules, onOpenRun, onRefresh, onRegister, onUnregister, onScheduleTest, pending = false }: {
  /** Shown next to the buttons, so a failed tap is visible on a scrolled phone screen. */
  error?: string | null;
  data: TournamentLobbyView;
  onOpenRules: () => void;
  onOpenRun: () => void;
  onRefresh: () => void;
  onRegister: () => void;
  onUnregister: () => void;
  onScheduleTest: () => void;
  pending?: boolean;
}) {
  const offset = data.serverNow - Date.now();
  const [localNow, setLocalNow] = useState(() => Date.now());
  const now = localNow + offset;
  const league = data.leagues.find(item => item.league === data.league);
  const ratingLeague = ARENA_LEAGUE_CONFIG.leagues[data.ratingLeagueIndex]!;
  const event = data.event;
  const startsAt = event?.startsAt ?? data.schedule.startsAt;
  const registrationOpen = Boolean(event && event.status === "registration" && Date.parse(event.startsAt) > now);

  useEffect(() => {
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return <>
    <section className="tournament-event" aria-label="Турнір">
      {data.lastResults?.standings.length ? <>
        <RibbonTitle as="h2" size="wide">Результати турніру</RibbonTitle>
        <TournamentPodium league={data.league} standings={data.lastResults.standings} />
      </> : <TournamentTrophy />}

      <div className={`tournament-event__details${data.eligible ? "" : " tournament-event__details--locked"}`}>
        {data.eligible ? <>
          <p className="tournament-event__countdown">{Date.parse(startsAt) > now ? `Турнір почнеться через ${countdown(startsAt, now)}` : "Турнір розпочався"}</p>
          <p className="tournament-event__registration">
            {event?.registered ? `Запис підтверджено · учасників: ${formatUiNumber(event.registeredCount)}`
              : registrationOpen ? `Запис відкритий · учасників: ${formatUiNumber(event!.registeredCount)}`
                : `Запис відкривається за ${data.rules.registrationMinutes} хв до початку`}
          </p>
          <div className="tournament-event__schedule">
            <span className="tournament-league-mark">
              <TournamentLeagueEmblem league={ratingLeague} size={48} />
              <span><small>Рейтинг турніру{data.ratingProvisional ? " (до першої участі)" : ""}</small><strong>{ratingLeague.name} · {formatUiNumber(data.rating)}</strong></span>
            </span>
            <span>{data.leagueName} · час турнірів</span>
            <strong>{league?.hours.map(hour => `${String(hour).padStart(2, "0")}:00`).join(" · ")} <small>{clockLabel(data.schedule.utcOffsetMinutes)}</small></strong>
          </div>
        </> : <div className="tournament-event__locked">
          <p>Турнір доступний від ліги дуелей <strong>{data.requiredDuelLeagueName}</strong>.</p>
        </div>}
      </div>

      {data.runAvailable || event?.registered ? <button className={`ui-button tournament-event__action${data.runActive || event?.registered ? " ui-button--primary" : ""}`} onClick={onOpenRun} type="button">{data.runActive || event?.registered ? "До турніру" : "Результати турніру"}</button> : null}
      {data.eligible && !data.runActive && event?.registered ? <button className="ui-button tournament-event__action" disabled={pending} onClick={onUnregister} type="button">Скасувати запис</button> : null}
      {data.eligible && !data.runActive && !event?.registered && registrationOpen ? <button className="ui-button ui-button--primary tournament-event__action" disabled={pending} onClick={onRegister} type="button">Записатися</button> : null}
      {data.devScheduleAvailable && data.eligible && !data.runActive && !event?.registered ? <button className="ui-button tournament-event__action" disabled={pending} onClick={onScheduleTest} type="button">Тестовий турнір за хвилину</button> : null}
      <button className="ui-button tournament-event__action" disabled={pending} onClick={onRefresh} type="button">Оновити</button>

      {error ? <p className="tournament-run-state__error" role="alert">{error}</p> : null}
      {pending ? <p className="tournament-event__registration" role="status">Зачекай…</p> : null}
      <button className="ui-button tournament-rules__open" onClick={onOpenRules} type="button">Правила турніру</button>
    </section>
    <TournamentChat />
  </>;
}
