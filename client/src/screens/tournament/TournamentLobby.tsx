import { useEffect, useState } from "react";
import { getLeagueByRating, type LeagueDefinition, type TournamentLobbyView } from "@cardastika/shared";
import { formatUiNumber } from "../../i18n";
import { TournamentChat } from "./TournamentChat";
import { TournamentLeagueEmblem } from "./TournamentLeagueEmblem";
import { TournamentTrophy } from "./TournamentTrophy";

function clockLabel(offset: number) {
  if (offset === 0) return "GMT";
  const sign = offset < 0 ? "−" : "+";
  const absolute = Math.abs(offset);
  return `UTC${sign}${Math.floor(absolute / 60)}${absolute % 60 ? `:${String(absolute % 60).padStart(2, "0")}` : ""}`;
}

function countdown(value: string, now: number) {
  const minutes = Math.max(0, Math.ceil((Date.parse(value) - now) / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  if (days) return `${days} д ${hours} год`;
  if (hours) return `${hours} год ${rest} хв`;
  return `${rest} хв`;
}

function TournamentLeagueMark({ league }: { league: LeagueDefinition }) {
  return <span className="tournament-league-mark">
    <TournamentLeagueEmblem league={league} size={48} />
    <span><small>Твоя ліга дуелей</small><strong>{league.name}</strong></span>
  </span>;
}

export function TournamentLobby({ data, onEnter, onOpenRules, pending = false, resumeAvailable = false }: {
  data: TournamentLobbyView;
  onEnter?: () => void;
  onOpenRules: () => void;
  pending?: boolean;
  resumeAvailable?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const league = data.leagues.find(item => item.league === data.league);
  const playerLeague = getLeagueByRating(data.duelRating);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return <>
    <section className="tournament-event" aria-label="Турнір">
      <TournamentTrophy />

      <div className={`tournament-event__details${data.eligible ? "" : " tournament-event__details--locked"}`}>
        {data.eligible ? <>
          <p className="tournament-event__countdown">{Date.parse(data.schedule.startsAt) > now ? `Турнір почнеться через ${countdown(data.schedule.startsAt, now)}` : "Турнір розпочався"}</p>
          <p className="tournament-event__registration">
            {data.registrationAvailable && Date.parse(data.schedule.registrationOpensAt) <= now
              ? "Запис на турнір відкритий"
              : `Запис відкривається за ${data.rules.registrationMinutes} хв до початку`}
          </p>
          <div className="tournament-event__schedule">
            <TournamentLeagueMark league={playerLeague} />
            <span>{data.leagueName} · час турнірів</span>
            <strong>{league?.hours.map(hour => `${String(hour).padStart(2, "0")}:00`).join(" · ")} <small>{clockLabel(data.schedule.utcOffsetMinutes)}</small></strong>
          </div>
        </> : <div className="tournament-event__locked">
          <p>Турнір доступний від <strong>{formatUiNumber(data.requiredDuelRating)} рейтингу дуелей</strong>.</p>
          <TournamentLeagueMark league={playerLeague} />
        </div>}
      </div>

      {import.meta.env.DEV && onEnter ? <button className="ui-button tournament-event__local" disabled={pending} onClick={onEnter} type="button">{resumeAvailable ? "Продовжити турнір" : pending ? "Завантаження…" : "Записатися"}</button> : null}

      <button className="ui-button tournament-rules__open" onClick={onOpenRules} type="button">Правила турніру</button>
    </section>
    <TournamentChat />
  </>;
}
