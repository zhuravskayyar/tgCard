import type { CSSProperties } from "react";
import type { LeagueDefinition } from "@cardastika/shared";
import { LeagueBadge } from "../../components/LeagueBadge";

export function TournamentLeagueEmblem({ league, size = 42 }: { league: LeagueDefinition | null; size?: number }) {
  const style = { "--league-emblem-size": `${size}px` } as CSSProperties;
  return <span aria-hidden="true" className="tournament-league-emblem" style={style}>
    {league ? <LeagueBadge league={league} size="sm" /> : null}
  </span>;
}
