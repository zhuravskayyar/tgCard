import { useRef } from "react";
import type { PlayerSummaryState } from "../types/player";
import { getPlayerDisplayName } from "@cardastika/shared";
import { AppIcon } from "./AppIcon";
import { AvatarImage } from "./AvatarImage";
import { CurrencyDisplay } from "./CurrencyDisplay";
import { DiamondHudPill } from "./DiamondHudPill";
import { ExperienceFlask } from "./ExperienceFlask";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { useExperienceFly } from "../hooks/useExperienceFly";
import { NicknameSkinPreview } from "./NicknameSkinPreview";

interface TopHudProps {
  deckPowerOverride?: number;
  onOpenSettings: () => void;
  onRetry: () => void;
  state: PlayerSummaryState;
}

export function TopHud({ deckPowerOverride, onOpenSettings, onRetry, state }: TopHudProps) {
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
  const experienceTrackRef = useRef<HTMLSpanElement>(null);
  const experienceProgress = useExperienceFly(
    player && hasExperience ? { level: player.level, required: accountXpRequired, xp: accountXp } : null,
    experienceTrackRef,
  );

  return (
    <header className="top-hud" aria-busy={isLoading}>
      <div className="top-hud__main">
        <div className="top-hud__player">
          <div className="player-avatar">
            {isLoading ? <span className="skeleton skeleton--avatar" /> : null}
            {player ? <AvatarImage alt={displayName ? `Аватар ${displayName}` : ""} name={displayName ?? ""} photoUrl={player.photoUrl} seed={player.id} /> : null}
            {!isLoading && !player ? <AppIcon name="profile" size={21} /> : null}
            <span aria-hidden="true" className="player-avatar__frame" />
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
                <span className="player-deck-power" aria-label={`Сила колоди: ${deckPower ?? "недоступна"}. Рівень: ${player.level}`}>
                  <AppIcon name="fleur-de-lis" size={14} />
                  <span className="player-deck-power__value">{deckPower ?? "—"}</span>
                  <span className="player-deck-power__level"><span>Рів.</span><strong>{player.level}</strong></span>
                </span>
              ) : <span>{fallbackSubtitle}</span>
            ) : null}
          </div>
        </div>

        <div className="currency-list">
          <CurrencyDisplay kind="silver" label="Срібло" state={state.status} value={player?.silver} />
          <CurrencyDisplay kind="gold" label="Золото" state={state.status} value={player?.gold} />
          <DiamondHudPill />
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
          {player ? <ExperienceFlask progress={experienceProgress} tipRef={experienceTrackRef} /> : null}
        </div>
        <button className="top-hud__settings" aria-label="Налаштування" onClick={onOpenSettings} type="button" />
      </div>
    </header>
  );
}
