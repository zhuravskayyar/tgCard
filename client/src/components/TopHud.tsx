import type { PlayerSummaryState } from "../types/player";
import { getPlayerDisplayName } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { CurrencyDisplay } from "./CurrencyDisplay";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { NicknameSkinPreview } from "./NicknameSkinPreview";

interface TopHudProps {
  deckPowerOverride?: number;
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

export function TopHud({ deckPowerOverride, onRetry, state }: TopHudProps) {
  const isLoading = state.status === "loading";
  const player = state.status === "ready" ? state.data : null;
  const { state: deckState } = usePlayerDeck();
  const displayName = player ? getPlayerDisplayName(player) : null;
  const fallbackTitle = state.status === "error" ? "Помилка даних" : "Гравець";
  const fallbackSubtitle = state.status === "error" ? "Спробуйте пізніше" : "Дані недоступні";
  const loadedDeckPower = deckState.status === "ready" ? deckState.deck.totalPower : null;
  const deckPower = deckPowerOverride ?? loadedDeckPower;
  const accountXp = player?.accountXp;
  const accountXpRequired = player?.accountXpRequired;
  const hasExperience = (
    typeof accountXp === "number" &&
    typeof accountXpRequired === "number" &&
    accountXpRequired >= 0
  );
  const experiencePercent = hasExperience
    ? accountXpRequired === 0 ? 100 : Math.min(100, Math.max(0, (accountXp / accountXpRequired) * 100))
    : 0;

  return (
    <header className="top-hud" aria-busy={isLoading}>
      <div className="top-hud__main">
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
              <div className="player-identity__headline">
                <span className="skeleton skeleton--name" />
                <span className="skeleton skeleton--deck-power" />
              </div>
            ) : (
              <div className="player-identity__headline">
                <NicknameSkinPreview compact nickname={displayName ?? fallbackTitle} skinId={player?.equippedNicknameSkin} />
              </div>
            )}
            {isLoading ? <span className="skeleton skeleton--deck-power" /> : null}
            {!isLoading && state.status === "error" ? (
              <button className="player-retry" onClick={onRetry} type="button">
                Повторити
              </button>
            ) : null}
            {!isLoading && state.status !== "error" ? (
              player ? (
                <span className="player-deck-power" aria-label={`Сила колоди: ${deckPower ?? "недоступна"}`}>
                  <AppIcon name="deck-power" size={14} />
                  <span>{deckPower ?? "—"}</span>
                </span>
              ) : <span>{fallbackSubtitle}</span>
            ) : null}
          </div>
        </div>

        <div className="currency-list">
          <CurrencyDisplay kind="silver" label="Срібло" state={state.status} value={player?.silver} />
          <CurrencyDisplay kind="gold" label="Золото" state={state.status} value={player?.gold} />
        </div>
      </div>

      <div className="top-hud__xp" aria-label={hasExperience ? (accountXpRequired === 0 ? "Максимальний рівень" : `Досвід: ${accountXp} з ${accountXpRequired}`) : "Досвід: недоступний"}>
        <div
          aria-valuemax={hasExperience ? accountXpRequired : undefined}
          aria-valuemin={hasExperience ? 0 : undefined}
          aria-valuenow={hasExperience ? accountXp : undefined}
          className="top-hud__xp-track"
          role="progressbar"
        >
          <span className="top-hud__xp-fill" style={{ width: `${experiencePercent}%` }} />
        </div>
      </div>
    </header>
  );
}
