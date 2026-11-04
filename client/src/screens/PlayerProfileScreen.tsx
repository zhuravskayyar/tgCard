import { ScreenHeading } from "../components/ScreenHeading";
import { calculateEquipmentSummary, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import { getLeagueByRating } from "@cardastika/shared";
import { CardArtwork } from "../components/CardArtwork";
import { AppIcon } from "../components/AppIcon";
import { ElementSymbol } from "../components/ElementSymbol";
import { EquipmentDoll } from "../components/EquipmentBook";
import { LeagueBadge } from "../components/LeagueBadge";
import { AvatarImage } from "../components/AvatarImage";
import { EQUIPMENT_ELEMENT_ORDER } from "../equipment/equipmentIcons";
import { EMPTY_EQUIPMENT } from "../equipment/equipmentState";
import { usePlayerProfile } from "../hooks/usePlayerProfile";
import { formatUiNumber, getUiLocale } from "../i18n";

interface PlayerProfileScreenProps {
  onBack: () => void;
  playerId: string;
}

const HONORS = [
  { image: "/assets/ui/profile/title-orb.png", label: "Найкращий титул" },
  { image: "/assets/ui/profile/dragon-medal.png", label: "Медаль дракона" },
  { image: "/assets/ui/profile/tournament-trophy.png", label: "Нагорода турніру" },
  { image: "/assets/ui/profile/achievement-orb.png", label: "Найкраще досягнення" },
];

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function winsLabel(count: number) {
  return `${formatUiNumber(count)} перемог`;
}

function formatLastActiveAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  const relativeTime = new Intl.RelativeTimeFormat(getUiLocale(), { numeric: "auto" });
  if (elapsedMinutes < 1) return relativeTime.format(0, "second");
  if (elapsedMinutes < 60) return relativeTime.format(-elapsedMinutes, "minute");
  return relativeTime.format(-Math.floor(elapsedMinutes / 60), "hour");
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section aria-label={title} className="pf-section">
      <h2>{title}</h2>
      <div className="eq-plate pf-plate">{children}</div>
    </section>
  );
}

// Same painted layout as the own profile, read-only: identity, doll, honours, cards, ratings.
export function PlayerProfileScreen({ onBack, playerId }: PlayerProfileScreenProps) {
  const state = usePlayerProfile(playerId);
  const profile = state.status === "ready" ? state.data : null;
  const equipment = profile?.equipment?.equipped ?? EMPTY_EQUIPMENT;
  const equipmentSummary = calculateEquipmentSummary(STARTER_EQUIPMENT_DEFINITIONS.filter(({ id, slot }) => equipment[slot] === id));

  return (
    <section className="profile-screen pf-screen player-profile-screen">
      <ScreenHeading onBack={onBack} title="Профіль мага" />

      {state.status === "loading" ? <p className="eq-note" aria-live="polite">Завантаження профілю…</p> : null}
      {state.status === "unavailable" ? <p className="eq-note">Профіль доступний після входу в гру.</p> : null}
      {state.status === "error" ? <p className="eq-note">Не вдалося завантажити профіль.</p> : null}

      {profile ? (
        <>
          <section aria-label={`Профіль гравця ${profile.displayName}`} className="eq-plate pf-identity pf-identity--public">
            <span className="eq-frame pf-portrait">
              <AvatarImage alt={`Аватар ${profile.displayName}`} name={profile.displayName} photoUrl={profile.photoUrl} />
            </span>
            <div className="pf-identity__copy">
              <strong className="pf-identity__name">{profile.displayName}</strong>
              <span className="pf-identity__level">Рівень {profile.level}</span>
            </div>
            <LeagueBadge league={getLeagueByRating(profile.duelRating)} size="sm" />
          </section>

          <div className="pf-power">
            <span>Сила колоди</span>
            <strong>{formatUiNumber(profile.deckPower)}</strong>
          </div>

          <div className="pf-elements pf-elements--public">
            {EQUIPMENT_ELEMENT_ORDER.map((element) => (
              <span key={element}><ElementSymbol element={element} size={18} /><b>+{equipmentSummary.elementBonuses[element]}</b></span>
            ))}
          </div>
          {equipmentSummary.artifactBonuses.length > 0 ? (
            <section aria-label="Бойові бонуси спорядження" className="pf-plate player-profile-equipment-effects">
              {equipmentSummary.artifactBonuses.map((bonus) => (
                <div className="pf-row" key={bonus.itemId}>
                  <AppIcon name="equipment" size={20} />
                  <span>{bonus.label}: +{bonus.value}%{bonus.secondaryLabel ? ` · ${bonus.secondaryLabel}: +${bonus.secondaryValue ?? 0}%` : ""}</span>
                </div>
              ))}
              {equipmentSummary.itemBonusTotal === 0 ? (
                <p className="pf-empty">Артефакти посилюють бойові ефекти; силу колоди додають речі стихій.</p>
              ) : null}
            </section>
          ) : null}

          <EquipmentDoll equipped={equipment} onSlot={() => undefined} />

          <Section title="Рекорди">
            <div className="pf-grid">
              {HONORS.map((honor) => (
                <article key={honor.label}>
                  <span className="pf-grid__title">{honor.label}</span>
                  <img alt="" className="pf-grid__icon" src={honor.image} />
                  <small>Немає</small>
                </article>
              ))}
            </div>
          </Section>

          <Section title="Найсильніші карти">
            {profile.strongestCards.length > 0 ? (
              <div className="player-profile-strongest-cards">
                {profile.strongestCards.map((card) => (
                  <article className={`player-profile-card-preview player-profile-card-preview--${card.element} player-profile-card-preview--${card.rarity}`} key={card.instanceId}>
                    <div className="player-profile-card-plate"><CardArtwork artKey={card.artKey} cardId={card.cardId} disableHolo element={card.element} power={card.finalPower} rarity={card.rarity} /></div>
                    <span>{card.displayName ?? "Карта"}</span>
                  </article>
                ))}
              </div>
            ) : <p className="pf-empty">Найсильніші карти ще не визначені.</p>}
          </Section>

          <Section title="Рейтинги">
            <div className="pf-grid">
              <article>
                <span className="pf-grid__title">Колода</span>
                <img alt="" className="pf-grid__icon" src="/assets/ui/profile/deck-power.png" />
                <strong>{formatUiNumber(profile.deckPower)}</strong>
                <small>Сила</small>
              </article>
              <article>
                <span className="pf-grid__title">Дуелі</span>
                <span className="pf-grid__icon"><LeagueBadge league={getLeagueByRating(profile.duelRating)} size="sm" /></span>
                <strong>{formatUiNumber(profile.duelRating)}</strong>
                <small>{winsLabel(profile.duelWins)}</small>
              </article>
              <article>
                <span className="pf-grid__title">Арена</span>
                <img alt="" className="pf-grid__icon" src="/assets/ui/profile/arena-shield.png" />
                <strong>—</strong>
                <small>Не грав</small>
              </article>
              <article>
                <span className="pf-grid__title">Турнір</span>
                <img alt="" className="pf-grid__icon" src="/assets/ui/profile/tournament-trophy.png" />
                <strong>—</strong>
                <small>Не грав</small>
              </article>
            </div>
          </Section>

          <Section title="Активність">
            <dl className="pf-facts">
              <div><dt>Остання активність</dt><dd>{formatLastActiveAt(profile.lastActiveAt)}</dd></div>
              <div><dt>Рівень мага</dt><dd>{profile.level}</dd></div>
              <div><dt>Перемог у дуелях</dt><dd>{formatUiNumber(profile.duelWins)}</dd></div>
            </dl>
          </Section>

          <Section title="Подарунки від магів">
            <p className="pf-empty">Подарунків немає.</p>
          </Section>
        </>
      ) : null}
    </section>
  );
}
