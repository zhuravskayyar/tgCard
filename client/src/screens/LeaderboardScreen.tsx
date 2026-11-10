import { ScreenHeading } from "../components/ScreenHeading";
import { ExperienceFlask } from "../components/ExperienceFlask";
import { AvatarImage } from "../components/AvatarImage";
import { useEffect, useState } from "react";
import { ARENA_LEAGUE_CONFIG, DUEL_LEAGUE_CONFIG, LEADERBOARD_REQUIRED_DUEL_WINS, type LeaderboardEntry, type LeaderboardKind } from "@cardastika/shared";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import { FirstVisitHint } from "../components/FirstVisitHint";
import { LeagueBadge } from "../components/LeagueBadge";
import { Pagination } from "../components/Pagination";
import { useLeaderboard } from "../hooks/useLeaderboard";
import type { PlayerSummaryState } from "../types/player";
import { formatUiNumber } from "../i18n";
import "../styles/leaderboard-book.css";

interface LeaderboardScreenProps {
  onOpenPlayerProfile: (playerId: string) => void;
  onBack: () => void;
  playerSummaryState: PlayerSummaryState;
}

type LeaderboardTab = LeaderboardKind | "tournament" | "invasion";

// Same five tables as the reference; tournament and invasion are not in the game yet.
const leaderboardTabs: Array<{ icon: AppIconName; kind: LeaderboardTab; label: string; title: string }> = [
  { icon: "duel", kind: "duels", label: "Дуелі", title: "Рейтинг дуелей" },
  { icon: "arena", kind: "arena", label: "Арена", title: "Рейтинг арени" },
  { icon: "tournament", kind: "tournament", label: "Турнір", title: "Рейтинг турнірів" },
  { icon: "skull", kind: "invasion", label: "Навала", title: "Рейтинг навал" },
  { icon: "deck-power", kind: "deck", label: "Колода", title: "Рейтинг сили колоди" },
];

function isLiveKind(tab: LeaderboardTab): tab is LeaderboardKind {
  return tab === "duels" || tab === "arena" || tab === "deck";
}

function LeaderboardRow({ entry, mine, onOpen }: { entry: LeaderboardEntry; mine: boolean; onOpen: (id: string) => void }) {
  return (
    <li className={mine ? "is-player" : undefined}>
      <button className="leaderboard-entry" onClick={() => onOpen(entry.id)} type="button">
        <span className="leaderboard-entry__rank">{entry.rank}</span>
        <span className="leaderboard-entry__avatar">
          <AvatarImage alt={`Аватар ${entry.displayName}`} name={entry.displayName} photoUrl={entry.photoUrl} seed={entry.id} />
        </span>
        <span className="leaderboard-entry__identity">
          <strong>{entry.displayName}</strong>
          <small>Рівень {entry.level}</small>
        </span>
        <strong className="leaderboard-entry__score">{formatUiNumber(entry.score)}</strong>
      </button>
    </li>
  );
}

export function LeaderboardScreen({ onBack, onOpenPlayerProfile, playerSummaryState }: LeaderboardScreenProps) {
  const [tab, setTab] = useState<LeaderboardTab>("duels");
  const [page, setPage] = useState(1);
  const kind: LeaderboardKind = isLiveKind(tab) ? tab : "duels";
  const state = useLeaderboard(kind, page);
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const duelWins = state.status === "ready" ? state.data.duelWins : player?.duelWins ?? 0;
  const eligible = duelWins >= LEADERBOARD_REQUIRED_DUEL_WINS;
  const activeTab = leaderboardTabs.find((item) => item.kind === tab)!;

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const data = state.status === "ready" ? state.data : null;
  const league = data && data.leagueIndex !== null
    ? (kind === "arena" ? ARENA_LEAGUE_CONFIG : DUEL_LEAGUE_CONFIG).leagues[data.leagueIndex] ?? null
    : null;
  const me = data?.me ?? null;
  const meOnPage = me !== null && data !== null && data.entries.some((entry) => entry.id === me.id);

  return (
    <section className="leaderboard-screen">
      <ScreenHeading onBack={onBack} title="Найкращі" />
      <FirstVisitHint id="leaderboard" title="Рейтинг і ліги" items={["Перемоги підвищують твій рейтинг.", "Рейтинг визначає твою лігу.", "Чим вища ліга, тим більша базова нагорода за дуелі."]} />

      {playerSummaryState.status === "unavailable" || state.status === "unavailable" ? (
        <div className="leaderboard-state">Рейтинг доступний після запуску через Telegram.</div>
      ) : null}

      {playerSummaryState.status === "error" ? (
        <div className="leaderboard-state leaderboard-state--error">Не вдалося завантажити профіль.</div>
      ) : null}

      {playerSummaryState.status !== "unavailable" && state.status !== "unavailable" ? (
        !eligible ? (
          <section className="leaderboard-lock" aria-label="Рейтинг заблоковано">
            <AppIcon name="lock" size={34} />
            <strong>Рейтинг ще не відкритий</strong>
            <p>Виграйте ще {Math.max(0, LEADERBOARD_REQUIRED_DUEL_WINS - duelWins)} дуелей, щоб побачити найкращих гравців.</p>
            <div className="flask-meter leaderboard-lock__flask" role="progressbar" aria-valuemin={0} aria-valuemax={LEADERBOARD_REQUIRED_DUEL_WINS} aria-valuenow={Math.min(LEADERBOARD_REQUIRED_DUEL_WINS, duelWins)}>
              <ExperienceFlask progress={Math.min(1, duelWins / LEADERBOARD_REQUIRED_DUEL_WINS)} tone="crimson" />
            </div>
            <small>{duelWins}/{LEADERBOARD_REQUIRED_DUEL_WINS} перемог</small>
          </section>
        ) : (
          <>
            <h2 className="leaderboard-title">{activeTab.title}</h2>

            <div className="leaderboard-tabs" role="tablist" aria-label="Категорія рейтингу">
              {leaderboardTabs.map((item) => (
                <button
                  aria-label={item.label}
                  aria-selected={tab === item.kind}
                  className={tab === item.kind ? "leaderboard-tab leaderboard-tab--active" : "leaderboard-tab"}
                  data-coming-soon={isLiveKind(item.kind) ? undefined : true}
                  key={item.kind}
                  onClick={() => setTab(item.kind)}
                  role="tab"
                  type="button"
                >
                  <AppIcon name={item.icon} size={26} />
                </button>
              ))}
            </div>

            {!isLiveKind(tab) ? (
              <div className="leaderboard-state">{tab === "tournament" ? "Турніри" : "Навали"} з’являться в одному з наступних оновлень.</div>
            ) : (
              <section className="leaderboard-list-section" aria-label={activeTab.title}>
                {league ? (
                  <div className="leaderboard-league">
                    <LeagueBadge league={league} size="sm" />
                    <strong>Ліга {league.name}</strong>
                  </div>
                ) : null}

                {state.status === "loading" ? <div className="leaderboard-state">Завантаження рейтингу…</div> : null}
                {state.status === "error" ? <div className="leaderboard-state leaderboard-state--error">Не вдалося завантажити рейтинг.</div> : null}
                {data && data.entries.length === 0 ? (
                  <div className="leaderboard-state">{kind === "arena" ? "У твоїй лізі арени ще немає магів. Зіграй на арені, щоб потрапити в рейтинг." : "У рейтингу ще немає гравців."}</div>
                ) : null}
                {data && data.entries.length > 0 ? (
                  <ol className="leaderboard-list">
                    {data.entries.map((entry) => <LeaderboardRow entry={entry} key={entry.id} mine={entry.id === me?.id} onOpen={onOpenPlayerProfile} />)}
                    {me && !meOnPage ? <LeaderboardRow entry={me} mine onOpen={onOpenPlayerProfile} /> : null}
                  </ol>
                ) : null}

                {data ? <Pagination currentPage={data.page} onPageChange={setPage} totalPages={data.totalPages} /> : null}
              </section>
            )}
          </>
        )
      ) : null}
    </section>
  );
}
