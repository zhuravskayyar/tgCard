import { ScreenHeading } from "../components/ScreenHeading";
import { calculateEquipmentSummary, EQUIPMENT_ELEMENT_LABELS, STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import type { EquippedEquipment } from "@cardastika/shared";
import { getLeagueByRating, getPlayerDisplayName } from "@cardastika/shared";
import { AppIcon } from "../components/AppIcon";
import { ElementSymbol } from "../components/ElementSymbol";
import { EquipmentDoll } from "../components/EquipmentBook";
import { LeagueBadge } from "../components/LeagueBadge";
import { MenuRow } from "../components/MenuRow";
import { NicknameSkinPreview } from "../components/NicknameSkinPreview";
import { GuildMembershipRow } from "../components/GuildMembershipRow";
import { EQUIPMENT_ELEMENT_ORDER } from "../equipment/equipmentIcons";
import { usePlayerDeck } from "../hooks/usePlayerDeck";
import { formatUiNumber } from "../i18n";
import { ResourceIcon } from "../components/ResourceIcon";
import type { PlayerSummaryState } from "../types/player";

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
  const playedArena = Boolean(player && ((player.arenaWins ?? 0) > 0 || (player.arenaTop3Count ?? 0) > 0));
  const hasBonuses = collectionBonuses.length > 0 || additionalExperienceRewardPct > 0 || equipmentSummary.itemBonusTotal > 0;

  return (
    <section className="profile-screen pf-screen">
      <ScreenHeading title="ВАШ ПРОФІЛЬ" />

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
              {player.photoUrl ? <img alt={`Аватар ${displayName}`} src={player.photoUrl} /> : <span>{getInitials(displayName)}</span>}
            </span>
            <div className="pf-identity__copy">
              <NicknameSkinPreview nickname={displayName} skinId={player.equippedNicknameSkin} />
              <span className="pf-identity__level">Рівень {player.level}</span>
              <span aria-label={`Досвід ${xpPct}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={xpPct} className="pf-bar" role="progressbar"><span style={{ width: `${xpPct}%` }} /></span>
            </div>
            <div className="pf-identity__guild"><GuildMembershipRow level={player.level} onOpen={onOpenGuild} /></div>
          </section>

          <EquipmentDoll equipped={equipment} onSlot={() => onOpenEquipment()} />

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
                <strong>—</strong>
                <small>Не грав</small>
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
