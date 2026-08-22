import type { PlayerSummaryState } from "../types/player";
import { AppIcon } from "./AppIcon";
import { CurrencyDisplay } from "./CurrencyDisplay";

interface TopHudProps {
  onRetry: () => void;
  state: PlayerSummaryState;
}

function getInitials(username: string) {
  return username
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function TopHud({ onRetry, state }: TopHudProps) {
  const isLoading = state.status === "loading";
  const player = state.status === "ready" ? state.data : null;
  const displayName = player?.username ?? player?.firstName ?? null;
  const fallbackTitle = state.status === "error" ? "Помилка даних" : "Гравець";
  const fallbackSubtitle = state.status === "error" ? "Спробуйте пізніше" : "Дані недоступні";

  return (
    <header className="top-hud" aria-busy={isLoading}>
      <div className="top-hud__player">
        <div className="player-avatar">
          {isLoading ? <span className="skeleton skeleton--avatar" /> : null}
          {player?.photoUrl ? <img alt={`Аватар ${displayName}`} src={player.photoUrl} /> : null}
          {player && !player.photoUrl ? (
            <span>{displayName ? getInitials(displayName) : <AppIcon name="profile" />}</span>
          ) : null}
          {!isLoading && !player ? <AppIcon name="profile" size={21} /> : null}
        </div>

        <div className="player-identity">
          {isLoading ? (
            <>
              <span className="skeleton skeleton--name" />
              <span className="skeleton skeleton--level" />
            </>
          ) : (
            <>
              <strong>{displayName ?? fallbackTitle}</strong>
              {state.status === "error" ? (
                <button className="player-retry" onClick={onRetry} type="button">
                  Повторити
                </button>
              ) : (
                <span>{player ? `Рівень ${player.level}` : fallbackSubtitle}</span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="currency-list">
        <CurrencyDisplay kind="silver" label="Срібло" state={state.status} value={player?.silver} />
        <CurrencyDisplay kind="gold" label="Золото" state={state.status} value={player?.gold} />
      </div>
    </header>
  );
}
