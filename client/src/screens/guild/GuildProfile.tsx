import { useEffect, useState, type ReactNode } from "react";
import { GUILD_CONFIG, GUILD_ROLE_LABELS, canKickGuildMember, canManageGuildRole, type GuildAltarCurrency, type GuildAltarUpgradeResponse, type GuildMineResponse, type GuildProfileResponse, type GuildRecruitmentMode, type GuildRole, type GuildTreasuryCurrency, type PlayerCardInstance } from "@cardastika/shared";
import { AppIcon } from "../../components/AppIcon";
import { MenuRow } from "../../components/MenuRow";
import { ELEMENT_LABELS, GuildEmblem, GuildRoleBadge, GuildState, LANGUAGE_LABELS, MODE_LABELS, ROLE_ORDER, formatDate, formatNumber, type AsyncState } from "./GuildUi";
import { GuildAnnouncements, GuildDevelopment, GuildHub, GuildJournal } from "./GuildHub";
import { GuildIdentity } from "./GuildIdentity";
import { GuildRaidScreen } from "./GuildRaidScreen";
import { GuildTreasuryScreen } from "./GuildTreasuryScreen";

interface GuildProfileProps {
  profile: GuildProfileResponse;
  mine: GuildMineResponse;
  playerLevel: number;
  busy: boolean;
  notice: ReactNode;
  onApply: (message: string) => void;
  onJoin: () => void;
  onWithdraw: (id: string) => void;
  onChangeRole: (playerId: string, role: GuildRole) => void;
  onDecideApplication: (id: string, decision: "accept" | "reject") => void;
  onDissolve: () => void;
  onKick: (playerId: string) => void;
  onLeave: () => void;
  onTransfer: (playerId: string) => void;
  onUpdateSettings: (input: { description: string; recruitmentMode: GuildRecruitmentMode }) => void;
  onDirectory: () => void;
  onForum: () => void;
  onUpdateAnnouncement: (body: string) => void;
  guildCardCandidates: AsyncState<PlayerCardInstance[]>;
  onLoadGuildCardCandidates: () => void;
  onSetGuildCard: (instanceId: string) => void;
  onPurchaseAltar: (currency: GuildAltarCurrency) => Promise<GuildAltarUpgradeResponse>;
  onDonateTreasuryCurrency: (currency: GuildTreasuryCurrency, amount: number) => void;
  onLoadTreasuryCardCandidates: () => void;
  onDonateGuildCardElements: (instanceIds: string[]) => void;
  treasuryCardCandidates: AsyncState<PlayerCardInstance[]>;
}

export function GuildProfile({ profile, mine, playerLevel, busy, notice, onApply, onJoin, onWithdraw, onChangeRole, onDecideApplication, onDissolve, onKick, onLeave, onTransfer, onUpdateSettings, onDirectory, onForum, onUpdateAnnouncement, guildCardCandidates, onLoadGuildCardCandidates, onSetGuildCard, onPurchaseAltar, onDonateTreasuryCurrency, onLoadTreasuryCardCandidates, onDonateGuildCardElements, treasuryCardCandidates }: GuildProfileProps) {
  const { guild, members, viewer, applications } = profile;
  const [tab, setTab] = useState<"overview" | "info" | "members" | "applications" | "development" | "raid" | "treasury" | "journal" | "announcements" | "management">("overview");
  const [memberPage, setMemberPage] = useState(1);
  const [description, setDescription] = useState(guild.description);
  const [mode, setMode] = useState(guild.recruitmentMode);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const permissions = viewer.permissions;
  const managesApplications = permissions.includes("manage_applications");
  const application = mine.activeApplication;
  const memberPages = Math.max(1, Math.ceil(members.length / 10));
  const panelTab = tab === "info" || tab === "members" || tab === "applications" || tab === "development" ? tab : null;
  const showGuildTabs = tab !== "overview" && tab !== "info" && tab !== "development" && tab !== "raid" && tab !== "treasury";

  useEffect(() => { setDescription(guild.description); setMode(guild.recruitmentMode); }, [guild.description, guild.recruitmentMode]);
  useEffect(() => { if (!managesApplications) setTab((current) => current === "applications" ? "members" : current); }, [managesApplications]);
  useEffect(() => { setMemberPage((current) => Math.min(current, memberPages)); }, [memberPages]);
  useEffect(() => {
    if (tab !== "raid") return;
    document.querySelector<HTMLElement>(".app-content")?.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  let entryMessage: string | null = null;
  if (!viewer.member) {
    if (mine.guild) entryMessage = "Ви вже в іншій гільдії. Перегляд доступний, повторний вступ — ні.";
    else if (playerLevel < GUILD_CONFIG.unlockLevel) entryMessage = `Вступ відкриється з ${GUILD_CONFIG.unlockLevel} рівня.`;
    else if (application) entryMessage = application.guildId === guild.id ? "Ваша заявка на розгляді." : "У вас є заявка до іншої гільдії. Спочатку відкличте її.";
    else if (mine.lastApplication?.guildId === guild.id && mine.lastApplication.retryAt && Date.parse(mine.lastApplication.retryAt) > Date.now()) entryMessage = `Заявку відхилено. Наступна спроба — ${formatDate(mine.lastApplication.retryAt)}.`;
    else if (guild.isFull) entryMessage = "Усі місця зайняті. Зараз вступ недоступний.";
    else if (guild.recruitmentMode === "closed") entryMessage = "Набір закритий. Виберіть іншу гільдію або поверніться пізніше.";
    else if (playerLevel < guild.minPlayerLevel) entryMessage = `Для вступу потрібен ${guild.minPlayerLevel} рівень. Ваш рівень — ${playerLevel}.`;
  }

  return <section className="guild-profile" data-element={guild.themeElement ?? undefined} aria-label={`Профіль гільдії ${guild.name}`} aria-busy={busy}>
    {tab !== "overview" && tab !== "info" && tab !== "development" && tab !== "raid" && tab !== "treasury" ? <GuildIdentity profile={profile} /> : null}
    {!viewer.member && tab === "overview" ? <div className="guild-entry">
      {entryMessage ? <p className="guild-helper" role="status">{entryMessage}</p> : guild.recruitmentMode === "application" ? <form className="guild-form" onSubmit={(event) => { event.preventDefault(); onApply(applicationMessage); }}>
        <label>Повідомлення для гільдії <span className="guild-helper">Необов’язково</span><textarea rows={2} maxLength={500} value={applicationMessage} onChange={(event) => setApplicationMessage(event.target.value)} placeholder="Розкажіть про себе…" /></label>
        <button className="guild-primary-button" disabled={busy} type="submit">Подати заявку</button>
      </form> : <button className="guild-primary-button" disabled={busy} onClick={onJoin} type="button">Вступити до гільдії</button>}
      {application && !mine.guild ? <div className="guild-pending"><small>Діє до {formatDate(application.expiresAt)}</small><button className="guild-secondary-button" disabled={busy} onClick={() => onWithdraw(application.id)} type="button">Відкликати заявку</button></div> : null}
    </div> : null}
    {notice}
    {showGuildTabs ? <div className="guild-tabs" role="tablist" aria-label="Розділи гільдії">
      <button id="guild-overview-tab" role="tab" aria-selected={false} aria-controls="guild-roster-panel" onClick={() => setTab("overview")} type="button">Огляд</button>
      <button id="guild-info-tab" role="tab" aria-selected={false} aria-controls="guild-roster-panel" onClick={() => setTab("info")} type="button">Профіль</button>
      <button id="guild-members-tab" role="tab" aria-selected={tab === "members"} aria-controls="guild-roster-panel" onClick={() => setTab("members")} type="button">Склад <span>{members.length}</span></button>
      {managesApplications ? <button id="guild-applications-tab" role="tab" aria-selected={tab === "applications"} aria-controls="guild-roster-panel" onClick={() => setTab("applications")} type="button">Заявки <span>{applications.length}</span></button> : null}
      <button id="guild-development-tab" role="tab" aria-selected={panelTab === "development"} aria-controls="guild-roster-panel" onClick={() => setTab("development")} type="button">Алтар гільдії</button>
    </div> : null}
    <div id="guild-roster-panel" role={tab === "overview" ? "region" : "tabpanel"} aria-label={tab === "overview" ? "Огляд гільдії" : undefined} aria-labelledby={panelTab ? `guild-${panelTab}-tab` : undefined}>
      {tab === "overview" ? <GuildHub profile={profile} busy={busy} guildCardCandidates={guildCardCandidates} onLoadGuildCardCandidates={onLoadGuildCardCandidates} onSetGuildCard={onSetGuildCard} onInfo={() => setTab("info")} onMembers={() => setTab("members")} onApplications={() => setTab("applications")} onDevelopment={() => setTab("development")} onRaid={() => setTab("raid")} onDirectory={onDirectory} onForum={onForum} onTreasury={() => setTab("treasury")} onJournal={() => setTab("journal")} onAnnouncements={() => setTab("announcements")} onUpdateAnnouncement={onUpdateAnnouncement} /> : tab === "info" ? <GuildInformation profile={profile} onBack={() => setTab("overview")} onMembers={() => setTab("members")} onForum={onForum} onDirectory={onDirectory} /> : tab === "development" ? <GuildDevelopment busy={busy} onPurchaseAltar={onPurchaseAltar} profile={profile} onMembers={() => setTab("members")} onForum={onForum} onDirectory={onDirectory} onRaid={() => setTab("raid")} /> : tab === "raid" ? <GuildRaidScreen profile={profile} onMembers={() => setTab("members")} onForum={onForum} onDirectory={onDirectory} /> : tab === "treasury" ? <GuildTreasuryScreen busy={busy} onBack={() => setTab("overview")} onDonateCardElements={onDonateGuildCardElements} onDonateCurrency={onDonateTreasuryCurrency} onLoadCardCandidates={onLoadTreasuryCardCandidates} profile={profile} treasuryCardCandidates={treasuryCardCandidates} /> : tab === "journal" ? <GuildJournal profile={profile} /> : tab === "announcements" ? <GuildAnnouncements busy={busy} onUpdateAnnouncement={onUpdateAnnouncement} profile={profile} /> : tab === "management" ? <GuildManagement busy={busy} description={description} guild={guild} mode={mode} onDescriptionChange={setDescription} onModeChange={setMode} onUpdateSettings={onUpdateSettings} /> : <>
        {tab === "members" ? <div className="guild-members-list">
          {members.length === 0 ? <GuildState>Список учасників порожній.</GuildState> : members.slice((memberPage - 1) * 10, memberPage * 10).map((member) => {
            const actor = viewer.member;
            const isSelf = member.playerId === actor?.playerId;
            const roles = actor && !isSelf && permissions.includes("manage_roles") ? ROLE_ORDER.filter((role) => role !== member.role && canManageGuildRole(actor.role, member.role, role)) : [];
            const canKick = actor && !isSelf && permissions.includes("kick_members") && canKickGuildMember(actor.role, member.role);
            const canTransfer = !isSelf && permissions.includes("transfer_leadership") && member.role !== "leader";
            const canManage = roles.length > 0 || canKick || canTransfer;
            const expanded = expandedMember === member.playerId;
            return <div className="guild-member" key={member.playerId}>
              <div className="guild-member-row">
                <span className="guild-member-row__avatar" aria-hidden="true">{member.photoUrl ? <img alt="" src={member.photoUrl} /> : member.displayName.slice(0, 1).toUpperCase()}</span>
                <span className="guild-member-row__identity"><strong>{member.displayName}{isSelf ? " · ви" : ""}</strong><small>Рівень {member.level} · {formatNumber(member.contributedXp)} XP</small></span>
                <GuildRoleBadge role={member.role} />
                {canManage ? <button className="guild-icon-button" aria-label={`Керувати: ${member.displayName}`} aria-expanded={expanded} aria-controls={`guild-member-${member.playerId}`} disabled={busy} onClick={() => setExpandedMember(expanded ? null : member.playerId)} type="button"><AppIcon name="chevron" size={16} /></button> : null}
              </div>
              {expanded && canManage ? <div className="guild-member-actions" id={`guild-member-${member.playerId}`}>
                {roles.length ? <label>Роль<select aria-label={`Змінити роль ${member.displayName}`} value="" disabled={busy} onChange={(event) => { if (event.target.value) onChangeRole(member.playerId, event.target.value as GuildRole); }}><option value="">Виберіть роль</option>{roles.map((role) => <option key={role} value={role}>{GUILD_ROLE_LABELS[role]}</option>)}</select></label> : null}
                {canTransfer ? <button className="guild-secondary-button" disabled={busy} onClick={() => onTransfer(member.playerId)} type="button">Передати лідерство</button> : null}
                {canKick ? <button className="guild-danger-button" disabled={busy} onClick={() => onKick(member.playerId)} type="button">Виключити учасника</button> : null}
              </div> : null}
            </div>;
          })}
          {memberPages > 1 ? <nav className="guild-pagination" aria-label="Сторінки складу"><button className="guild-secondary-button" disabled={memberPage <= 1} onClick={() => { setMemberPage((value) => value - 1); setExpandedMember(null); }} type="button">Назад</button><span>{memberPage} / {memberPages}</span><button className="guild-secondary-button" disabled={memberPage >= memberPages} onClick={() => { setMemberPage((value) => value + 1); setExpandedMember(null); }} type="button">Далі</button></nav> : null}
        </div> : applications.length === 0 ? <GuildState>Нових заявок немає. Тут з’являться гравці, які хочуть приєднатися.</GuildState> : <div className="guild-applications-list">{applications.map((item) => <article className="guild-application" key={item.id}>
          <strong>{item.playerName}</strong><small>Рівень {item.playerLevel} · до {formatDate(item.expiresAt)}</small>
          <div><button className="guild-primary-button" disabled={busy || guild.isFull} onClick={() => onDecideApplication(item.id, "accept")} type="button">Прийняти</button><button className="guild-secondary-button" disabled={busy} onClick={() => onDecideApplication(item.id, "reject")} type="button">Відхилити</button></div>
          {guild.isFull ? <small>Прийняття недоступне: усі місця зайняті.</small> : null}
        </article>)}</div>}
        </>}
    </div>
    {tab === "overview" && permissions.includes("manage_settings") ? <div className="guild-management-entry guild-menu-list"><MenuRow compact detail="Налаштування та права" icon="settings" metalTexture disabled={busy} onClick={() => setTab("management")} title="Керування гільдією" /></div> : null}
    <div className="guild-footer">
      <button className="guild-directory-link" onClick={onDirectory} disabled={busy} type="button"><AppIcon name="guild" size={17} /><span>Переглянути інші гільдії</span><AppIcon name="chevron" size={13} /></button>
      {tab !== "applications" && (viewer.member?.role === "leader" ? members.length === 1 && permissions.includes("dissolve_guild") ? <button className="guild-danger-button" disabled={busy} onClick={onDissolve} type="button">Розпустити гільдію</button> : tab === "members" ? <p className="guild-helper">Для виходу спочатку передайте лідерство через керування учасником.</p> : null : permissions.includes("leave_guild") ? <button className="guild-danger-button" disabled={busy} onClick={onLeave} type="button">Вийти з гільдії</button> : null)}
    </div>
  </section>;
}

function GuildInformation({ profile, onBack, onMembers, onForum, onDirectory }: { profile: GuildProfileResponse; onBack: () => void; onMembers: () => void; onForum: () => void; onDirectory: () => void }) {
  const { guild, members } = profile;
  const leader = members.find((member) => member.role === "leader");
  return <section className="guild-information guild-information--reference" aria-labelledby="guild-information-title">
    <div className="guild-section-bar"><AppIcon name="guild" size={17} /><h3 id="guild-information-title">Інформація про гільдію</h3></div>
    <div className="guild-information__identity"><GuildEmblem emblemId={guild.emblemId} /><h2>{guild.name}</h2><span>{guild.themeElement ? ELEMENT_LABELS[guild.themeElement] : "Без стихії"} · {MODE_LABELS[guild.recruitmentMode]}</span></div>
    <dl className="guild-information__facts"><div><dt>Заснована</dt><dd>{new Date(guild.createdAt).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" })}</dd></div><div><dt>Рівень</dt><dd>{guild.level}<small>{guild.nextLevelExperience === null ? "Максимальний рівень" : `${formatNumber(guild.experience)} / ${formatNumber(guild.nextLevelExperience)} XP`}</small></dd></div><div><dt>Склад</dt><dd>{guild.memberCount} / {guild.memberCapacity}</dd></div><div><dt>Активність</dt><dd>{formatNumber(guild.activityScore)} XP<small>за 7 днів</small></dd></div><div><dt>Лідер</dt><dd>{leader?.displayName ?? "—"}</dd></div><div><dt>Мова</dt><dd>{LANGUAGE_LABELS[guild.language]}</dd></div></dl>
    <button className="guild-information__back" onClick={onBack} type="button">До огляду гільдії</button>
    <div className="guild-information__actions guild-menu-list" aria-label="Дії з інформацією про гільдію">
      <MenuRow compact detail={`${guild.memberCount} / ${guild.memberCapacity}`} icon="profile" metalTexture onClick={onMembers} title="Склад" />
      <MenuRow compact detail="Розмови гільдії" icon="collection" metalTexture onClick={onForum} title="Форум гільдії" />
      <MenuRow compact detail="Каталог" icon="ranking" metalTexture onClick={onDirectory} title="Найкращі гільдії" />
    </div>
  </section>;
}

function GuildManagement({ busy, description, guild, mode, onDescriptionChange, onModeChange, onUpdateSettings }: { busy: boolean; description: string; guild: GuildProfileResponse["guild"]; mode: GuildRecruitmentMode; onDescriptionChange: (value: string) => void; onModeChange: (value: GuildRecruitmentMode) => void; onUpdateSettings: (input: { description: string; recruitmentMode: GuildRecruitmentMode }) => void }) {
  return <section className="guild-management" aria-labelledby="guild-management-title">
    <div className="guild-section-bar"><AppIcon name="settings" size={17} /><h3 id="guild-management-title">Керування гільдією</h3><span>Для лідера й офіцерів</span></div>
    <p className="guild-helper">Адміністративні дії залежать від вашої ролі. Цей екран змінює лише доступні налаштування гільдії.</p>
    <form className="guild-form" onSubmit={(event) => { event.preventDefault(); onUpdateSettings({ description, recruitmentMode: mode }); }}>
      <label>Опис<textarea maxLength={GUILD_CONFIG.descriptionMaxLength} rows={4} value={description} onChange={(event) => onDescriptionChange(event.target.value)} /></label>
      <label>Режим набору<select value={mode} onChange={(event) => onModeChange(event.target.value as GuildRecruitmentMode)}>{Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="guild-secondary-button" disabled={busy || (description === guild.description && mode === guild.recruitmentMode)} type="submit">Зберегти зміни</button>
    </form>
  </section>;
}
