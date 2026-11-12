import { useState } from "react";
import { getPlayerDisplayName, parsePlayerAvatarId, PLAYER_AVATAR_COUNT, toPlayerAvatarId } from "@cardastika/shared";
import { AvatarImage } from "../components/AvatarImage";
import { getAvatarUrl } from "../components/avatarCatalog";
import { GuildMembershipRow } from "../components/GuildMembershipRow";
import { MenuRow } from "../components/MenuRow";
import { NicknameSkinPreview } from "../components/NicknameSkinPreview";
import { ScreenHeading } from "../components/ScreenHeading";
import type { PlayerSummaryState } from "../types/player";

interface ProfileSettingsScreenProps {
  onBack: () => void;
  onOpenGuild: () => void;
  onSaveAvatar: (avatar: string) => Promise<void>;
  playerSummaryState: PlayerSummaryState;
}

const AVATAR_INDEXES = Array.from({ length: PLAYER_AVATAR_COUNT }, (_, index) => index + 1);

/** Profile settings as in the reference: identity header, then one row per section. */
export function ProfileSettingsScreen({ onBack, onOpenGuild, onSaveAvatar, playerSummaryState }: ProfileSettingsScreenProps) {
  const [view, setView] = useState<"menu" | "avatar">("menu");
  const [pendingAvatar, setPendingAvatar] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;

  if (!player) {
    return (
      <section className="pf-screen pf-settings">
        <ScreenHeading onBack={onBack} title="Налаштування профілю" />
        <p className="eq-note" role="status">{playerSummaryState.status === "error" ? "Не вдалося завантажити профіль." : "Завантаження профілю…"}</p>
      </section>
    );
  }

  const displayName = getPlayerDisplayName(player);
  const currentAvatar = parsePlayerAvatarId(player.photoUrl);

  async function choose(index: number) {
    if (pendingAvatar !== null) return;
    if (index === currentAvatar) { setView("menu"); return; }
    setError(null);
    setPendingAvatar(index);
    try {
      await onSaveAvatar(toPlayerAvatarId(index));
      setView("menu");
    } catch {
      setError("Не вдалося змінити аватар. Спробуй ще раз.");
    } finally {
      setPendingAvatar(null);
    }
  }

  const identity = (
    <section aria-label="Гравець" className="eq-plate pf-identity">
      <span className="eq-frame pf-portrait">
        <AvatarImage alt={`Аватар ${displayName}`} name={displayName} photoUrl={player.photoUrl} seed={player.id} />
      </span>
      <div className="pf-identity__copy">
        <NicknameSkinPreview nickname={displayName} skinId={player.equippedNicknameSkin} />
        <span className="pf-identity__level">Рівень {player.level}</span>
      </div>
      <div className="pf-identity__guild"><GuildMembershipRow level={player.level} onOpen={onOpenGuild} /></div>
    </section>
  );

  if (view === "avatar") {
    return (
      <section className="pf-screen pf-settings">
        <ScreenHeading onBack={() => setView("menu")} title="Ваш аватар" />
        <p className="pf-settings__hint" id="pf-avatar-hint">Щоб змінити аватар, торкнися потрібного портрета.</p>
        {pendingAvatar !== null ? <p className="pf-settings__hint" role="status">Зберігаємо аватар…</p> : null}
        {error ? <p className="pf-settings__error" role="alert">{error}</p> : null}
        <div aria-busy={pendingAvatar !== null} aria-describedby="pf-avatar-hint" aria-label="Аватари" className={`pf-avatar-grid${currentAvatar !== null ? " pf-avatar-grid--chosen" : ""}`} role="group">
          {AVATAR_INDEXES.map((index) => (
            <button
              aria-disabled={pendingAvatar !== null}
              aria-label={`Аватар ${index}`}
              aria-pressed={index === currentAvatar}
              className={`eq-frame pf-avatar-option${index === currentAvatar ? " pf-avatar-option--current" : ""}${index === pendingAvatar ? " pf-avatar-option--pending" : ""}`}
              key={index}
              onClick={() => void choose(index)}
              type="button"
            >
              <img alt="" decoding="async" loading="lazy" src={getAvatarUrl(index)} />
            </button>
          ))}
        </div>
        <button className="eq-button eq-button--parchment pf-settings__return" disabled={pendingAvatar !== null} onClick={() => setView("menu")} type="button">Повернутися без змін</button>
      </section>
    );
  }

  return (
    <section className="pf-screen pf-settings">
      <ScreenHeading onBack={onBack} title="Налаштування профілю" />
      {identity}
      <nav aria-label="Налаштування профілю" className="pf-menu">
        <MenuRow compact icon="profile" metalTexture onClick={() => { setError(null); setView("avatar"); }} title="Вибрати аватар" />
        <MenuRow compact disabled icon="equipment" metalTexture title="Вибрати вигляд — незабаром" />
        <MenuRow compact disabled icon="settings" metalTexture title="Оформлення — незабаром" />
      </nav>
    </section>
  );
}
