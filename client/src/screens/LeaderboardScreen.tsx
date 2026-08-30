import { useEffect, useState } from "react";
import { getLeagueByRating, LEADERBOARD_REQUIRED_DUEL_WINS, type LeaderboardKind } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { FirstVisitHint } from "../components/FirstVisitHint";
import { LeagueBadge } from "../components/LeagueBadge";
import { Pagination } from "../components/Pagination";
import { useLeaderboard } from "../hooks/useLeaderboard";
import type { PlayerSummaryState } from "../types/player";
import { getUiNumberLocale } from "../i18n";

interface LeaderboardScreenProps {
  onOpenPlayerProfile: (playerId: string) => void;
  onBack: () => void;
  playerSummaryState: PlayerSummaryState;
}

const leaderboardTabs: Array<{ icon: "duel" | "deck-power"; kind: LeaderboardKind; label: string }> = [
  { icon: "duel", kind: "duels", label: "За дуелями" },
  { icon: "deck-power", kind: "deck", label: "За силою колоди" },
];

function formatScore(value: number) {
  return new Intl.NumberFormat(getUiNumberLocale()).format(value);
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function LeaderboardScreen({ onBack, onOpenPlayerProfile, playerSummaryState }: LeaderboardScreenProps) {
  const [kind, setKind] = useState<LeaderboardKind>("duels");
  const [page, setPage] = useState(1);
  const state = useLeaderboard(kind, page);
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const duelWins = state.status === "ready" ? state.data.duelWins : player?.duelWins ?? 0;
  const eligible = duelWins >= LEADERBOARD_REQUIRED_DUEL_WINS;

  useEffect(() => {
    setPage(1);
  }, [kind]);

  function selectKind(nextKind: LeaderboardKind) {
    if (!eligible || nextKind === kind) return;
    setKind(nextKind);
  }

  return (
    <section className="leaderboard-screen">
      <header className="leaderboard-screen__heading">
        <button aria-label="Назад" className="leaderboard-screen__back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>ЗМАГАННЯ</span>
          <h1>РЕЙТИНГ</h1>
          <p>Топ гравців Cardastika</p>
        </div>
      </header>
      <FirstVisitHint id="leaderboard" title="Рейтинг і ліги" items={["Перемоги підвищують твій рейтинг.", "Рейтинг визначає твою лігу.", "Чим вища ліга, тим більша базова нагорода за дуелі."]} />

      {playerSummaryState.status === "unavailable" || state.status === "unavailable" ? (
        <div className="leaderboard-state">Рейтинг доступний після запуску через Telegram.</div>
      ) : null}

      {playerSummaryState.status === "error" ? (
        <div className="leaderboard-state leaderboard-state--error">Не вдалося завантажити профіль.</div>
      ) : null}

      {playerSummaryState.status !== "unavailable" && state.status !== "unavailable" ? (
        <>
          {!eligible ? (
            <section className="leaderboard-lock" aria-label="Рейтинг заблоковано">
              <AppIcon name="lock" size={34} />
              <strong>Рейтинг ще не відкритий</strong>
              <p>Виграйте ще {Math.max(0, LEADERBOARD_REQUIRED_DUEL_WINS - duelWins)} дуелей, щоб побачити найкращих гравців.</p>
              <div className="leaderboard-lock__progress" role="progressbar" aria-valuemin={0} aria-valuemax={LEADERBOARD_REQUIRED_DUEL_WINS} aria-valuenow={Math.min(LEADERBOARD_REQUIRED_DUEL_WINS, duelWins)}>
                <span style={{ width: `${Math.min(100, (duelWins / LEADERBOARD_REQUIRED_DUEL_WINS) * 100)}%` }} />
              </div>
              <small>{duelWins}/{LEADERBOARD_REQUIRED_DUEL_WINS} перемог</small>
            </section>
          ) : (
            <>
              <div className="leaderboard-tabs" role="tablist" aria-label="Категорія рейтингу">
                {leaderboardTabs.map((tab) => (
                  <button
                    aria-selected={kind === tab.kind}
                    className={kind === tab.kind ? "leaderboard-tab leaderboard-tab--active" : "leaderboard-tab"}
                    key={tab.kind}
                    onClick={() => selectKind(tab.kind)}
                    role="tab"
                    type="button"
                  >
                    <AppIcon name={tab.icon} size={24} />
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              <section className="leaderboard-list-section" aria-label={`Топ гравців ${kind === "duels" ? "за дуелями" : "за силою колоди"}`}>
                <div className="leaderboard-list-section__title">
                  <span aria-hidden="true" />
                  <h2>{kind === "duels" ? "НАЙКРАЩІ ДУЕЛЯНТИ" : "НАЙСИЛЬНІШІ КОЛОДИ"}</h2>
                  <span aria-hidden="true" />
                </div>

                {state.status === "loading" ? <div className="leaderboard-state">Завантаження рейтингу…</div> : null}
                {state.status === "error" ? <div className="leaderboard-state leaderboard-state--error">Не вдалося завантажити рейтинг.</div> : null}
                {state.status === "ready" && state.data.entries.length === 0 ? <div className="leaderboard-state">У рейтингу ще немає гравців.</div> : null}
                {state.status === "ready" && state.data.entries.length > 0 ? (
                  <ol className="leaderboard-list">
                    {state.data.entries.map((entry) => (
                      <li key={entry.id}>
                        <button className="leaderboard-entry" onClick={() => onOpenPlayerProfile(entry.id)} type="button">
                          <span className="leaderboard-entry__rank">{entry.rank}</span>
                          <span className="leaderboard-entry__avatar">
                            {entry.photoUrl ? <img alt={`Аватар ${entry.displayName}`} src={entry.photoUrl} /> : getInitials(entry.displayName)}
                          </span>
                          <span className="leaderboard-entry__identity">
                            <strong>{entry.displayName}</strong>
                            <small>Рівень {entry.level}</small>
                          </span>
                          <span className="leaderboard-entry__score">
                            {kind === "duels" ? <LeagueBadge league={getLeagueByRating(entry.score)} size="sm" /> : null}
                            <AppIcon name={kind === "duels" ? "duel" : "deck-power"} size={18} />
                            <strong>{formatScore(entry.score)}</strong>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : null}

                {state.status === "ready" ? (
                  <Pagination currentPage={state.data.page} onPageChange={setPage} totalPages={state.data.totalPages} />
                ) : null}
              </section>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
