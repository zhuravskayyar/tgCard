import { useEffect, useRef, useState, type ReactNode } from "react";
import { type GuildActivityType, type GuildAltarCurrency, type GuildAltarUpgradeResponse, type GuildJournalEntryView, type GuildProfileResponse } from "@cardastika/shared";
import { getUiNumberLocale } from "../../i18n";
import { AppIcon, type AppIconName } from "../../components/AppIcon";
import { CardHud } from "../../components/CardHud";
import { CardBack } from "../../components/CardBack";
import { CardFxWrapper } from "../../components/CardFxWrapper";
import { ExperienceFlask } from "../../components/ExperienceFlask";
import { MenuRow } from "../../components/MenuRow";
import { RibbonTitle } from "../../components/RibbonTitle";
import { formatNumber, GuildEmblem, guildErrorMessage } from "./GuildUi";
import { getGuildCardHubStatus, getGuildExperienceShare, getTreasuryWaitHours } from "./guildHubState";

interface GuildHubProps {
  profile: GuildProfileResponse;
  busy: boolean;
  onInfo: () => void;
  onCard: () => void;
  onMembers: () => void;
  onApplications: () => void;
  onDevelopment: () => void;
  onRaid: () => void;
  onDirectory: () => void;
  onForum: () => void;
  onTreasury: () => void;
  onJournal: () => void;
  onUpdateAnnouncement: (body: string) => Promise<boolean>;
}

export interface GuildPromoBannerProps {
  action?: ReactNode;
  children: ReactNode;
  icon: AppIconName;
  meta?: string;
  title: string;
}

export function GuildPromoBanner({ action, children, icon, meta, title }: GuildPromoBannerProps) {
  return <section className="guild-promo-banner" aria-label={title}>
    <div className="guild-promo-banner__heading">
      <span className="guild-promo-banner__art"><AppIcon name={icon} size={28} /></span>
      <div><span className="guild-kicker">Вісник гільдії</span><h3>{title}</h3>{meta ? <small>{meta}</small> : null}</div>
      {action}
    </div>
    {children}
  </section>;
}

const GUILD_ACTIVITY_LABELS: Readonly<Record<GuildActivityType, string>> = {
  duel_win: "перемога в дуелі",
  duel_loss: "поразка в дуелі",
  campaign_win: "перемога в кампанії",
  dungeon_complete: "завершення підземелля",
  arena_place_1: "1 місце на арені",
  arena_place_2: "2 місце на арені",
  arena_place_3: "3 місце на арені",
  arena_place_4_6: "місце на арені",
};

function formatJournalDetail(entry: GuildJournalEntryView) {
  switch (entry.type) {
    case "guild_created": return "Створив гільдію";
    case "member_joined": return "Приєднався до гільдії";
    case "member_left": return "Вийшов із гільдії";
    case "member_kicked": return "Виключив учасника";
    case "role_changed": return entry.detail === "Лідерство передано" ? "Передав лідерство" : entry.detail;
    case "application_accepted": return "Прийняв заявку";
    case "application_rejected": return "Відхилив заявку";
    case "announcement_updated": return entry.detail;
    case "treasury_contributed": return entry.detail;
    case "xp_contributed": {
      const activity = entry.activityType ? GUILD_ACTIVITY_LABELS[entry.activityType] : null;
      const amount = entry.amount === null ? "" : ` на ${formatNumber(entry.amount)} XP`;
      return `Поповнив спільний прогрес${amount}${activity ? ` · ${activity}` : ""}`;
    }
    default: return entry.detail;
  }
}

function formatJournalDate(value: string) {
  return new Date(value).toLocaleString(getUiNumberLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function GuildJournal({ profile }: { profile: GuildProfileResponse }) {
  const { journal } = profile.dashboard;
  return <section className="guild-journal" aria-labelledby="guild-journal-title">
    <RibbonTitle as="h3" id="guild-journal-title" leading={<AppIcon name="record" size={17} />} size="wide">ЛІТОПИС ГІЛЬДІЇ</RibbonTitle>
    {journal.length ? <div className="guild-journal__list">{journal.map((entry) => {
      const actor = entry.actorName ?? "Система";
      const target = entry.targetName && entry.targetName !== entry.actorName ? entry.targetName : null;
      const detail = formatJournalDetail(entry);
      const date = formatJournalDate(entry.createdAt);
      return <article aria-label={`${actor}${target ? ` → ${target}` : ""}: ${detail}. ${date}`} className={`guild-journal-entry guild-journal-entry--${entry.type}`} key={entry.id}>
        <span className={`guild-journal-entry__dot guild-journal-entry__dot--${entry.type}`} aria-hidden="true" />
        <div>
          <div className="guild-journal-entry__meta">
            <span className="guild-journal-entry__people"><strong>{actor}</strong>{target ? <span className="guild-journal-entry__target">→ {target}</span> : null}</span>
            <time dateTime={entry.createdAt}>{date}</time>
          </div>
          <p>{detail}</p>
        </div>
      </article>;
    })}</div> : <p className="guild-empty-copy">Перші події з’являться, щойно гільдія почне діяти.</p>}
  </section>;
}

function formatMissionDate(value: string) {
  return new Date(value).toLocaleDateString(getUiNumberLocale(), { day: "numeric", month: "short" });
}

const GUILD_ROW_ART = {
  treasury: "/assets/guild/guild-row-treasury.webp",
  raid: "/assets/guild/guild-row-event.webp",
  altar: "/assets/guild/guild-row-altar.webp",
  members: "/assets/guild/guild-row-members.webp",
  journal: "/assets/guild/guild-row-journal.webp",
  forum: "/assets/guild/guild-row-forum.webp",
  soon: "/assets/guild/guild-row-soon.webp",
} as const;
const ATTENTION_SEAL = "/assets/ui/trials/board/seal-v1.webp";
const GOLD_SEAL = "/assets/guild/guild-gold-seal.webp";
/** An announcement longer than this is folded to two lines on the hub. */
const ANNOUNCEMENT_FOLD_LENGTH = 90;

function GuildHubHeader({ guild, onInfo }: { guild: GuildProfileResponse["guild"]; onInfo: () => void }) {
  const share = getGuildExperienceShare(guild);
  return <button aria-label={`Про гільдію: рівень ${guild.level}, учасників ${guild.memberCount} з ${guild.memberCapacity}`} className="guild-hub-header" onClick={onInfo} type="button">
    <span className="guild-hub-header__emblem" aria-hidden="true"><GuildEmblem element={guild.themeElement} emblemId={guild.emblemId} /></span>
    <span className="guild-hub-header__body">
      <span className="guild-hub-header__facts"><strong>Рівень {guild.level}</strong><span>{guild.memberCount} / {guild.memberCapacity} учасників</span></span>
      <span className="flask-meter guild-hub-header__flask" aria-hidden="true"><ExperienceFlask progress={share} /></span>
      <small>{guild.nextLevelExperience === null ? "Максимальний рівень гільдії" : `Досвід ${formatNumber(guild.experience)} / ${formatNumber(guild.nextLevelExperience)}`}</small>
    </span>
    <span className="guild-hub-header__chevron" aria-hidden="true"><AppIcon name="chevron" size={16} /></span>
  </button>;
}

function GuildCardBlock({ guildCard, onCard }: { guildCard: GuildProfileResponse["guildCard"]; onCard: () => void }) {
  const active = guildCard.active;
  const status = getGuildCardHubStatus(guildCard);
  const label = active ? `Карта гільдії: ${active.displayName ?? active.code}, рівень ${active.level}, ${active.finalPower} сили` : guildCard.canManage ? "Карта гільдії: Обрати карту" : "Карта гільдії: Карту ще не обрано";
  return <button aria-label={label} className={`guild-hub-card${status?.readyToLevelUp ? " guild-hub-card--ready" : ""}`} onClick={onCard} type="button">
    <span className="guild-hub-card__visual" aria-hidden="true">
      {active ? <CardFxWrapper artKey={active.artKey} cardId={active.cardId} compact element={active.element} rarity={active.rarity}><CardHud element={active.element} level={active.level} power={active.finalPower} rarity={active.rarity} /></CardFxWrapper> : <CardBack className="guild-hub-card__empty" />}
    </span>
    <span className="guild-hub-card__body">
      <span className="guild-kicker">Карта гільдії</span>
      <strong>{active ? active.displayName ?? active.code : "Карту ще не обрано"}</strong>
      {status ? <>
        <span className="guild-hub-card__level">{status.atMaximum ? `Рівень ${status.level} · максимум` : `Рівень ${status.level} · прогрес ${Math.floor(status.percent)}%`}</span>
        <span className="flask-meter guild-hub-card__flask" aria-hidden="true"><ExperienceFlask progress={status.percent / 100} tone="verdant" /></span>
        {status.readyToLevelUp ? <span className="guild-hub-card__status guild-hub-card__status--ready"><img alt="" aria-hidden="true" src={ATTENTION_SEAL} />Можна підняти рівень</span> : null}
        {status.nextIsGold ? <span className="guild-hub-card__status guild-hub-card__status--gold"><img alt="" aria-hidden="true" src={GOLD_SEAL} />Рівень {status.targetLevel} — золотий: усім джерело магії</span> : null}
      </> : <span className="guild-hub-card__level">{guildCard.canManage ? "Оберіть карту зі своєї бойової колоди" : "Лідер ще не виставив карту"}</span>}
    </span>
  </button>;
}

/** A row status: short text, and the red seal when something waits for the viewer. */
function RowStatus({ text, attention = false }: { text?: string; attention?: boolean }) {
  return <span className="guild-row-status">{text ? <span className="menu-row__detail">{text}</span> : null}{attention ? <img alt="" aria-hidden="true" className="menu-row__seal" draggable={false} src={ATTENTION_SEAL} /> : null}</span>;
}

/** A number stamped on the red wax seal: things waiting for the viewer, such as applications. */
function CountSeal({ count }: { count: number }) {
  return <span className="guild-count-seal">{count > 99 ? "99+" : count}</span>;
}

export function GuildHub({ profile, busy, onInfo, onCard, onMembers, onApplications, onDevelopment, onRaid, onDirectory, onForum, onTreasury, onJournal, onUpdateAnnouncement }: GuildHubProps) {
  const { guild, dashboard } = profile;
  const managesApplications = profile.viewer.permissions.includes("manage_applications");
  const managesAnnouncement = profile.viewer.permissions.includes("manage_announcements");
  const [announcement, setAnnouncement] = useState(dashboard.announcement?.body ?? "");
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementExpanded, setAnnouncementExpanded] = useState(false);

  useEffect(() => { setAnnouncement(dashboard.announcement?.body ?? ""); setEditingAnnouncement(false); setAnnouncementExpanded(false); }, [dashboard.announcement?.body]);

  async function saveAnnouncement() {
    if (busy) return;
    if (await onUpdateAnnouncement(announcement)) setEditingAnnouncement(false);
  }

  const treasuryWait = getTreasuryWaitHours(profile.treasury.viewer);
  const treasuryHint = treasuryWait === 0 ? "Можна внести" : treasuryWait >= 24 ? `Внесок за ${Math.ceil(treasuryWait / 24)} дн.` : `Внесок за ${treasuryWait} год.`;
  const pendingApplications = profile.applications.length;
  const announcementBody = dashboard.announcement?.body ?? "";
  const announcementFolds = announcementBody.length > ANNOUNCEMENT_FOLD_LENGTH;

  return <div className="guild-hub">
    <GuildHubHeader guild={guild} onInfo={onInfo} />
    <GuildCardBlock guildCard={profile.guildCard} onCard={onCard} />

    {dashboard.announcement || managesAnnouncement ? <GuildPromoBanner action={managesAnnouncement ? <button className="guild-inline-button" onClick={() => setEditingAnnouncement((value) => !value)} type="button">{editingAnnouncement ? "Скасувати" : "Змінити"}</button> : null} icon="campaign" meta={dashboard.announcement ? `${dashboard.announcement.authorName} · ${formatMissionDate(dashboard.announcement.createdAt)}` : "Поки без оголошень"} title="Оголошення">
      {editingAnnouncement ? <form className="guild-form guild-announcement-form" onSubmit={(event) => { event.preventDefault(); void saveAnnouncement(); }}><textarea disabled={busy} maxLength={280} rows={3} value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Напиши короткий план або новину для гільдії…" /><div><small>{announcement.length} / 280</small><button className="guild-secondary-button" disabled={busy} type="submit">{busy ? "Зберігаємо…" : "Зберегти"}</button></div></form> : dashboard.announcement ? <>
        <p className={`guild-promo-banner__copy${announcementFolds && !announcementExpanded ? " guild-promo-banner__copy--folded" : ""}`}>{announcementBody}</p>
        {announcementFolds ? <button aria-expanded={announcementExpanded} className="guild-promo-banner__more" onClick={() => setAnnouncementExpanded((value) => !value)} type="button">{announcementExpanded ? "Згорнути" : "Читати далі"}</button> : null}
      </> : <p className="guild-empty-copy">Додай перше оголошення для учасників.</p>}
    </GuildPromoBanner> : null}

    <section className="guild-menu-section" aria-label="Щоденні справи гільдії">
      <div className="guild-menu-list">
        <MenuRow compact actionContent={<RowStatus attention={treasuryWait === 0} />} icon="inventory" subtitle={treasuryHint} iconSrc={GUILD_ROW_ART.treasury} metalTexture disabled={busy} onClick={onTreasury} title="Казна" />
        <MenuRow compact icon="campaign" subtitle="Битви з відьмами" iconSrc={GUILD_ROW_ART.raid} metalTexture disabled={busy} onClick={onRaid} title="Івент гільдії" />
        <MenuRow compact detail={`Рів. ${formatNumber(profile.altar.currentLevel)}`} icon="guild" iconSrc={GUILD_ROW_ART.altar} subtitle="Бонуси гільдії" metalTexture disabled={busy} onClick={onDevelopment} title="Алтар гільдії" />
      </div>
    </section>

    <section className="guild-menu-section guild-menu-section--lower" aria-label="Життя гільдії">
      <div className="guild-menu-list">
        <MenuRow compact detail={`${guild.memberCount} / ${guild.memberCapacity}`} icon="profile" iconSrc={GUILD_ROW_ART.members} subtitle="Учасники і ролі" metalTexture disabled={busy} onClick={onMembers} title="Склад" />
        {managesApplications ? <MenuRow compact actionContent={pendingApplications ? <CountSeal count={pendingApplications} /> : <RowStatus text="Немає" />} icon="mail" subtitle="Гравці хочуть вступити" metalTexture disabled={busy} onClick={onApplications} title="Заявки" /> : null}
        <MenuRow compact icon="record" iconSrc={GUILD_ROW_ART.journal} subtitle="Усі події гільдії" metalTexture disabled={busy} onClick={onJournal} title="Літопис" />
        <MenuRow compact icon="collection" iconSrc={GUILD_ROW_ART.forum} subtitle="Обговорення" metalTexture disabled={busy} onClick={onForum} title="Форум гільдії" />
        <MenuRow compact icon="ranking" iconSrc="/assets/ui/home/sprites/row-ranking.webp" subtitle="Рейтинг усіх гільдій" metalTexture disabled={busy} onClick={onDirectory} title="Найкращі гільдії" />
      </div>
    </section>

    <section className="guild-menu-section guild-menu-section--soon" aria-label="Скоро в гільдії">
      <div className="guild-menu-list">
        <MenuRow compact icon="tournament" iconSrc={GUILD_ROW_ART.soon} subtitle="Війни, арена, чати" locked metalTexture disabled title="Скоро в гільдії" />
      </div>
    </section>
  </div>;
}

const GUILD_ALTAR_ASSETS: Record<GuildAltarCurrency, { asset: string; tone: string }> = {
  gold: { asset: "/assets/guild/guild-altar-potion-purple.png", tone: "purple" },
  silver: { asset: "/assets/guild/guild-altar-potion-green.png", tone: "green" },
};

export function GuildDevelopment({ profile, busy, onPurchaseAltar, onMembers, onForum, onDirectory, onRaid }: { profile: GuildProfileResponse; busy: boolean; onPurchaseAltar: (currency: GuildAltarCurrency) => Promise<GuildAltarUpgradeResponse>; onMembers: () => void; onForum: () => void; onDirectory: () => void; onRaid: () => void }) {
  const { guild } = profile;
  const [altar, setAltar] = useState(profile.altar);
  const [altarNotice, setAltarNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [purchasing, setPurchasing] = useState<GuildAltarCurrency | null>(null);
  const purchasingRef = useRef(false);

  useEffect(() => { setAltar(profile.altar); }, [profile.altar]);

  async function purchase(currency: GuildAltarCurrency) {
    if (busy || purchasingRef.current || !profile.viewer.member) return;
    purchasingRef.current = true;
    setPurchasing(currency);
    setAltarNotice(null);
    try {
      const result = await onPurchaseAltar(currency);
      setAltar(result.altar);
      setAltarNotice({ error: false, text: `Алтар підсилено: ${result.previousLevel} → ${result.newLevel} (+${result.totalIncrease} рів.)` });
    } catch (error) {
      setAltarNotice({ error: true, text: guildErrorMessage(error) });
    } finally {
      purchasingRef.current = false;
      setPurchasing(null);
    }
  }

  return <section className="guild-development guild-altar" aria-labelledby="guild-altar-title">
    <RibbonTitle as="h3" id="guild-altar-title" leading={<AppIcon name="guild" size={17} />} size="wide">АЛТАР · РІВЕНЬ {formatNumber(altar.currentLevel)}</RibbonTitle>
    <p className="guild-altar__intro">Підсилення Алтаря купуються за ресурси гравця та діють одразу.</p>
    <div className="guild-altar__activation"><strong>Підсилення активується одразу</strong><p>Завершена колекція «Відьми» додає +2 рівні лише до золотого підсилення.</p></div>
    {altarNotice ? <p className={`guild-altar__status${altarNotice.error ? " guild-altar__status--error" : " action-feedback action-feedback--success"}`} role={altarNotice.error ? "alert" : "status"}>{altarNotice.text}</p> : null}
    <div className="guild-altar__upgrades" aria-label="Підсилення алтаря">
      {altar.upgrades.map((item) => {
        const asset = GUILD_ALTAR_ASSETS[item.currency];
        return <article className={`guild-altar-upgrade guild-altar-upgrade--${asset.tone}`} key={item.currency}>
          <span className="guild-altar-upgrade__art"><img alt="" src={asset.asset} /></span>
          <div className="guild-altar-upgrade__body"><div className="guild-altar-upgrade__heading"><h4>{item.name}</h4><small><AppIcon name={item.currency} size={13} /> {formatNumber(item.price)}</small></div><p>+{item.totalIncrease} рів. {item.currency === "gold" ? "за золото" : "за срібло"}{item.collectionBonus ? ` · Відьми +${item.collectionBonus}` : ""}</p><button className="guild-altar__buy" disabled={busy || purchasing !== null || !item.canAfford || !profile.viewer.member} onClick={() => { void purchase(item.currency); }} type="button">{purchasing === item.currency ? "Підсилюємо…" : item.canAfford ? "Придбати" : "Недостатньо ресурсу"}</button></div>
        </article>;
      })}
    </div>
    <p className="guild-altar__note">Карти колекції «Відьми» можна отримати лише в івентах гільдії.</p>
    <div className="guild-altar__menu guild-menu-list" aria-label="Розділи алтаря"><MenuRow compact icon="campaign" metalTexture onClick={onRaid} title="Битви з відьмами" /><MenuRow compact detail={`${guild.memberCount} / ${guild.memberCapacity}`} icon="profile" metalTexture onClick={onMembers} title="Склад" /><MenuRow compact icon="collection" metalTexture onClick={onForum} title="Форум гільдії" /><MenuRow compact icon="ranking" metalTexture onClick={onDirectory} title="Найкращі гільдії" /></div>
  </section>;
}
