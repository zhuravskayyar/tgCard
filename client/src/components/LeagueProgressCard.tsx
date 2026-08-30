import type { CSSProperties } from "react";
import { getBaseSilverForLeague, getLeagueByRating, getLeagueIndexByRating, getPromotionReward, DUEL_LEAGUE_CONFIG } from "@cardastika/shared";
import { LeagueBadge } from "./LeagueBadge";
import { CurrencyIcon } from "./CurrencyDisplay";
import { getUiNumberLocale } from "../i18n";

interface LeagueProgressCardProps {
  compact?: boolean;
  nextLabel?: "plain" | "prefixed";
  rating?: number;
  ratingChange?: number;
  showRewards?: boolean;
}

export function LeagueProgressCard({ compact = false, nextLabel = "prefixed", rating = 0, ratingChange, showRewards = true }: LeagueProgressCardProps) {
  const safeRating = Number.isSafeInteger(rating) && rating >= 0 ? rating : 0;
  const league = getLeagueByRating(safeRating);
  const leagueIndex = getLeagueIndexByRating(safeRating);
  const nextLeague = DUEL_LEAGUE_CONFIG.leagues[leagueIndex + 1];
  const progress = nextLeague
    ? Math.min(100, Math.max(0, ((safeRating - league.minRating) / (nextLeague.minRating - league.minRating)) * 100))
    : 100;

  return (
    <section className={`league-progress-card${compact ? " league-progress-card--compact" : ""}`} aria-label={`Дуельна ліга: ${league.name}`} style={{ "--league-color": league.accentColor } as CSSProperties}>
      <header className="league-progress-card__header">
        <LeagueBadge league={league} size={compact ? "sm" : "md"} />
        <div>
          <span>Дуельна ліга</span>
          <h2>{league.name}</h2>
        </div>
        <strong>
          {new Intl.NumberFormat(getUiNumberLocale()).format(safeRating)}
          {ratingChange !== undefined ? (
            <small className={ratingChange >= 0 ? "league-progress-card__rating-change league-progress-card__rating-change--positive" : "league-progress-card__rating-change league-progress-card__rating-change--negative"}>
              {ratingChange >= 0 ? "+" : "−"}{new Intl.NumberFormat(getUiNumberLocale()).format(Math.abs(ratingChange))}
            </small>
          ) : null}
        </strong>
      </header>
      <div className="league-progress-card__track" role="progressbar" aria-valuemin={league.minRating} aria-valuemax={nextLeague?.minRating ?? safeRating} aria-valuenow={safeRating}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="league-progress-card__next">
        <span>{nextLeague ? `${nextLabel === "prefixed" ? "До " : ""}${nextLeague.name}` : "Найвищий ранг"}</span>
        <strong>{nextLeague ? `${nextLabel === "plain" ? "ще " : ""}${new Intl.NumberFormat(getUiNumberLocale()).format(Math.max(0, nextLeague.minRating - safeRating))} рейтингу` : "MAX"}</strong>
      </div>
      {showRewards ? (
        <div className="league-progress-card__rewards">
          <span>Перемога: <CurrencyIcon kind="silver" size={13} />+{getBaseSilverForLeague(league.index)} срібла</span>
          {nextLeague ? <span>Підвищення: <CurrencyIcon kind="silver" size={13} />+{getPromotionReward(nextLeague.index)}</span> : <span>Вершина ліг</span>}
        </div>
      ) : null}
    </section>
  );
}
