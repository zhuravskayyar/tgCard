import { useEffect, useState, type ReactNode } from "react";
import { GUILD_CONFIG, type GuildAltarCurrency, type GuildAltarUpgradeResponse, type GuildProfileResponse, type PlayerCardInstance } from "@cardastika/shared";
import { AppIcon, type AppIconName } from "../../components/AppIcon";
import { CardHud } from "../../components/CardHud";
import { CardFxWrapper } from "../../components/CardFxWrapper";
import { DeckCard } from "../../components/DeckCard";
import { MenuRow } from "../../components/MenuRow";
import { formatNumber, guildErrorMessage, type AsyncState } from "./GuildUi";

interface GuildHubProps {
  profile: GuildProfileResponse;
  busy: boolean;
  onInfo: () => void;
  onMembers: () => void;
  onApplications: () => void;
  onDevelopment: () => void;
  onRaid: () => void;
  onDirectory: () => void;
  onForum: () => void;
  onTreasury: () => void;
  onJournal: () => void;
  onAnnouncements: () => void;
  onUpdateAnnouncement: (body: string) => void;
  guildCardCandidates: AsyncState<PlayerCardInstance[]>;
  onLoadGuildCardCandidates: () => void;
  onSetGuildCard: (instanceId: string) => void;
}

interface GuildModeTileProps {
  detail: string;
  disabled?: boolean;
  asset: GuildAssetName;
  label: string;
  name?: string;
  onClick?: () => void;
}

type GuildAssetName = "main" | "altar" | "war" | "arena" | "raid";
type GuildFeatureKey = "war" | "arena" | "raid";

const GUILD_ASSET_SOURCES: Record<GuildAssetName, string> = {
  main: "/assets/guild/guild-main.svg",
  altar: "/assets/guild/guild-altar-sprite-1.png",
  war: "/assets/guild/guild-war-art.png",
  arena: "/assets/guild/guild-arena-art.png",
  raid: "/assets/guild/guild-raid-art.png",
};

const GUILD_FEATURE_MESSAGES: Record<GuildFeatureKey, { title: string; body: string }> = {
  war: { title: "Війни гільдій", body: "Війни гільдій — незабаром. Підготовлений розділ з’явиться після запуску бойового режиму." },
  arena: { title: "Арена гільдій", body: "Арена гільдій — незабаром. Поки що цей режим не підключений до бойового сервера." },
  raid: { title: "Рейди гільдії", body: "Рейди гільдії — незабаром. Підземелля для спільних походів ще готується." },
};

export interface GuildPromoBannerProps {
  action?: ReactNode;
  children: ReactNode;
  icon: AppIconName;
  meta?: string;
  title: string;
}

function GuildCardPlatform({ active, canManage, candidates, busy, onLoadCandidates, onSetGuildCard }: { active: PlayerCardInstance | null; canManage: boolean; candidates: AsyncState<PlayerCardInstance[]>; busy: boolean; onLoadCandidates: () => void; onSetGuildCard: (instanceId: string) => void }) {
  const [panel, setPanel] = useState<"details" | "selection" | null>(null);
  const [pending, setPending] = useState<PlayerCardInstance | null>(null);

  function openPlatform() {
    if (active) {
      setPanel("details");
      return;
    }
    setPanel(canManage ? "selection" : "details");
    if (canManage) onLoadCandidates();
  }

  function openSelection() {
    setPending(null);
    setPanel("selection");
    onLoadCandidates();
  }

  return <>
    <button aria-label={active ? `Карта гільдії: ${active.displayName ?? active.code}, ${active.finalPower} сили` : canManage ? "Карта гільдії: Обрати карту" : "Карта гільдії: Карту ще не обрано"} aria-pressed={panel !== null} className="guild-card-platform" onClick={openPlatform} type="button">
      <span className="guild-card-platform__art" aria-hidden="true"><img alt="" src="/assets/guild/guild-reward.svg" /></span>
      <span className="guild-card-platform__visual" aria-hidden="true">
        {active ? <span className="guild-card-platform__card"><CardFxWrapper artKey={active.artKey} cardId={active.cardId} compact element={active.element} rarity={active.rarity}><CardHud element={active.element} level={active.level} power={active.finalPower} rarity={active.rarity} /></CardFxWrapper></span> : <span className="guild-card-platform__pedestal"><span>+</span></span>}
      </span>
      {active ? <small className="guild-card-platform__level">Рів. {active.level}</small> : <><strong>Карта гільдії</strong><small>{canManage ? "Обрати карту" : "Карту ще не обрано"}</small></>}
      <span className="guild-card-platform__chance">15% у бою</span>
    </button>
    {panel ? <section className="guild-card-sheet" aria-label="Карта гільдії">
      <div className="guild-card-sheet__header"><div><span className="guild-kicker">Карта гільдії</span><h3>{active ? active.displayName ?? active.code : "Карта не обрана"}</h3></div><button className="guild-inline-button" onClick={() => { setPanel(null); setPending(null); }} type="button">Закрити</button></div>
      {panel === "selection" && canManage ? <>
        <p className="guild-card-sheet__copy">Лідер обирає одну карту зі своєї колекції. Вона не додається до колоди й не займає окремий слот.</p>
        {candidates.status === "loading" ? <p className="guild-empty-copy">Завантаження колекції…</p> : candidates.status === "error" ? <div className="guild-card-sheet__state"><p className="guild-empty-copy">{candidates.message}</p><button className="guild-secondary-button" onClick={onLoadCandidates} type="button">Повторити</button></div> : candidates.data.length === 0 ? <p className="guild-empty-copy">У лідера ще немає карт.</p> : <>
          <div className="guild-card-selection" aria-label="Карти лідера">{candidates.data.map((card) => <DeckCard key={card.instanceId} card={card} selected={card.instanceId === active?.instanceId} showLevel onClick={() => setPending(card)} />)}</div>
          {pending ? <div className="guild-card-confirmation"><p>Встановити «{pending.displayName ?? pending.code}» як карту гільдії?</p><div><button className="guild-primary-button" disabled={busy} onClick={() => { onSetGuildCard(pending.instanceId); setPending(null); setPanel("details"); }} type="button">Підтвердити</button><button className="guild-secondary-button" disabled={busy} onClick={() => setPending(null)} type="button">Скасувати</button></div></div> : <p className="guild-helper">Натисніть на карту, щоб підготувати вибір.</p>}
        </>}
      </> : <>
        {active ? <div className="guild-card-sheet__active"><span className="guild-card-sheet__active-card"><CardFxWrapper artKey={active.artKey} cardId={active.cardId} element={active.element} rarity={active.rarity}><CardHud element={active.element} level={active.level} power={active.finalPower} rarity={active.rarity} showLevel /></CardFxWrapper></span><dl><div><dt>Сила</dt><dd>{active.finalPower}</dd></div><div><dt>Елемент</dt><dd>{active.element}</dd></div><div><dt>Рідкість</dt><dd>{active.rarity}</dd></div></dl></div> : <p className="guild-empty-copy">Карту ще не обрано. Вона з’являтиметься в бою тільки після вибору лідера.</p>}
        <p className="guild-card-sheet__copy">Шанс появи під час нового ходу або добору — 15%. Карта працює лише в Duel та Arena й використовує свої звичайні силу, елемент і рідкість.</p>
        {canManage ? <button className="guild-secondary-button" disabled={busy} onClick={openSelection} type="button">{active ? "Змінити карту" : "Обрати карту"}</button> : null}
      </>}
    </section> : null}
  </>;
}

function GuildModeTile({ asset, detail, disabled = false, label, name, onClick }: GuildModeTileProps) {
  const content = <>
    <span className="guild-mode-tile__art"><img alt="" aria-hidden="true" className={`guild-mode-tile__asset guild-mode-tile__asset--${asset}`} src={GUILD_ASSET_SOURCES[asset]} /></span>
    <strong>{label}</strong>
    <small>{name ?? detail}</small>
    {name ? <small>{detail}</small> : null}
  </>;
  const className = `guild-mode-tile guild-mode-tile--${asset}${disabled ? " guild-mode-tile--disabled" : ""}`;
  const ariaLabel = name ? `${label}: ${name}, ${detail}` : `${label}: ${detail}`;

  if (onClick) {
    return <button aria-label={ariaLabel} className={className} data-coming-soon={disabled || undefined} onClick={onClick} type="button">{content}</button>;
  }
  return <div aria-label={ariaLabel} className={className} role="group">{content}</div>;
}

function GuildFeatureNotice({ feature, onClose }: { feature: GuildFeatureKey; onClose: () => void }) {
  const unavailable = GUILD_FEATURE_MESSAGES[feature];
  return <section className="guild-feature-notice" aria-label={unavailable.title}>
    <div className="guild-feature-notice__header"><div><span className="guild-kicker">Розділ гільдії</span><h3>{unavailable.title}</h3></div><button className="guild-inline-button" onClick={onClose} type="button">Закрити</button></div>
    <p className="guild-feature-notice__copy">{unavailable.body}</p>
  </section>;
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

function formatJournal(detail: string, actorName: string | null, targetName: string | null) {
  if (actorName && targetName && actorName !== targetName) return `${actorName} · ${detail} · ${targetName}`;
  return actorName ? `${actorName} · ${detail}` : detail;
}

export function GuildJournal({ profile }: { profile: GuildProfileResponse }) {
  const { journal } = profile.dashboard;
  return <section className="guild-journal" aria-labelledby="guild-journal-title">
    <div className="guild-section-bar"><AppIcon name="record" size={17} /><h3 id="guild-journal-title">Літопис гільдії</h3><span>{journal.length} подій</span></div>
    {journal.length ? <div className="guild-journal__list">{journal.map((entry) => <article className="guild-journal-entry" key={entry.id}><span className={`guild-journal-entry__dot guild-journal-entry__dot--${entry.type}`} /><div><strong>{formatJournal(entry.detail, entry.actorName, entry.targetName)}</strong><small>{new Date(entry.createdAt).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{entry.amount ? ` · +${formatNumber(entry.amount)} XP` : ""}</small></div></article>)}</div> : <p className="guild-empty-copy">Перші події з’являться, щойно гільдія почне діяти.</p>}
  </section>;
}

export function GuildAnnouncements({ profile, busy, onUpdateAnnouncement }: { profile: GuildProfileResponse; busy: boolean; onUpdateAnnouncement: (body: string) => void }) {
  const announcement = profile.dashboard.announcement;
  const canEdit = profile.viewer.permissions.includes("manage_announcements");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [editing, setEditing] = useState(!announcement && canEdit);

  useEffect(() => { setBody(announcement?.body ?? ""); setEditing(!announcement && canEdit); }, [announcement?.body, canEdit]);

  return <section className="guild-announcements" aria-labelledby="guild-announcements-title">
    <GuildPromoBanner action={canEdit ? <button className="guild-inline-button" onClick={() => setEditing((value) => !value)} type="button">{editing ? "Скасувати" : "Змінити"}</button> : null} icon="campaign" meta={announcement ? `${announcement.authorName} · ${formatMissionDate(announcement.createdAt)}` : "Поки без оголошень"} title="Оголошення">
      {editing ? <form className="guild-form guild-announcement-form" onSubmit={(event) => { event.preventDefault(); onUpdateAnnouncement(body); setEditing(false); }}><textarea maxLength={280} rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Напиши короткий план або новину для гільдії…" /><div><small>{body.length} / 280</small><button className="guild-secondary-button" disabled={busy} type="submit">Зберегти</button></div></form> : announcement ? <p className="guild-promo-banner__copy">{announcement.body}</p> : <p className="guild-empty-copy">Для учасників ще немає оголошень.</p>}
    </GuildPromoBanner>
  </section>;
}

function formatMissionDate(value: string) {
  return new Date(value).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

export function GuildHub({ profile, busy, onInfo, onMembers, onApplications, onDevelopment, onRaid, onDirectory, onForum, onTreasury, onJournal, onAnnouncements, onUpdateAnnouncement, guildCardCandidates, onLoadGuildCardCandidates, onSetGuildCard }: GuildHubProps) {
  const { guild, dashboard } = profile;
  const managesApplications = profile.viewer.permissions.includes("manage_applications");
  const managesAnnouncement = profile.viewer.permissions.includes("manage_announcements");
  const [announcement, setAnnouncement] = useState(dashboard.announcement?.body ?? "");
  const [announcementOpen, setAnnouncementOpen] = useState(Boolean(dashboard.announcement));
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [feature, setFeature] = useState<GuildFeatureKey | null>(null);

  useEffect(() => { setAnnouncement(dashboard.announcement?.body ?? ""); setAnnouncementOpen(Boolean(dashboard.announcement)); setEditingAnnouncement(false); setFeature(null); }, [dashboard.announcement?.body]);

  return <div className="guild-hub">
    {announcementOpen && (dashboard.announcement || managesAnnouncement) ? <GuildPromoBanner action={managesAnnouncement ? <button className="guild-inline-button" onClick={() => setEditingAnnouncement((value) => !value)} type="button">{editingAnnouncement ? "Скасувати" : "Змінити"}</button> : null} icon="campaign" meta={dashboard.announcement ? `${dashboard.announcement.authorName} · ${formatMissionDate(dashboard.announcement.createdAt)}` : "Поки без оголошень"} title="Оголошення">
      {editingAnnouncement ? <form className="guild-form guild-announcement-form" onSubmit={(event) => { event.preventDefault(); onUpdateAnnouncement(announcement); setEditingAnnouncement(false); }}><textarea maxLength={280} rows={3} value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Напиши короткий план або новину для гільдії…" /><div><small>{announcement.length} / 280</small><button className="guild-secondary-button" disabled={busy} type="submit">Зберегти</button></div></form> : dashboard.announcement ? <p className="guild-promo-banner__copy">{dashboard.announcement.body}</p> : <p className="guild-empty-copy">Додай перше оголошення для учасників.</p>}
    </GuildPromoBanner> : null}

    <section className="guild-mode-menu" aria-label="Основні розділи гільдії">
      <GuildModeTile asset="main" detail={`Рівень ${guild.level}`} label="Про гільдію" onClick={onInfo} />
      <GuildCardPlatform active={profile.guildCard.active} canManage={profile.guildCard.canManage} candidates={guildCardCandidates} busy={busy} onLoadCandidates={onLoadGuildCardCandidates} onSetGuildCard={onSetGuildCard} />
      <GuildModeTile asset="altar" detail={`Рівень ${guild.level}`} label="Алтар гільдії" onClick={onDevelopment} />
      <GuildModeTile asset="war" detail="Незабаром" disabled label="Війна" onClick={() => setFeature("war")} />
      <GuildModeTile asset="arena" detail="Незабаром" disabled label="Арена" onClick={() => setFeature("arena")} />
      <GuildModeTile asset="raid" detail="1 активний" label="Рейд" onClick={onRaid} />
    </section>
    {feature ? <GuildFeatureNotice feature={feature} onClose={() => setFeature(null)} /> : null}

    <section className="guild-reward-section" aria-labelledby="guild-reward-title">
      <div className="guild-section-bar"><AppIcon name="card-reward" size={17} /><h3 id="guild-reward-title">Нагороди гільдії</h3></div>
    </section>

    <section className="guild-menu-section" aria-label="Основні функції гільдії">
      <div className="guild-menu-list">
        <MenuRow compact actionContent={<span className="guild-treasury-balance"><span><AppIcon name="silver" size={13} />{formatNumber(profile.treasury.balance.silver)}</span><span><AppIcon name="gold" size={13} />{formatNumber(profile.treasury.balance.gold)}</span></span>} icon="inventory" iconSrc="/assets/guild/guild-treasury-cart.png" metalTexture disabled={busy} onClick={onTreasury} title="Казна" />
        <MenuRow compact icon="profile" metalTexture disabled={busy} onClick={onMembers} title="Склад" />
        {managesApplications ? <MenuRow compact icon="mail" metalTexture disabled={busy} onClick={onApplications} title="Заявки" /> : null}
        <MenuRow compact icon="tournament" metalTexture disabled title="Досягнення гільдії" />
      </div>
    </section>

    <section className="guild-menu-section guild-menu-section--lower" aria-label="Додаткові розділи гільдії">
      <div className="guild-menu-list">
        <MenuRow compact icon="collection" metalTexture disabled={busy} onClick={onForum} title="Форум гільдії" />
        <MenuRow compact icon="mail" metalTexture disabled title="Чат гільдії" />
        <MenuRow compact icon="guild" metalTexture disabled title="Чат союзу" />
        <MenuRow compact icon="record" metalTexture disabled={busy} onClick={onJournal} title="Літопис" />
        <MenuRow compact icon="campaign" metalTexture disabled={busy} onClick={onAnnouncements} title="Оголошення" />
      </div>
    </section>

    <section className="guild-menu-section guild-menu-section--lower" aria-label="Каталог гільдій">
      <div className="guild-menu-list">
        <MenuRow compact icon="ranking" metalTexture disabled={busy} onClick={onDirectory} title="Найкращі гільдії" />
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
  const [altarNotice, setAltarNotice] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<GuildAltarCurrency | null>(null);

  useEffect(() => { setAltar(profile.altar); }, [profile.altar]);

  async function purchase(currency: GuildAltarCurrency) {
    if (busy || purchasing || !profile.viewer.member) return;
    setPurchasing(currency);
    setAltarNotice(null);
    try {
      const result = await onPurchaseAltar(currency);
      setAltar(result.altar);
      setAltarNotice(`Алтар підсилено: ${result.previousLevel} → ${result.newLevel} (+${result.totalIncrease} рів.)`);
    } catch (error) {
      setAltarNotice(guildErrorMessage(error));
    } finally {
      setPurchasing(null);
    }
  }

  return <section className="guild-development guild-altar" aria-labelledby="guild-altar-title">
    <div className="guild-section-bar"><AppIcon name="guild" size={17} /><h3 id="guild-altar-title">Алтар гільдії</h3><span>Рівень {formatNumber(altar.currentLevel)}</span></div>
    <p className="guild-altar__intro">Підсилення Алтаря купуються за ресурси гравця та діють одразу.</p>
    <div className="guild-altar__activation"><strong>Підсилення активується одразу</strong><p>Завершена колекція «Відьми» додає +2 рівні лише до золотого підсилення.</p></div>
    {altarNotice ? <p className="guild-altar__status" role="status">{altarNotice}</p> : null}
    <div className="guild-altar__upgrades" aria-label="Підсилення алтаря">
      {altar.upgrades.map((item) => {
        const asset = GUILD_ALTAR_ASSETS[item.currency];
        return <article className={`guild-altar-upgrade guild-altar-upgrade--${asset.tone}`} key={item.currency}>
          <span className="guild-altar-upgrade__art"><img alt="" src={asset.asset} /></span>
          <div className="guild-altar-upgrade__body"><div className="guild-altar-upgrade__heading"><h4>{item.name}</h4><small><AppIcon name={item.currency} size={13} /> {formatNumber(item.price)}</small></div><p>+{item.totalIncrease} рів. {item.currency === "gold" ? "за золото" : "за срібло"}{item.collectionBonus ? ` · Відьми +${item.collectionBonus}` : ""}</p><button className="guild-altar__buy" disabled={busy || purchasing !== null || !item.canAfford || !profile.viewer.member} onClick={() => { void purchase(item.currency); }} type="button">{item.canAfford ? "Придбати" : "Недостатньо ресурсу"}</button></div>
        </article>;
      })}
    </div>
    <button className="guild-altar__battle" onClick={onRaid} type="button"><p>Карти колекції «Відьми» можна отримати лише в рейдах.</p><img src="/assets/guild/guild-altar-battle.png" alt="" /><strong>Битви з підсиленнями</strong><small>Відкрити рейд відьом</small></button>
    <div className="guild-altar__menu guild-menu-list" aria-label="Розділи алтаря"><MenuRow compact detail={`${guild.memberCount} / ${guild.memberCapacity}`} icon="profile" metalTexture onClick={onMembers} title="Склад" /><MenuRow compact detail="Розмови гільдії" icon="collection" metalTexture onClick={onForum} title="Форум гільдії" /><MenuRow compact detail="Каталог" icon="ranking" metalTexture onClick={onDirectory} title="Найкращі гільдії" /></div>
  </section>;
}
