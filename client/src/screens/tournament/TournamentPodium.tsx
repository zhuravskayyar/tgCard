import { useState } from "react";
import { ARENA_LEAGUE_CONFIG, type TournamentRegularLeague, type TournamentStanding } from "@cardastika/shared";
import { AvatarImage } from "../../components/AvatarImage";
import { ProfileMage } from "../../components/ProfileMage";
import { TournamentLeagueEmblem } from "./TournamentLeagueEmblem";

const PLACE_TITLES = ["Перше місце", "Друге місце", "Третє місце", "Четверте місце"] as const;
const MEDAL_FRAME = "/assets/ui/duel-search/medal-frame-v1.webp";

/** League cups arrive with docs/tournament-awards-sprites.md. Keep the slot stable until PNGs arrive. */
function PlaceCup({ league, place }: { league: TournamentRegularLeague; place: 1 | 2 | 3 | 4 }) {
  return <span className="tournament-place__cup">
    <CupImage league={league} place={place} />
  </span>;
}

function CupImage({ league, place }: { league: TournamentRegularLeague; place: 1 | 2 | 3 | 4 }) {
  const [missing, setMissing] = useState(false);
  return missing ? null : <img alt="" onError={() => setMissing(true)} src={`/assets/ui/tournament/awards/${league}-cup_${place}.png`} />;
}

function Standing({ entry, league, layout, viewerPlace }: {
  entry: TournamentStanding;
  league: TournamentRegularLeague;
  viewerPlace?: number;
  /** "row": portrait, name and cup side by side (first place); "stack": name above, portrait and cup below. */
  layout: "row" | "stack";
}) {
  const { participant, place } = entry;
  const mine = place === viewerPlace;
  const leagueBadge = ARENA_LEAGUE_CONFIG.leagues[participant.leagueIndex] ?? null;
  const portrait = <span className="tournament-place__portrait">
    <span className="tournament-place__photo"><AvatarImage alt={`Аватар ${participant.name}`} name={participant.name} photoUrl={participant.photoUrl} seed={participant.playerId} /></span>
    <img alt="" className="tournament-place__frame" src={MEDAL_FRAME} />
  </span>;
  const identity = <span className="tournament-place__identity">
    <span className="tournament-place__name">
      <TournamentLeagueEmblem league={leagueBadge} size={18} />
      <strong>{participant.name}{mine ? <em className="tournament-place__me"> · Ти</em> : null}</strong>
    </span>
    <small>{participant.guildName ?? `Рівень ${participant.level}`}</small>
  </span>;
  return <article className={`tournament-place tournament-place--${layout} tournament-place--${place}${mine ? " tournament-place--mine" : ""}`}>
    <h3 className="tournament-place__title"><span>{PLACE_TITLES[place - 1]}</span></h3>
    {layout === "row"
      ? <div className="tournament-place__body">{portrait}{identity}<PlaceCup league={league} place={place} /></div>
      : <>{identity}<div className="tournament-place__body">{portrait}<PlaceCup league={league} place={place} /></div></>}
  </article>;
}

export function TournamentPodium({ league, standings, viewerPlace }: {
  league: TournamentRegularLeague;
  standings: TournamentStanding[];
  viewerPlace?: number;
}) {
  const [first, second, third, fourth] = standings;
  if (!first) return null;
  return <div aria-label="Місця турніру" className="tournament-podium" role="group">
    <Standing entry={first} layout="row" league={league} viewerPlace={viewerPlace} />
    {first.participant.element ? <div className="tournament-podium__mage"><ProfileMage element={first.participant.element} /></div> : null}
    {second ? <div className={`tournament-podium__pair${third ? "" : " tournament-podium__pair--single"}`}>
      <Standing entry={second} layout="stack" league={league} viewerPlace={viewerPlace} />
      {third ? <Standing entry={third} layout="stack" league={league} viewerPlace={viewerPlace} /> : null}
    </div> : null}
    {fourth ? <Standing entry={fourth} layout="stack" league={league} viewerPlace={viewerPlace} /> : null}
  </div>;
}
