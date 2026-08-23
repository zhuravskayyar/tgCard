import { AppIcon, type AppIconName } from "../components/AppIcon";
import { MenuRow } from "../components/MenuRow";
import { usePlayerDeck, type PlayerDeckState } from "../hooks/usePlayerDeck";
import type { PlayerSummaryState } from "../types/player";

interface ProfileScreenProps {
  onOpenDeck: () => void;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
}

interface ProfileSectionHeadingProps {
  children: string;
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
  onOpenDeck,
  onRetryPlayerSummary,
  playerSummaryState,
}: ProfileScreenProps) {
  const { retry: retryDeck, state: deckState } = usePlayerDeck();
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const displayName = player?.username ?? player?.firstName ?? "Гравець";
  const deckPower = getDeckPower(deckState);

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
            <div className="profile-showcase__top">
              <div className="profile-showcase__player">
                <div className="profile-showcase__portrait">
                  {player.photoUrl ? <img alt={`Аватар ${displayName}`} src={player.photoUrl} /> : <span>{getInitials(displayName)}</span>}
                </div>
                <strong>{displayName}</strong>
                <span>Рівень {player.level}</span>
              </div>
              <div className="profile-showcase__mark" aria-hidden="true">
                <AppIcon name="profile" size={34} />
              </div>
              <div className="profile-showcase__crest">
                <AppIcon name="guild" size={38} />
                <span>—</span>
              </div>
            </div>

            <div className="profile-equipment" aria-label="Спорядження ще недоступне">
              <div className="profile-equipment__slots" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => <span key={`left-${index}`} />)}
              </div>
              <div className="profile-equipment__figure">
                <AppIcon name="profile" size={82} />
                <span>Спорядження ще недоступне</span>
              </div>
              <div className="profile-equipment__slots" aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => (
                  <span className={index === 2 ? "profile-equipment__locked" : undefined} key={`right-${index}`}>
                    {index === 2 ? <AppIcon name="lock" size={22} /> : null}
                  </span>
                ))}
              </div>
            </div>

            <div className="profile-showcase__power">
              <span>Сила колоди</span>
              <strong>{deckPower ?? "—"}</strong>
              {deckState.status === "error" ? <button onClick={retryDeck} type="button">Повторити</button> : null}
            </div>
          </section>

          <section className="profile-menu" aria-label="Розділи профілю">
            <MenuRow compact disabled icon="mail" title="Моя пошта" />
            <MenuRow active={deckState.status === "ready"} compact icon="deck" onClick={onOpenDeck} title="Бойова колода" />
            <MenuRow compact disabled icon="inventory" title="Спорядження" />
            <MenuRow compact disabled icon="ranking" title="Рекорди" />
          </section>

          <section className="profile-record-grid" aria-label="Відзнаки гравця">
            {emptyRecords.map((record) => (
              <article key={record.label}>
                <span>{record.label}</span>
                <AppIcon name={record.icon} size={31} />
                <strong>—</strong>
                <small>Немає даних</small>
              </article>
            ))}
          </section>

          <section className="profile-section" aria-label="Рейтинги гравця">
            <ProfileSectionHeading>Рейтинги</ProfileSectionHeading>
            <div className="profile-rating-grid">
              <article>
                <span>Колода</span>
                <AppIcon name="deck" size={27} />
                <strong>{deckPower ?? "—"}</strong>
                <small>Без рейтингу</small>
              </article>
              <article>
                <span>Дуелі</span>
                <AppIcon name="duel" size={27} />
                <strong>—</strong>
                <small>Немає даних</small>
              </article>
              <article>
                <span>Арена</span>
                <AppIcon name="arena" size={27} />
                <strong>—</strong>
                <small>Немає даних</small>
              </article>
              <article>
                <span>Турнір</span>
                <AppIcon name="tournament" size={27} />
                <strong>—</strong>
                <small>Немає даних</small>
              </article>
            </div>
          </section>

          <section className="profile-section">
            <ProfileSectionHeading>Використовуються бонуси</ProfileSectionHeading>
            <div className="profile-empty-row">
              <AppIcon name="guild" size={22} />
              <span>Бонусів немає.</span>
            </div>
          </section>

          <section className="profile-section">
            <ProfileSectionHeading>Активність</ProfileSectionHeading>
            <dl className="profile-facts">
              <div><dt>Досвід до наступного рівня</dt><dd>—</dd></div>
              <div><dt>Днів у грі</dt><dd>—</dd></div>
            </dl>
          </section>

          <section className="profile-section profile-gifts">
            <ProfileSectionHeading>Подарунки</ProfileSectionHeading>
            <p>Подарунків немає.</p>
            <MenuRow compact disabled icon="battle-pass" title="Усі подарунки" />
          </section>
        </>
      ) : null}
    </section>
  );
}
