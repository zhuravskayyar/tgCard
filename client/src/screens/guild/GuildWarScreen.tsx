import { useCallback, useEffect, useRef, useState } from "react";
import { GUILD_ROLE_LABELS, type GuildWarAction, type GuildWarParticipantView, type GuildWarPhase, type GuildWarPlayerProgress, type GuildWarSideView, type GuildWarView } from "@cardastika/shared";
import { getUiLocale, translateUi } from "../../i18n";
import { GuildApiError, loadGuildWar, sendGuildWarAction } from "../../telegram/guild";
import { GuildState } from "./GuildUi";
import { WarKeyCombat, WarTeamCombat } from "./GuildWarCombat";

const PHASE_LABELS: Readonly<Record<GuildWarPhase, string>> = {
  pairing: "Формування пар",
  key_duels: "Дуелі за ключі",
  mass_battle: "Масові бої",
  results: "Підсумки тижня",
  rest: "Тиждень завершено",
};
const WAR_MESSAGES: Readonly<Record<string, string>> = {
  war_deck_invalid: "Для війни потрібна повна бойова колода.",
  war_insufficient_gold: "Не вистачає золота для вступу в бій.",
  war_late_fee_required: "Бій уже почався. Онови розклад, щоб вступити.",
  war_no_attempts: "Спроби захопити ключ закінчилися.",
  war_target_unavailable: "У цього суперника вже немає доступних ключів.",
};

function formatWarDate(value: string) {
  return new Intl.DateTimeFormat(getUiLocale(), {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function WarRoster({ side, ownSide }: { side: GuildWarSideView; ownSide: boolean }) {
  const locale = getUiLocale();
  return <section className={`guild-war-side${ownSide ? " guild-war-side--own" : ""}`} aria-label={translateUi(ownSide ? "Ваша гільдія" : "Суперник", locale)}>
    <header className="guild-war-side__header">
      <div><span className="guild-kicker">{translateUi(ownSide ? "Ваша гільдія" : "Суперник", locale)}</span><h3>{side.name}</h3></div>
      <span className="guild-war-side__rating">{translateUi("Рівень {s} · рейтинг {s}", locale).replace("{s}", String(side.level)).replace("{s}", new Intl.NumberFormat(locale).format(side.warRating))}</span>
    </header>
    <p className="guild-war-side__roster-heading"><span>{translateUi("Зафіксований склад", locale)} <strong>{side.memberCount}</strong></span><small>{translateUi("Сила колоди", locale)}</small></p>
    {side.roster.length ? <ol className="guild-war-roster">
      {side.roster.map((member: GuildWarParticipantView, index) => <li key={member.playerId}>
        <span className="guild-war-roster__place">{index + 1}</span>
        <span className="guild-war-roster__identity"><strong>{member.name}</strong><small>{translateUi(GUILD_ROLE_LABELS[member.role], locale)} · {translateUi("рівень {s}", locale).replace("{s}", String(member.level))}</small></span>
        <span className="guild-war-roster__rating" aria-label={`${translateUi("Сила колоди", locale)} ${member.deckPower}`}>{new Intl.NumberFormat(locale).format(member.deckPower)}</span>
      </li>)}
    </ol> : <p className="guild-empty-copy">{translateUi("Склад на цей тиждень порожній.", locale)}</p>}
  </section>;
}

export function GuildWarScreen({ guildId, onPlayerProgress }: {
  guildId: string;
  onPlayerProgress: (progress: GuildWarPlayerProgress) => void;
}) {
  const locale = getUiLocale();
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; data: GuildWarView } | { status: "error" }>({ status: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeAction = useRef(false);
  const currentRequest = useRef<AbortController | null>(null);
  const publishedProgress = useRef<GuildWarPlayerProgress | undefined>(undefined);
  const applyView = useCallback((data: GuildWarView) => {
    setState({ status: "ready", data });
    const progress = data.playerProgress;
    const previous = publishedProgress.current;
    if (progress && (progress.gold !== previous?.gold || progress.level !== previous?.level || progress.accountXp !== previous?.accountXp)) {
      publishedProgress.current = progress;
      onPlayerProgress(progress);
    }
  }, [onPlayerProgress]);
  const load = useCallback(() => {
    if (activeAction.current) return;
    const id = ++requestId.current;
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    void loadGuildWar(guildId, controller.signal).then((data) => {
      if (id === requestId.current) applyView(data);
    }).catch(() => {
      if (id !== requestId.current || controller.signal.aborted) return;
      setState((previous) => previous.status === "ready" ? previous : { status: "error" });
    });
  }, [applyView, guildId]);

  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
      currentRequest.current?.abort();
      activeAction.current = false;
    };
  }, [load]);
  const pollingPhase = state.status === "ready" ? state.data.phase : null;
  useEffect(() => {
    if (!pollingPhase) return;
    const interval = window.setInterval(() => {
      if (!document.hidden) load();
    }, pollingPhase === "mass_battle" ? 5_000 : 30_000);
    return () => window.clearInterval(interval);
  }, [load, pollingPhase]);

  function act(action: GuildWarAction) {
    if (state.status !== "ready" || activeAction.current) return;
    const id = ++requestId.current;
    currentRequest.current?.abort();
    activeAction.current = true;
    setPending(true);
    setError(null);
    void sendGuildWarAction(guildId, state.data.weekStartsAt, action).then((data) => {
      if (requestId.current === id) applyView(data);
    }).catch((cause: unknown) => {
      if (requestId.current !== id) return;
      setError(cause instanceof GuildApiError ? WAR_MESSAGES[cause.code] ?? "Дію не виконано. Спробуйте ще раз." : "Дію не виконано. Спробуйте ще раз.");
      activeAction.current = false;
      setPending(false);
      load();
    }).finally(() => {
      if (requestId.current !== id) return;
      activeAction.current = false;
      setPending(false);
    });
  }

  if (state.status === "loading") return <GuildState>{translateUi("Завантаження війни гільдій…", locale)}</GuildState>;
  if (state.status === "error") return <GuildState error onRetry={load}>{translateUi("Не вдалося завантажити війну гільдій.", locale)}</GuildState>;

  const war = state.data;
  if (!war.isUnlocked) return <section className="guild-war">
    <div className="guild-war-banner"><img alt="" aria-hidden="true" src="/assets/guild/guild-war.svg" /><div><span className="guild-kicker">{translateUi("Тижневі гільдійні змагання", locale)}</span><h2>{translateUi("Війна гільдій", locale)}</h2></div></div>
    <p className="guild-war-lock-copy">{translateUi("Війна гільдій відкриється з {s} рівня гільдії.", locale).replace("{s}", String(war.unlockLevel))}</p>
  </section>;

  return <section className="guild-war">
    <div className="guild-war-banner"><img alt="" aria-hidden="true" src="/assets/guild/guild-war.svg" /><div><span className="guild-kicker">{translateUi("Тижневі гільдійні змагання", locale)}</span><h2>{translateUi("Війна гільдій", locale)}</h2></div></div>
    <section className="guild-war-phase" aria-label={translateUi("Поточний етап", locale)}>
      <span className="guild-war-phase__seal" aria-hidden="true">{war.phase === "rest" ? "✦" : "⚔"}</span>
      <div><span className="guild-kicker">{translateUi("Поточний етап", locale)}</span><h3>{translateUi(PHASE_LABELS[war.phase], locale)}</h3>
        <p>{translateUi("Етап триває до {s}", locale).replace("{s}", formatWarDate(war.endsAt))}</p>
      </div>
    </section>
    <div className="guild-war-calendar" role="group" aria-label={translateUi("Розклад війни", locale)}>
      {["Понеділок · пари й склад", "Вівторок · дуелі за ключі", "Середа · масовий бій", "Четвер · дуелі за ключі", "П’ятниця · масовий бій", "Субота · підсумки", "Неділя · відпочинок"].map((day) => <span className="guild-war-calendar__day" key={day}>{translateUi(day, locale)}</span>)}
    </div>
    {war.match ? <>
      <div className="guild-war-match-facts">
        <div><span>{translateUi("Тиждень від", locale)}</span><strong>{formatWarDate(war.weekStartsAt)}</strong></div>
        <div><span>{translateUi("Рейтинг гільдії", locale)}</span><strong>{new Intl.NumberFormat(locale).format(war.match.guild.warRating)}</strong></div>
        {war.phase === "results" || war.phase === "rest" ? <>
          <div><span>{translateUi("Перемоги у масових боях", locale)}</span><strong>{war.match.ownMassBattleWins} : {war.match.opponentMassBattleWins}</strong></div>
          <div><span>{translateUi("Загальна шкода", locale)}</span><strong>{war.match.ownDamage.toLocaleString(locale)} : {war.match.opponentDamage.toLocaleString(locale)}</strong></div>
        </> : null}
      </div>
      {!war.viewerIsRostered ? <p className="guild-war-notice" role="status">{translateUi("Ви не потрапили до складу, зафіксованого на початку тижня.", locale)}</p> : null}
      {error ? <p className="guild-war-notice" role="alert">{translateUi(error, locale)}</p> : null}
      {war.keyDay && war.match.opponent ? <WarKeyCombat day={war.keyDay} roster={war.match.opponent.roster} pending={pending} send={act} /> : null}
      {war.battleKeys != null && war.viewerIsRostered ? <p className="guild-war-notice">
        {translateUi("Ключі для боїв {s}", locale).replace("{s}", String(war.battleKeys))}
      </p> : null}
      {war.battles?.map((battle) => <WarTeamCombat key={`${war.weekStartsAt}-${battle.number}`} battle={battle}
        guildId={guildId} pending={pending} send={act} formatDate={formatWarDate} />)}
      {war.plannedBattles?.length ? <details className="guild-war-side guild-war-combat">
        <summary>{translateUi("Години масових боїв", locale)}</summary>
        <ul className="guild-war-combat__list">
          {war.plannedBattles.map((battle) => <li key={battle.number}>
            <span>{translateUi("Бій {s}", locale).replace("{s}", String(battle.number))}</span>
            <span>{formatWarDate(battle.locationAt)}<small>{translateUi("Запис від {s}", locale).replace("{s}", formatWarDate(battle.registrationAt))}</small></span>
          </li>)}
        </ul>
      </details> : null}
      {war.match.opponent ? <div className="guild-war-sides">
        <WarRoster ownSide side={war.match.guild} />
        <WarRoster ownSide={false} side={war.match.opponent} />
      </div> : <p className="guild-war-notice">{translateUi("Цього тижня суперника не знайшлося; гільдія відпочиває.", locale)}</p>}
    </> : <p className="guild-war-notice">{translateUi("Пари на цей тиждень ще не сформовано.", locale)}</p>}
    {war.history?.length ? <section className="guild-war-side guild-war-combat">
      <header className="guild-war-side__header"><h3>{translateUi("Історія воєн", locale)}</h3></header>
      <ul className="guild-war-combat__list">
        {war.history.map((entry) => <li key={entry.weekStartsAt}>
          <span>{entry.opponentName}<small>{formatWarDate(entry.weekStartsAt)}</small></span>
          <span>{entry.ownWins} : {entry.opponentWins}<small>{translateUi(entry.outcome === "win" ? "Перемога гільдії" : entry.outcome === "loss" ? "Поразка гільдії" : "Нічия", locale)}</small></span>
        </li>)}
      </ul>
    </section> : null}
  </section>;
}
