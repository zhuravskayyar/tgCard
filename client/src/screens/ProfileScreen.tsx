import type { EquippedEquipment } from "@cardastika/shared";
import { getLeagueByRating, getPlayerDisplayName } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { EquipmentLoadout } from "../components/EquipmentLoadout";
import { LeagueBadge } from "../components/LeagueBadge";
import { MenuRow } from "../components/MenuRow";
import { NicknameSkinPreview } from "../components/NicknameSkinPreview";
import { GuildMembershipRow } from "../components/GuildMembershipRow";
import { usePlayerDeck, type PlayerDeckState } from "../hooks/usePlayerDeck";
import type { PlayerSummaryState } from "../types/player";

interface ProfileScreenProps {
  equipment: EquippedEquipment;
  onOpenDeck: () => void;
  onOpenGuild: () => void;
  onOpenInventory: () => void;
  onOpenMail: () => void;
  onOpenLeagues: () => void;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
  hasUnreadMail: boolean;
}

interface ProfileSectionHeadingProps {
  children: string;
}

interface EmptyRecord {
  image: string;
  label: string;
}

const emptyRecords: EmptyRecord[] = [
  { image: "/assets/ui/profile/title-orb.png", label: "Найкращий титул" },
  { image: "/assets/ui/profile/dragon-medal.png", label: "Медаль дракона" },
  { image: "/assets/ui/profile/tournament-trophy.png", label: "Нагорода турніру" },
  { image: "/assets/ui/profile/achievement-orb.png", label: "Найкраще досягнення" },
];

function ProfileSectionHeading({ children }: ProfileSectionHeadingProps) {
  return (
    <div className="profile-section-heading">
      <span aria-hidden="true" />
      <h2>{children}</h2>
      <span aria-hidden="true" />
    </div>
  );
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

function getDeckPower(state: PlayerDeckState) {
  return state.status === "ready" ? state.deck.totalPower : null;
}

export function ProfileScreen({
  equipment,
  onOpenDeck,
  onOpenGuild,
  onOpenInventory,
  onOpenMail,
  onOpenLeagues,
  onRetryPlayerSummary,
  playerSummaryState,
  hasUnreadMail,
}: ProfileScreenProps) {
  const { retry: retryDeck, state: deckState } = usePlayerDeck();
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const displayName = player ? getPlayerDisplayName(player) : "Гравець";
  const duelRating = player?.duelRating;
  const deckPower = getDeckPower(deckState);
  const experienceRewardPct = player?.experienceRewardPct ?? 0;
  const collectionBonuses = player?.collectionBonuses ?? [];
  const collectionExperienceRewardPct = collectionBonuses.reduce(
    (total, { bonus }) => total + (bonus.type === "experience_reward_pct" ? bonus.value : 0),
    0,
  );
  const additionalExperienceRewardPct = Math.max(0, experienceRewardPct - collectionExperienceRewardPct);

  return (
    <section className="profile-screen">
      <header className="profile-heading">
        <h1>ВАШ ПРОФІЛЬ</h1>
      </header>

      {playerSummaryState.status === "loading" ? (
        <div className="profile-state" aria-live="polite">Завантаження профілю…</div>
      ) : null}
      {playerSummaryState.status === "unavailable" ? (
        <div className="profile-state">Профіль доступний після запуску через Telegram.</div>
      ) : null}
      {playerSummaryState.status === "error" ? (
        <div className="profile-state profile-state--error">
          <span>Не вдалося завантажити профіль.</span>
          <button onClick={onRetryPlayerSummary} type="button">Повторити</button>
        </div>
      ) : null}

      {player ? (
        <>
          <section className="profile-showcase" aria-label="Гравець і спорядження">
            <div className="profile-identity-block">
              <div className="profile-player-card">
                <div className="profile-showcase__portrait">
                  {player.photoUrl ? <img alt={`Аватар ${displayName}`} src={player.photoUrl} /> : <span>{getInitials(displayName)}</span>}
                </div>
                <NicknameSkinPreview compact nickname={displayName} skinId={player.equippedNicknameSkin} />
                <span className="profile-player-card__level">Рівень {player.level}</span>
              </div>
              <GuildMembershipRow level={player.level} onOpen={onOpenGuild} />
            </div>
            <div className="profile-equipment" aria-label="Персонаж і екіпіроване спорядження">
              <EquipmentLoadout className="profile-equipment-loadout" compact equipped={equipment} hideVoodoo readonly />
            </div>

            <div className="profile-showcase__power">
              <span>Сила колоди</span>
              <strong>{deckPower ?? ""}</strong>
              {deckState.status === "error" ? <button onClick={retryDeck} type="button">Повторити</button> : null}
            </div>
          </section>

          <section className="profile-menu" aria-label="Розділи профілю">
            <MenuRow attention={hasUnreadMail} badge={hasUnreadMail ? "Нове" : undefined} compact icon="mail" metalTexture onClick={onOpenMail} title="Моя пошта" />
            <MenuRow active={deckState.status === "ready"} compact icon="deck" metalTexture onClick={onOpenDeck} title="Бойова колода" />
            <MenuRow compact icon="inventory" metalTexture onClick={onOpenInventory} title="Інвентар" />
            <MenuRow compact detail="Скоро" disabled icon="record" metalTexture title="Рекорди" />
          </section>

          <section className="profile-record-grid" aria-label="Відзнаки гравця">
            {emptyRecords.map((record) => (
              <article key={record.label}>
                <span>{record.label}</span>
                <img alt="" className="profile-record-grid__asset" src={record.image} />
                <small>Немає даних</small>
              </article>
            ))}
          </section>

          <section className="profile-section" aria-label="Рейтинги гравця">
            <ProfileSectionHeading>Рейтинги</ProfileSectionHeading>
            <div className="profile-rating-grid">
              <article>
                <span>Колода</span>
                <img alt="" className="profile-rating-grid__asset" src="/assets/ui/profile/deck-power.png" />
                <strong>{deckPower ?? ""}</strong>
                <small>Без рейтингу</small>
              </article>
              <article>
                <span>Дуелі</span>
                {duelRating !== undefined ? <LeagueBadge league={getLeagueByRating(duelRating)} size="sm" /> : <AppIcon name="duel" size={27} />}
                {duelRating !== undefined ? <><strong>{duelRating}</strong><small>Рейтинг дуелей</small></> : <small>Немає даних</small>}
              </article>
              <article>
                <span>Арена</span>
                <img alt="" className="profile-rating-grid__asset" src="/assets/ui/profile/arena-shield.png" />
                <small>Немає даних</small>
              </article>
              <article>
                <span>Турнір</span>
                <img alt="" className="profile-rating-grid__asset profile-rating-grid__asset--leather" src="/assets/ui/profile/profile-parchment.png" />
                <small>Немає даних</small>
              </article>
            </div>
          </section>

          <section className="profile-section">
            <ProfileSectionHeading>Використовуються бонуси</ProfileSectionHeading>
            {collectionBonuses.length ? (
              <>
                <div className="profile-bonus-list">
                  {collectionBonuses.map(({ bonusLabel, collectionId, collectionName }) => (
                    <article className="profile-bonus-row" key={collectionId}>
                      <AppIcon name="collection" size={22} />
                      <div>
                        <strong>{collectionName}</strong>
                        <span>{bonusLabel}</span>
                        <small>Активний постійно</small>
                      </div>
                    </article>
                  ))}
                </div>
                {additionalExperienceRewardPct > 0 ? (
                  <div className="profile-empty-row">
                    <img alt="" className="profile-xp-icon" src="/assets/ui/profile/xp.png" />
                    <span>Додатковий буст досвіду: +{additionalExperienceRewardPct}%</span>
                  </div>
                ) : null}
              </>
            ) : experienceRewardPct > 0 ? (
              <div className="profile-empty-row">
                <img alt="" className="profile-xp-icon" src="/assets/ui/profile/xp.png" />
                <span>Досвід у боях: +{experienceRewardPct}%</span>
              </div>
            ) : <div className="profile-empty-row"><AppIcon name="guild" size={22} /><span>Бонусів немає.</span></div>}
          </section>

          <section className="profile-section">
            <ProfileSectionHeading>Активність</ProfileSectionHeading>
            <dl className="profile-facts">
              <div><dt><img alt="" className="profile-xp-icon" src="/assets/ui/profile/xp.png" />Досвід до наступного рівня</dt><dd>{player.accountXpRequired === 0 ? "MAX" : `${player.accountXp ?? 0}/${player.accountXpRequired ?? 0}`}</dd></div>
            </dl>
          </section>

          <section className="profile-section profile-gifts">
            <ProfileSectionHeading>Подарунки</ProfileSectionHeading>
            <p>Подарунків немає.</p>
            <MenuRow compact disabled icon="battle-pass" metalTexture title="Усі подарунки" />
          </section>
        </>
      ) : null}
    </section>
  );
}
