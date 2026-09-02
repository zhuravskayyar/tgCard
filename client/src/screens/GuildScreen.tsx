import { useEffect, useRef, useState } from "react";
import { GUILD_CONFIG, type GuildAltarCurrency, type GuildMineResponse, type GuildProfileResponse, type GuildTreasuryCurrency, type PlayerCardInstance } from "@cardastika/shared";
import { setSessionToken } from "../auth/session";
import { AppIcon } from "../components/AppIcon";
import { MenuRow } from "../components/MenuRow";
import type { PlayerSummaryState } from "../types/player";
import { applyToGuild, changeGuildRole, createGuild, decideGuildApplication, donateGuildCardElements, donateGuildTreasury, dissolveGuild, joinGuild, kickGuildMember, leaveGuild, loadGuildCardCandidates, loadGuildProfile, loadGuildTreasuryCardCandidates, loadMyGuild, purchaseGuildAltarUpgrade, setGuildCard, transferGuildLeadership, updateGuildAnnouncement, updateGuildSettings, withdrawGuildApplication } from "../telegram/guild";
import { GuildDirectory, GuildCreateForm } from "./guild/GuildDirectory";
import { GuildProfile } from "./guild/GuildProfile";
import { GuildForumScreen } from "./guild/GuildForumScreen";
import { GuildState, formatDate, guildErrorMessage, type AsyncState } from "./guild/GuildUi";
import "./guild/guild.css";

interface GuildScreenProps {
  playerSummaryState: PlayerSummaryState;
  onRetryPlayerSummary: () => void;
}
type GuildView = { kind: "mine" | "directory" | "create" } | { kind: "profile" | "forum"; id: string };
type GuildMutation = GuildProfileResponse | { left: boolean } | { dissolved: boolean } | { withdrawn: boolean };

export function GuildScreen({ playerSummaryState, onRetryPlayerSummary }: GuildScreenProps) {
  const [mineState, setMineState] = useState<AsyncState<GuildMineResponse>>({ status: "loading" });
  const [profileState, setProfileState] = useState<AsyncState<GuildProfileResponse>>({ status: "loading" });
  const [guildCardCandidatesState, setGuildCardCandidatesState] = useState<AsyncState<PlayerCardInstance[]>>({ status: "ready", data: [] });
  const [treasuryCardCandidatesState, setTreasuryCardCandidatesState] = useState<AsyncState<PlayerCardInstance[]>>({ status: "ready", data: [] });
  const [view, setView] = useState<GuildView>({ kind: "mine" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [devAccounts, setDevAccounts] = useState<Array<{ key: string; label: string }>>([]);
  const actionLock = useRef(false);
  const heading = useRef<HTMLElement>(null);
  const playerId = playerSummaryState.status === "ready" ? playerSummaryState.data.id : null;
  const selectedId = view.kind === "profile" ? view.id : null;
  const forumGuildId = view.kind === "forum" ? view.id : null;

  useEffect(() => {
    if (!playerId) return;
    let active = true;
    setMineState({ status: "loading" });
    void loadMyGuild().then((data) => { if (active) setMineState({ status: "ready", data }); }).catch((error: unknown) => { if (active) setMineState({ status: "error", message: guildErrorMessage(error) }); });
    return () => { active = false; };
  }, [playerId, attempt]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setProfileState({ status: "loading" });
    void loadGuildProfile(selectedId).then((data) => { if (active) setProfileState({ status: "ready", data }); }).catch((error: unknown) => { if (active) setProfileState({ status: "error", message: guildErrorMessage(error) }); });
    return () => { active = false; };
  }, [selectedId, attempt]);

  useEffect(() => {
    setGuildCardCandidatesState({ status: "ready", data: [] });
    setTreasuryCardCandidatesState({ status: "ready", data: [] });
  }, [selectedId, attempt]);

  useEffect(() => { heading.current?.scrollIntoView({ block: "start", behavior: "instant" }); }, [view.kind, selectedId]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let active = true;
    void fetch("/api/dev/accounts").then((response) => response.ok ? response.json() as Promise<{ accounts: Array<{ key: string; label: string }> }> : null).then((result) => { if (active && result) setDevAccounts(result.accounts); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  function navigate(next: GuildView) { setNotice(null); setView(next); }
  function retry() { setAttempt((value) => value + 1); }

  async function run(action: () => Promise<GuildMutation>, success: string, refreshPlayer = false, preserveProfileView = false) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setNotice(null);
    let committed = false;
    try {
      const result = await action();
      committed = true;
      // A profile response after apply is NOT membership. Always read /mine.
      const mine = await loadMyGuild();
      setMineState({ status: "ready", data: mine });
      if ("guild" in result) {
        setProfileState({ status: "ready", data: result });
        if (!preserveProfileView) setView(result.viewer.member ? { kind: "mine" } : { kind: "profile", id: result.guild.id });
        if (preserveProfileView) setTreasuryCardCandidatesState({ status: "ready", data: [] });
      } else if ("withdrawn" in result && selectedId) {
        setProfileState({ status: "ready", data: await loadGuildProfile(selectedId) });
      } else setView({ kind: "mine" });
      setNotice({ error: false, text: success });
    } catch (error) {
      if (committed) {
        setMineState({ status: "error", message: "Дію виконано, але оновити дані не вдалося. Натисніть «Повторити» — виконувати дію вдруге не потрібно." });
      } else setNotice({ error: true, text: guildErrorMessage(error) });
    } finally {
      if (committed && refreshPlayer) onRetryPlayerSummary();
      actionLock.current = false;
      setBusy(false);
    }
  }

  const mine = mineState.status === "ready" ? mineState.data : null;
  const player = playerSummaryState.status === "ready" ? playerSummaryState.data : null;
  const profile = view.kind === "mine" ? mine?.guild : view.kind === "profile" && profileState.status === "ready" && profileState.data.guild.id === view.id ? profileState.data : null;
  async function loadGuildCardCandidatesForProfile() {
    if (!profile) return;
    setGuildCardCandidatesState({ status: "loading" });
    try {
      const result = await loadGuildCardCandidates(profile.guild.id);
      setGuildCardCandidatesState({ status: "ready", data: [...result.cards] });
    } catch (error: unknown) {
      setGuildCardCandidatesState({ status: "error", message: guildErrorMessage(error) });
    }
  }
  async function loadTreasuryCardCandidatesForProfile() {
    if (!profile) return;
    setTreasuryCardCandidatesState({ status: "loading" });
    try {
      const result = await loadGuildTreasuryCardCandidates(profile.guild.id);
      setTreasuryCardCandidatesState({ status: "ready", data: [...result.cards] });
    } catch (error: unknown) {
      setTreasuryCardCandidatesState({ status: "error", message: guildErrorMessage(error) });
    }
  }
  const title = view.kind === "create" ? "Створити гільдію" : view.kind === "directory" ? "Каталог гільдій" : profile ? profile.guild.name : "Гільдія";
  const isGuildHeading = Boolean(profile);
  const noticeContent = notice ? <div className={"guild-notice" + (notice.error ? " guild-notice--error" : "")} role={notice.error ? "alert" : "status"}><span>{notice.text}</span>{notice.error ? <button className="guild-secondary-button" disabled={busy} onClick={() => { setNotice(null); retry(); }} type="button">Оновити дані</button> : null}</div> : null;

  if (view.kind === "forum" && forumGuildId) {
    const forumGuildName = mine?.guild?.guild.id === forumGuildId ? mine.guild.guild.name : profileState.status === "ready" && profileState.data.guild.id === forumGuildId ? profileState.data.guild.name : "Гільдія";
    return <section className="guild-screen"><GuildForumScreen busy={busy} guildId={forumGuildId} guildName={forumGuildName} onBack={() => navigate(mine?.guild?.guild.id === forumGuildId ? { kind: "mine" } : { kind: "profile", id: forumGuildId })} /></section>;
  }

  return <section className="guild-screen">
    <header className={"guild-screen__heading" + (isGuildHeading ? " guild-screen__heading--guild" : "")} ref={heading}>
      {view.kind !== "mine" ? <button className="guild-icon-button guild-back-button" aria-label={view.kind === "profile" ? "До каталогу гільдій" : "До моєї гільдії"} disabled={busy} onClick={() => navigate({ kind: view.kind === "profile" ? "directory" : "mine" })} type="button"><AppIcon name="chevron" size={18} /></button> : isGuildHeading ? null : <AppIcon name="guild" size={24} />}
      <h1>{title}</h1>
      {isGuildHeading ? null : <button className="guild-text-button" disabled={busy || mineState.status === "loading"} onClick={retry} type="button">Оновити</button>}
    </header>
    {playerSummaryState.status === "loading" ? <GuildState>Завантаження гравця…</GuildState> : !player ? <GuildState error onRetry={onRetryPlayerSummary}>Не вдалося завантажити гравця. Увійдіть або повторіть спробу.</GuildState> : mineState.status === "loading" ? <GuildState>Завантаження гільдії…</GuildState> : mineState.status === "error" ? <GuildState error onRetry={retry}>{mineState.message}</GuildState> : mine ? <>
      {profile ? <GuildProfile key={profile.guild.id} profile={profile} mine={mine} playerLevel={player.level} busy={busy} notice={noticeContent}
        onApply={(message) => { void run(() => applyToGuild(profile.guild.id, message), "Заявку подано. Очікуйте рішення гільдії."); }}
        onJoin={() => { void run(() => joinGuild(profile.guild.id), "Ви приєдналися до гільдії."); }}
        onWithdraw={(id) => { void run(() => withdrawGuildApplication(id), "Заявку відкликано."); }}
        onChangeRole={(id, role) => { void run(() => changeGuildRole(profile.guild.id, id, role), "Роль учасника змінено."); }}
        onDecideApplication={(id, decision) => { void run(() => decideGuildApplication(profile.guild.id, id, decision), decision === "accept" ? "Гравця прийнято до гільдії." : "Заявку відхилено."); }}
        onDissolve={() => { if (window.confirm("Розпустити гільдію? Її розвиток буде втрачено, а назва стане вільною.")) void run(() => dissolveGuild(profile.guild.id), "Гільдію розпущено."); }}
        onKick={(id) => { if (window.confirm("Виключити " + (profile.members.find((member) => member.playerId === id)?.displayName ?? "учасника") + " з гільдії?")) void run(() => kickGuildMember(profile.guild.id, id), "Учасника виключено."); }}
        onLeave={() => { if (window.confirm("Вийти з гільдії? Вступ до іншої буде доступний через " + GUILD_CONFIG.leaveCooldownHours + " години.")) void run(() => leaveGuild(profile.guild.id), "Ви вийшли з гільдії."); }}
        onTransfer={(id) => { if (window.confirm("Передати лідерство " + (profile.members.find((member) => member.playerId === id)?.displayName ?? "учаснику") + "? Ви втратите права лідера.")) void run(() => transferGuildLeadership(profile.guild.id, id), "Лідерство передано."); }}
        onUpdateSettings={(input) => { void run(() => updateGuildSettings(profile.guild.id, input), "Налаштування збережено."); }}
        guildCardCandidates={guildCardCandidatesState}
        onLoadGuildCardCandidates={() => { void loadGuildCardCandidatesForProfile(); }}
        onSetGuildCard={(instanceId) => { void run(() => setGuildCard(profile.guild.id, instanceId), "Карту гільдії оновлено."); }}
        treasuryCardCandidates={treasuryCardCandidatesState}
        onLoadTreasuryCardCandidates={() => { void loadTreasuryCardCandidatesForProfile(); }}
        onDonateTreasuryCurrency={(currency: GuildTreasuryCurrency, amount: number) => { void run(() => donateGuildTreasury(profile.guild.id, currency, amount), "Внесок у казну прийнято.", true, true); }}
        onDonateGuildCardElements={(instanceIds: string[]) => { void run(() => donateGuildCardElements(profile.guild.id, instanceIds), "Карту гільдії прокачано.", true, true); }}
        onPurchaseAltar={async (currency: GuildAltarCurrency) => {
          const result = await purchaseGuildAltarUpgrade(profile.guild.id, currency);
          onRetryPlayerSummary();
          return result;
        }}
        onDirectory={() => navigate({ kind: "directory" })}
        onForum={() => navigate({ kind: "forum", id: profile.guild.id })}
        onUpdateAnnouncement={(body) => { void run(() => updateGuildAnnouncement(profile.guild.id, body), "Оголошення оновлено."); }}
      /> : view.kind === "profile" ? profileState.status === "error" ? <GuildState error onRetry={retry}>{profileState.message}</GuildState> : <GuildState>Завантаження гільдії…</GuildState> : <>
        {noticeContent}
        {player.level < GUILD_CONFIG.unlockLevel ? <div className="guild-lock"><AppIcon name="lock" size={24} /><div><strong>Доступно з {GUILD_CONFIG.unlockLevel} рівня</strong><p>Ваш рівень — {player.level}. Поки можна переглядати гільдії.</p></div></div> : null}
        {mine.guild && view.kind === "directory" ? <MenuRow compact icon="guild" title={"Моя гільдія: " + mine.guild.guild.name} onClick={() => navigate({ kind: "mine" })} /> : null}
        {!mine.guild && mine.activeApplication ? <div className="guild-pending"><div><strong>Заявка на розгляді</strong><small>Діє до {formatDate(mine.activeApplication.expiresAt)}</small></div><div><button className="guild-secondary-button" disabled={busy} onClick={() => navigate({ kind: "profile", id: mine.activeApplication!.guildId })} type="button">Переглянути</button><button className="guild-secondary-button" disabled={busy} onClick={() => { void run(() => withdrawGuildApplication(mine.activeApplication!.id), "Заявку відкликано."); }} type="button">Відкликати</button></div></div> : null}
        {!mine.guild && !mine.activeApplication && mine.lastApplication ? <GuildState>{mine.lastApplication.status === "rejected" ? "Заявку до «" + mine.lastApplication.guildName + "» відхилено." + (mine.lastApplication.retryAt ? " Наступна спроба — " + formatDate(mine.lastApplication.retryAt) + "." : "") : "Термін заявки до «" + mine.lastApplication.guildName + "» минув. Можна подати нову."}</GuildState> : null}
        {view.kind === "create" ? mine.guild ? <GuildState>Ви вже перебуваєте в гільдії. Створення іншої недоступне.</GuildState> : player.level < GUILD_CONFIG.unlockLevel ? null : <GuildCreateForm busy={busy} silver={player.silver} onCreate={(input) => { void run(() => createGuild(input), "Гільдію створено. Ви — її лідер.", true); }} /> : <>
          {!mine.guild && player.level >= GUILD_CONFIG.unlockLevel ? <MenuRow compact icon="guild" title="Створити свою гільдію" onClick={() => navigate({ kind: "create" })} disabled={busy} /> : null}
          <GuildDirectory key={attempt} onOpen={(id) => navigate({ kind: "profile", id })} />
        </>}
      </>}
    </> : null}
    {devAccounts.length > 0 ? <details className="guild-dev"><summary>Локальна перевірка</summary><label>Тестовий акаунт<select aria-label="Тестовий акаунт" value="" disabled={busy} onChange={async (event) => {
      const key = event.target.value;
      if (!key) return;
      try {
        const response = await fetch("/api/dev/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountKey: key }) });
        if (!response.ok) throw new Error("Dev login unavailable");
        const result = await response.json() as { sessionToken: string };
        setSessionToken(result.sessionToken); window.location.reload();
      } catch { setNotice({ error: true, text: "Не вдалося перемкнути локальний акаунт." }); }
    }}><option value="">Перемкнути акаунт…</option>{devAccounts.map((account) => <option key={account.key} value={account.key}>{account.label}</option>)}</select></label></details> : null}
  </section>;
}
