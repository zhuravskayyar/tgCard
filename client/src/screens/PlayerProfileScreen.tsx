import { getLeagueByRating } from "@cardastika/shared";
import { AppIcon, type AppIconName } from "../components/AppIcon";
import { CardArtwork } from "../components/CardArtwork";
import { CardQualityBadge } from "../components/CardQualityBadge";
import { EquipmentLoadout } from "../components/EquipmentLoadout";
import { LeagueBadge } from "../components/LeagueBadge";
import { LeagueProgressCard } from "../components/LeagueProgressCard";
import { EMPTY_EQUIPMENT } from "../equipment/equipmentState";
import { usePlayerProfile } from "../hooks/usePlayerProfile";
import { getUiNumberLocale } from "../i18n";

interface PlayerProfileScreenProps {
  onBack: () => void;
  playerId: string;
}

interface EmptyRecord {
  icon: AppIconName;
  label: string;
}

const emptyRecords: EmptyRecord[] = [
  { label: "Найкращий титул", icon: "ranking" },
  { label: "Медаль дракона", icon: "dungeon" },
  { label: "Нагорода турніру", icon: "tournament" },
  { label: "Найкраще досягнення", icon: "battle-pass" },
];

function formatScore(value: number) {
  return new Intl.NumberFormat(getUiNumberLocale()).format(value);
}

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ProfileSectionHeading({ children }: { children: string }) {
  return (
    <div className="player-profile-section-heading">
      <span aria-hidden="true" />
      <h2>{children}</h2>
      <span aria-hidden="true" />
    </div>
  );
}

export function PlayerProfileScreen({ onBack, playerId }: PlayerProfileScreenProps) {
  const state = usePlayerProfile(playerId);

  return (
    <section className="player-profile-screen">
      <header className="player-profile-screen__heading">
        <button aria-label="Назад" className="player-profile-screen__back" onClick={onBack} type="button">
          <AppIcon name="chevron" size={20} />
        </button>
        <div>
          <span>РЕЙТИНГ</span>
          <h1>ПРОФІЛЬ ГРАВЦЯ</h1>
        </div>
      </header>

      {state.status === "loading" ? <div className="player-profile-state">Завантаження профілю…</div> : null}
      {state.status === "unavailable" ? <div className="player-profile-state">Профіль доступний після запуску через Telegram.</div> : null}
      {state.status === "error" ? <div className="player-profile-state player-profile-state--error">Не вдалося завантажити профіль.</div> : null}

      {state.status === "ready" ? (
        <>
          <section className="player-profile-showcase" aria-label={`Профіль гравця ${state.data.displayName}`}>
            <div className="player-profile-identity">
              <div className="player-profile-card__avatar">
                {state.data.photoUrl ? <img alt={`Аватар ${state.data.displayName}`} src={state.data.photoUrl} /> : getInitials(state.data.displayName)}
              </div>
              <div className="player-profile-identity__copy">
                <strong>{state.data.displayName}</strong>
                <span>Рівень {state.data.level}</span>
              </div>
              <LeagueBadge league={getLeagueByRating(state.data.duelRating)} size="sm" />
            </div>

            <div className="player-profile-showcase__power">
              <span>Сила колоди</span>
              <strong>{formatScore(state.data.deckPower)}</strong>
            </div>

            <div className="player-profile-stats">
              <div><AppIcon name="duel" size={23} /><span>Перемоги в дуелях</span><strong>{formatScore(state.data.duelWins)}</strong></div>
              <div><AppIcon name="ranking" size={23} /><span>Рейтинг дуелей</span><strong>{formatScore(state.data.duelRating)}</strong></div>
              <div><AppIcon name="profile" size={23} /><span>Рівень гравця</span><strong>{state.data.level}</strong></div>
            </div>
          </section>

          <section className="player-profile-equipment" aria-label="Спорядження гравця">
            <EquipmentLoadout className="player-profile-equipment-loadout" compact equipped={state.data.equipment?.equipped ?? EMPTY_EQUIPMENT} readonly />
          </section>

          <section className="player-profile-section" aria-label="Рекорди гравця">
            <ProfileSectionHeading>Рекорди</ProfileSectionHeading>
            <div className="player-profile-records">
              {emptyRecords.map((record) => (
                <article key={record.label}>
                  <span>{record.label}</span>
                  <AppIcon name={record.icon} size={31} />
                  <small>Немає даних</small>
                </article>
              ))}
            </div>
          </section>

          <section className="player-profile-section" aria-label="Найсильніші карти">
            <ProfileSectionHeading>Найсильніші карти</ProfileSectionHeading>
            {state.data.strongestCards.length > 0 ? (
              <div className="player-profile-strongest-cards">
                {state.data.strongestCards.map((card) => (
                  <article className={`player-profile-card-preview player-profile-card-preview--${card.element} player-profile-card-preview--${card.rarity}`} key={card.instanceId}>
                    <CardArtwork artKey={card.artKey} cardId={card.cardId} element={card.element} />
                    <CardQualityBadge rarity={card.rarity} size="tiny" />
                    <strong>{formatScore(card.finalPower)}</strong>
                    <span>{card.displayName ?? "Карта"}</span>
                  </article>
                ))}
              </div>
            ) : <div className="player-profile-empty-row">Найсильніші карти ще не визначені.</div>}
          </section>

          <section className="player-profile-section" aria-label="Магія дракона">
            <ProfileSectionHeading>Магія дракона</ProfileSectionHeading>
            <div className="player-profile-dragon-empty">
              <AppIcon name="campaign" size={28} />
              <span>Магія дракона ще не відкрита.</span>
            </div>
          </section>

          <section className="player-profile-section" aria-label="Рейтинги гравця">
            <ProfileSectionHeading>Рейтинги</ProfileSectionHeading>
            <div className="player-profile-ratings">
              <article><span>Колода</span><AppIcon name="deck-power" size={27} /><strong>{formatScore(state.data.deckPower)}</strong><small>Сила колоди</small></article>
              <article><span>Дуелі</span><AppIcon name="duel" size={27} /><strong>{formatScore(state.data.duelRating)}</strong><small>{formatScore(state.data.duelWins)} перемог</small></article>
              <article><span>Арена</span><AppIcon name="arena" size={27} /><small>Не грав</small></article>
              <article><span>Турнір</span><AppIcon name="tournament" size={27} /><small>Не грав</small></article>
            </div>
          </section>

          <section className="player-profile-section">
            <ProfileSectionHeading>Використовуються бонуси</ProfileSectionHeading>
            <div className="player-profile-empty-row"><AppIcon name="guild" size={22} /><span>Бонусів немає.</span></div>
          </section>

          <section className="player-profile-section">
            <ProfileSectionHeading>Активність</ProfileSectionHeading>
            <dl className="player-profile-facts">
              <div><dt>Рівень гравця</dt><dd>{state.data.level}</dd></div>
              <div><dt>Перемог у дуелях</dt><dd>{formatScore(state.data.duelWins)}</dd></div>
              <div><dt>Остання активність</dt><dd>Немає даних</dd></div>
            </dl>
          </section>

          <section className="player-profile-section player-profile-gifts">
            <ProfileSectionHeading>Подарунки від магів</ProfileSectionHeading>
            <p>Подарунків немає.</p>
          </section>
        </>
      ) : null}

    </section>
  );
}
