import type { CSSProperties } from "react";
import type { LeagueDefinition } from "@cardastika/shared";

interface LeagueBadgeProps {
  league: LeagueDefinition;
  size?: "sm" | "md" | "lg";
}

export function LeagueBadge({ league, size = "md" }: LeagueBadgeProps) {
  return (
    <span
      aria-label={league.name}
      className={`league-badge league-badge--${size}`}
      style={{ "--league-color": league.accentColor } as CSSProperties}
      role="img"
    >
      <img alt="" src={`/assets/ui/leagues/${league.iconKey}.png`} />
      <span aria-hidden="true">{league.division}</span>
    </span>
  );
}
