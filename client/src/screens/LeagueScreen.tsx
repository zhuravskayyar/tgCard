import { ScreenHeading } from "../components/ScreenHeading";
import type { CSSProperties } from "react";
import { DUEL_LEAGUE_CONFIG, getLeagueIndexByRating } from "@cardastika/shared";
import { LeagueBadge } from "../components/LeagueBadge";
import { CurrencyIcon } from "../components/CurrencyDisplay";
import type { PlayerSummaryState } from "../types/player";

interface LeagueScreenProps {
  onBack: () => void;
  playerSummaryState: PlayerSummaryState;
}

export function LeagueScreen({ onBack, playerSummaryState }: LeagueScreenProps) {
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const rating = player?.duelRating ?? 0;
  const currentIndex = getLeagueIndexByRating(rating);
  const highestIndex = player?.duelHighestLeagueIndex ?? 0;

  return (
    <section className="league-screen">
      <ScreenHeading description={<>{rating} рейтингу · найвища: {DUEL_LEAGUE_CONFIG.leagues[highestIndex]?.name ?? "Мандрівник III"}</>} eyebrow="ПРОГРЕСІЯ" onBack={onBack} title="ДУЕЛЬНІ ЛІГИ" />
      <div className="league-list" aria-label="Список дуельних ліг">
        {DUEL_LEAGUE_CONFIG.leagues.map((league) => {
          const isCurrent = league.index === currentIndex;
          const isReached = league.index <= highestIndex;
          return (
            <article className={`league-list__item${isCurrent ? " league-list__item--current" : ""}${isReached ? " league-list__item--reached" : ""}`} key={league.key} style={{ "--league-color": league.accentColor } as CSSProperties}>
              <LeagueBadge league={league} size="sm" />
              <div className="league-list__copy">
                <strong>{league.name}</strong>
                <span>{league.minRating}{league.maxRating === null ? "+ рейтингу" : `–${league.maxRating} рейтингу`}</span>
              </div>
              <div className="league-list__rewards">
                <span>Перемога <b><CurrencyIcon kind="silver" size={12} />+{league.baseSilver}</b></span>
                <span>Перехід <b><CurrencyIcon kind="silver" size={12} />+{league.promotionReward}</b></span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
