import { useEffect, useState } from "react";
import { ExperienceFlask } from "../components/ExperienceFlask";
import { ScreenHeading } from "../components/ScreenHeading";
import { calculateEquipmentSummary, EQUIPMENT_ELEMENT_LABELS, getDominantDeckElement, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import type { EquippedEquipment, TournamentAwardsView } from "@cardastika/shared";
import { getLeagueByRating, getPlayerDisplayName } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { AvatarImage } from "../components/AvatarImage";
import { ElementSymbol } from "../components/ElementSymbol";
import { EquipmentDoll } from "../components/EquipmentBook";
import { LeagueBadge } from "../components/LeagueBadge";
import { MenuRow } from "../components/MenuRow";
import { NicknameSkinPreview } from "../components/NicknameSkinPreview";
import { GuildMembershipRow } from "../components/GuildMembershipRow";
import { EQUIPMENT_ELEMENT_ORDER } from "../equipment/equipmentIcons";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { formatUiNumber, getUiLocale, translateUi } from "../i18n";
import { ResourceIcon } from "../components/ResourceIcon";
import type { PlayerSummaryState } from "../types/player";
import { getTelegramInitData } from "../telegram";
import { loadTournamentAwards } from "../telegram/tournament";

interface ProfileScreenProps {
  equipment: EquippedEquipment;
  onOpenDeck: () => void;
  onOpenEquipment: () => void;
  onOpenGuild: () => void;
  onOpenInventory: () => void;
  onOpenMail: () => void;
  onOpenLeagues: () => void;
  onRetryPlayerSummary: () => void;
  playerSummaryState: PlayerSummaryState;
  hasUnreadMail: boolean;
}

const HONORS = [
  { image: "/assets/ui/profile/title-orb.png", label: "Найкращий титул" },
  { image: "/assets/ui/profile/dragon-medal.png", label: "Медаль дракона" },
  { image: "/assets/ui/profile/achievement-orb.png", label: "Найкраще досягнення" },
];

const TOURNAMENT_BADGE_LABELS: Record<TournamentAwardsView["awards"][number]["badge"], string> = {
  cup_1: "Кубок за 1 місце",
  cup_2: "Кубок за 2 місце",
  cup_3: "Кубок за 3 місце",
  cup_4: "Кубок за 4 місце",
  quarterfinal: "Медаль за 1/4 фіналу",
  eighthfinal: "Медаль за 1/8 фіналу",
  participant: "Медаль учасника",
};

const TOURNAMENT_LEAGUE_LABELS: Record<TournamentAwardsView["awards"][number]["league"], string> = {
  conqueror: "Ліга Підкорювачів",
  champion: "Ліга Чемпіонів",
  master: "Ліга Майстрів",
  ruler: "Ліга Володарів",
};

function TournamentAwardsCabinet({ data, onRetry, status }: { data: TournamentAwardsView | null; onRetry: () => void; status: "loading" | "error" | "ready" }) {
  const locale = getUiLocale();
  if (status === "loading") return <p className="pf-empty" role="status">{translateUi("Завантажуємо нагороди турніру…", locale)}</p>;
  if (status === "error" || !data) return <div className="pf-retry"><p className="pf-empty" role="alert">{translateUi("Нагороди турніру тимчасово недоступні.", locale)}</p><button className="eq-button eq-button--parchment" onClick={onRetry} type="button">{translateUi("Повторити", locale)}</button></div>;
  if (data.awards.length === 0) return <p className="pf-empty" role="status">{translateUi("Нагород турніру поки немає.", locale)}</p>;

  return <>
    <p className="pf-sr-only" role="status">{translateUi("Нагороди турніру завантажено.", locale)}</p>
    <div aria-label={translateUi("Кубки й медалі", locale)} className="pf-tournament-awards" role="list">
      {data.awards.map(({ badge, count, league }) => {
        const badgeLabel = translateUi(TOURNAMENT_BADGE_LABELS[badge], locale);
        const leagueLabel = translateUi(TOURNAMENT_LEAGUE_LABELS[league], locale);
        const image = badge === "participant" ? "participant.png" : `${league}-${badge}.png`;
        return <article aria-label={`${leagueLabel}: ${badgeLabel}, ${formatUiNumber(count)}`} key={`${league}-${badge}`} role="listitem">
          <img alt="" src={`/assets/ui/tournament/awards/${image}`} />
          <span>{badgeLabel}</span>
          <small>{leagueLabel}</small>
          <strong>×{formatUiNumber(count)}</strong>
        </article>;
      })}
    </div>
  </>;
}

function winsLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${formatUiNumber(count)} перемога`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${formatUiNumber(count)} перемоги`;
  return `${formatUiNumber(count)} перемог`;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section aria-label={title} className="pf-section">
      <h2>{title}</h2>
      <div className="eq-plate pf-plate">{children}</div>
    </section>
  );
}

export function ProfileScreen({
  equipment,
  onOpenDeck,
  onOpenEquipment,
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
  const deckPower = deckState.status === "ready" ? deckState.deck.totalPower : null;
  // The mage takes the element the deck leans on; fire until the deck is known.
  const mageElement = deckState.status === "ready" ? getDominantDeckElement(deckState.deck.cards) ?? "fire" : "fire";
  const experienceRewardPct = player?.experienceRewardPct ?? 0;
  const collectionBonuses = player?.collectionBonuses ?? [];
  const collectionExperienceRewardPct = collectionBonuses.reduce(
    (total, { bonus }) => total + (bonus.type === "experience_reward_pct" ? bonus.value : 0),
    0,
  );
  const additionalExperienceRewardPct = Math.max(0, experienceRewardPct - collectionExperienceRewardPct);
  const equippedDefinitions = STARTER_EQUIPMENT_DEFINITIONS.filter(({ id, slot }) => equipment[slot] === id);
  const equipmentSummary = calculateEquipmentSummary(equippedDefinitions);
  const xp = player?.accountXp ?? 0;
  const xpRequired = player?.accountXpRequired ?? 0;
  const xpPct = xpRequired > 0 ? Math.min(100, Math.floor((xp / xpRequired) * 100)) : 0;
  const [tournament, setTournament] = useState<TournamentAwardsView | null>(null);
  const [tournamentStatus, setTournamentStatus] = useState<"loading" | "error" | "ready">("loading");
  const [tournamentAttempt, setTournamentAttempt] = useState(0);
  useEffect(() => {
    const initData = getTelegramInitData();
    if (!initData) { setTournamentStatus("error"); return; }
    const controller = new AbortController();
    void loadTournamentAwards(initData, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setTournament(data);
      setTournamentStatus("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setTournamentStatus("error");
    });
    return () => controller.abort();
  }, [tournamentAttempt]);
  const playedTournament = Boolean(tournament && tournament.played > 0);
  const tournamentSummary = tournamentStatus === "error"
    ? translateUi("Дані недоступні", getUiLocale())
    : tournamentStatus === "loading"
      ? translateUi("Завантаження…", getUiLocale())
      : playedTournament ? `Кубків: ${formatUiNumber(tournament!.cups)} · медалей: ${formatUiNumber(tournament!.medals)}` : "Не грав";
  const playedArena = Boolean(player && ((player.arenaWins ?? 0) > 0 || (player.arenaTop3Count ?? 0) > 0));
  const hasBonuses = collectionBonuses.length > 0 || additionalExperienceRewardPct > 0 || equipmentSummary.itemBonusTotal > 0;

  return (
    <section className="profile-screen pf-screen">
      <ScreenHeading title="Ваш профіль" />

      {playerSummaryState.status === "loading" ? <p className="eq-note" aria-live="polite">Завантаження профілю…</p> : null}
      {playerSummaryState.status === "unavailable" ? <p className="eq-note">Профіль доступний після входу в гру.</p> : null}
      {playerSummaryState.status === "error" ? (
        <div className="pf-retry">
          <p className="eq-note">Не вдалося завантажити профіль.</p>
          <button className="eq-button eq-button--parchment" onClick={onRetryPlayerSummary} type="button">Повторити</button>
        </div>
      ) : null}

      {player ? (
        <>
          <section aria-label="Гравець" className="eq-plate pf-identity">
            <span className="eq-frame pf-portrait">
              <AvatarImage alt={`Аватар ${displayName}`} name={displayName} photoUrl={player.photoUrl} seed={player.id} />
            </span>
            <div className="pf-identity__copy">
              <NicknameSkinPreview nickname={displayName} skinId={player.equippedNicknameSkin} />
              <span className="pf-identity__level">Рівень {player.level}</span>
              <span aria-label={`Досвід ${xpPct}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={xpPct} className="flask-meter pf-flask" role="progressbar"><ExperienceFlask progress={xpPct / 100} /></span>
            </div>
            <div className="pf-identity__guild"><GuildMembershipRow level={player.level} onOpen={onOpenGuild} /></div>
          </section>

          <EquipmentDoll equipped={equipment} mageElement={mageElement} onSlot={() => onOpenEquipment()} />

          <div className="pf-power">
            <span>Сила колоди</span>
            <strong>{deckPower === null ? "—" : deckPower.toLocaleString("uk-UA")}</strong>
          </div>
          {deckState.status === "error" ? <button className="eq-button eq-button--parchment" onClick={retryDeck} type="button">Повторити</button> : null}

          <nav aria-label="Розділи профілю" className="pf-menu">
            <MenuRow attention={hasUnreadMail} badge={hasUnreadMail ? "Нове" : undefined} compact icon="mail" metalTexture onClick={onOpenMail} title="Моя пошта" />
            <MenuRow active={deckState.status === "ready"} compact icon="deck" metalTexture onClick={onOpenDeck} title="Бойова колода" />
            <MenuRow compact icon="equipment" metalTexture onClick={onOpenEquipment} title="Спорядження" />
            <MenuRow compact icon="inventory" metalTexture onClick={onOpenInventory} title="Інвентар" />
            <MenuRow compact icon="record" metalTexture onClick={onOpenLeagues} title="Рейтинг магів" />
          </nav>

          <Section title="Відзнаки">
            <div className="pf-grid pf-grid--honors">
              {HONORS.map((honor) => (
                <article key={honor.label}>
                  <span className="pf-grid__title">{honor.label}</span>
                  <img alt="" className="pf-grid__icon" src={honor.image} />
                  <small>Немає</small>
                </article>
              ))}
            </div>
          </Section>

          <Section title="Кубки й медалі">
            <TournamentAwardsCabinet data={tournament} onRetry={() => { setTournamentStatus("loading"); setTournamentAttempt(value => value + 1); }} status={tournamentStatus} />
          </Section>

          <Section title="Рейтинги">
            <div className="pf-grid">
              <article>
                <span className="pf-grid__title">Колода</span>
                <img alt="" className="pf-grid__icon" src="/assets/ui/profile/deck-power.png" />
                <strong>{deckPower === null ? "—" : deckPower.toLocaleString("uk-UA")}</strong>
                <small>Сила</small>
              </article>
              <article>
                <span className="pf-grid__title">Дуелі</span>
                <span className="pf-grid__icon"><LeagueBadge league={getLeagueByRating(player.duelRating ?? 0)} size="sm" /></span>
                <strong>{formatUiNumber(player.duelRating ?? 0)}</strong>
                <small>{winsLabel(player.duelWins ?? 0)}</small>
              </article>
              <article>
                <span className="pf-grid__title">Арена</span>
                <img alt="" className="pf-grid__icon" src="/assets/ui/profile/arena-shield.png" />
                <strong>{playedArena ? formatUiNumber(player.arenaRating ?? 0) : "—"}</strong>
                <small>{playedArena ? winsLabel(player.arenaWins ?? 0) : "Не грав"}</small>
              </article>
              <article>
                <span className="pf-grid__title">Турнір</span>
                <img alt="" className="pf-grid__icon" src="/assets/ui/profile/tournament-trophy.png" />
                <strong>{playedTournament && tournament?.rating !== null ? formatUiNumber(tournament!.rating!) : "—"}</strong>
                <small>{tournamentSummary}</small>
              </article>
            </div>
          </Section>

          <Section title="Бонуси">
            {equipmentSummary.itemBonusTotal > 0 ? (
              <div className="pf-elements">
                {EQUIPMENT_ELEMENT_ORDER.map((element) => (
                  <span aria-label={`${EQUIPMENT_ELEMENT_LABELS[element]}: +${equipmentSummary.elementBonuses[element]}`} key={element}><ElementSymbol element={element} size={18} /><b>+{equipmentSummary.elementBonuses[element]}</b></span>
                ))}
              </div>
            ) : null}
            {collectionBonuses.map(({ bonusLabel, collectionId, collectionName }) => (
              <div className="pf-row" key={collectionId}><AppIcon name="collection" size={20} /><span><b>{collectionName}</b> {bonusLabel}</span></div>
            ))}
            {additionalExperienceRewardPct > 0 ? <div className="pf-row"><ResourceIcon className="profile-xp-icon" kind="xp" size={20} /><span>Досвід у боях: +{additionalExperienceRewardPct}%</span></div> : null}
            {!hasBonuses ? <p className="pf-empty">Бонусів немає.</p> : null}
          </Section>

          <Section title="Активність">
            <dl className="pf-facts">
              <div><dt>Досвід до {player.level + 1} рівня</dt><dd>{xp.toLocaleString("uk-UA")} / {xpRequired.toLocaleString("uk-UA")}</dd></div>
              {player.daysInGame !== undefined ? <div><dt>Днів у грі</dt><dd>{player.daysInGame}</dd></div> : null}
              <div><dt>Перемог у дуелях</dt><dd>{formatUiNumber(player.duelWins ?? 0)}</dd></div>
              <div><dt>Перемог на арені</dt><dd>{formatUiNumber(player.arenaWins ?? 0)}</dd></div>
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
