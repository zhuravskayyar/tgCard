import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CARD_ELEMENTS, type AdminAuditResponse, type AdminDashboardResponse, type CardRarity } from "@cardastika/shared";
import { AdminApiError, loadAdminAudit, loadAdminDashboard } from "../adminApi";
import { AdminCurrencyValue } from "../AdminCurrencyValue";
import { elementLabels, formatAction, formatDayLabel, formatLastSeen, formatNumber, formatPercent, formatTime, initials, rarityLabels } from "../adminFormat";
import { AdminError } from "../AdminStates";

function actionTone(action: string) {
  if (action.includes("REMOVE")) return "admin-badge--bad";
  if (action.includes("ADD")) return "admin-badge--good";
  return "admin-badge--info";
}

const rarityOrder: CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const AUTO_REFRESH_MS = 60_000;

type Loaded<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

function Kpi({ hint, label, online, value }: { hint?: ReactNode; label: string; online?: boolean; value: number }) {
  return (
    <article className="admin-kpi">
      <span className="admin-kpi__label">{online !== undefined ? <i className={`admin-dot${online ? " admin-dot--online" : ""}`} /> : null}{label}</span>
      <strong className="admin-kpi__value">{formatNumber(value)}</strong>
      {hint ? <span className="admin-kpi__hint">{hint}</span> : null}
    </article>
  );
}

function HorizontalBars({ items }: { items: Array<{ fill: string; key: string; label: string; value: number }> }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="admin-hbars">
      {items.map((item) => (
        <li key={item.key} title={`${item.label}: ${formatNumber(item.value)} (${formatPercent(item.value, total)})`}>
          <span>{item.label}</span>
          <span className="admin-hbars__track"><span className={`admin-hbars__fill ${item.fill}`} style={{ width: `${item.value / max * 100}%` }} /></span>
          <span className="admin-hbars__value">{formatNumber(item.value)}<small>{formatPercent(item.value, total)}</small></span>
        </li>
      ))}
    </ul>
  );
}

export function AdminDashboardScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [state, setState] = useState<Loaded<AdminDashboardResponse>>({ status: "loading" });
  const [activity, setActivity] = useState<Loaded<AdminAuditResponse>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    void Promise.allSettled([
      loadAdminDashboard(controller.signal).then((data) => setState({ status: "ready", data })),
      loadAdminAudit({ page: 1, limit: 6 }, controller.signal).then((data) => setActivity({ status: "ready", data })),
    ]).then(([dashboard, audit]) => {
      if (controller.signal.aborted) return;
      if (dashboard.status === "rejected") {
        const error = dashboard.reason as unknown;
        // Keep showing the previous snapshot when a background refresh fails.
        setState((current) => current.status === "ready" ? current : { status: "error", message: error instanceof AdminApiError ? error.message : "Невідома помилка" });
      } else {
        setUpdatedAt(new Date());
      }
      if (audit.status === "rejected") setActivity((current) => current.status === "ready" ? current : { status: "error", message: "Журнал недоступний" });
      setRefreshing(false);
    });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  const header = (
    <div className="admin-page__head">
      <div>
        <h1>Дашборд</h1>
        <p>{updatedAt ? `Оновлено о ${formatTime(updatedAt)}${autoRefresh ? " · автооновлення щохвилини" : ""}` : "Стан гри в реальному часі"}</p>
      </div>
      <div className="admin-page__tools">
        <button aria-pressed={autoRefresh} className="admin-chip" onClick={() => setAutoRefresh((value) => !value)} type="button">{autoRefresh ? "● Авто" : "○ Авто"}</button>
        <button className="admin-button admin-button--secondary" disabled={refreshing} onClick={refresh} type="button">{refreshing ? <span className="admin-spinner" /> : "↻"} Оновити</button>
      </div>
    </div>
  );

  if (state.status === "loading") {
    return <div className="admin-page">{header}<div className="admin-kpis">{Array.from({ length: 6 }, (_, index) => <div className="admin-skeleton" key={index} />)}</div><div className="admin-skeleton" style={{ height: 260 }} /></div>;
  }
  if (state.status === "error") return <div className="admin-page">{header}<AdminError message={state.message} onRetry={refresh} /></div>;

  const { cards, economy, gameData, guilds, players, signupsByDay, topPlayers } = state.data;
  const signupPeak = Math.max(0, ...signupsByDay.map((day) => day.count));
  const signupMax = Math.max(1, signupPeak);
  const signupTotal = signupsByDay.reduce((sum, day) => sum + day.count, 0);
  const lastSignupIndex = signupsByDay.length - 1;
  const winRate = gameData.duelWins + gameData.duelLosses > 0 ? formatPercent(gameData.duelWins, gameData.duelWins + gameData.duelLosses) : "—";

  return (
    <div className="admin-page">
      {header}

      <section aria-label="Ключові показники" className="admin-kpis">
        <Kpi hint={<><b>+{formatNumber(players.newLast7Days)}</b> за 7 днів</>} label="Усього гравців" value={players.total} />
        <Kpi hint="активні за 5 хв" label="Онлайн зараз" online={players.onlineNow > 0} value={players.onlineNow} />
        <Kpi hint={formatPercent(players.activeLast24Hours, players.total) + " від усіх"} label="Активні за 24 год" value={players.activeLast24Hours} />
        <Kpi hint="з 00:00 UTC" label="Нові сьогодні" value={players.newToday} />
        <Kpi hint={`${formatNumber(cards.definitions)} у каталозі`} label="Карт у гравців" value={cards.ownedInstances} />
        <Kpi hint={`${formatNumber(gameData.duels)} усього · ${winRate} перемог`} label="Дуелі за 24 год" value={gameData.duelsLast24Hours} />
      </section>

      <div className="admin-grid admin-grid--wide-left">
        <section className="admin-panel">
          <div className="admin-panel__head"><div><h2>Реєстрації за 14 днів</h2><p>Нові акаунти по днях (UTC). Наведіть на стовпчик, щоб побачити число.</p></div></div>
          <div aria-label="Реєстрації по днях" className="admin-columns" role="img">
            {signupsByDay.map((day, index) => {
              const height = `${day.count / signupMax * 100}%`;
              return (
                <div className={`admin-columns__col${index === lastSignupIndex ? " admin-columns__col--today" : ""}`} key={day.date} style={{ ["--h" as string]: height }} title={`${formatDayLabel(day.date)}: ${formatNumber(day.count)}`}>
                  <span className="admin-columns__value">{formatNumber(day.count)}</span>
                  <span className="admin-columns__bar" style={{ height }} />
                </div>
              );
            })}
          </div>
          <div aria-hidden="true" className="admin-columns__axis">{signupsByDay.map((day, index) => <span key={day.date}>{index === lastSignupIndex ? "сьог." : formatDayLabel(day.date)}</span>)}</div>
          <div className="admin-chart-summary">
            <span>Разом: <strong>{formatNumber(signupTotal)}</strong></span>
            <span>Середньо: <strong>{formatNumber(Math.round(signupTotal / Math.max(1, signupsByDay.length) * 10) / 10)}</strong> / день</span>
            <span>Пік: <strong>{formatNumber(signupPeak)}</strong></span>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__head"><div><h2>Економіка</h2><p>Валюта на руках у гравців</p></div></div>
          <dl className="admin-facts">
            <div><dt>Усього срібла</dt><dd><AdminCurrencyValue kind="silver" size={18} value={economy.totalSilver} /><small>≈ {formatNumber(Math.round(economy.averageSilver))} на гравця</small></dd></div>
            <div><dt>Усього золота</dt><dd><AdminCurrencyValue kind="gold" size={18} value={economy.totalGold} /><small>≈ {formatNumber(Math.round(economy.averageGold))} на гравця</small></dd></div>
            <div><dt>Гільдій</dt><dd>{formatNumber(guilds.total)}<small>{formatNumber(guilds.members)} гравців у гільдіях · {formatPercent(guilds.members, players.total)}</small></dd></div>
            <div><dt>Лімітовані карти</dt><dd>{formatNumber(gameData.limitedPromoRedemptions)}<small>активацій</small></dd></div>
          </dl>
        </section>
      </div>

      <div className="admin-grid admin-grid--3">
        <section className="admin-panel">
          <div className="admin-panel__head"><div><h2>Рідкість карт</h2><p>Екземпляри в інвентарях</p></div></div>
          <HorizontalBars items={rarityOrder.map((rarity) => ({ fill: `admin-fill--${rarity}`, key: rarity, label: rarityLabels[rarity], value: cards.rarityCounts[rarity] }))} />
        </section>
        <section className="admin-panel">
          <div className="admin-panel__head"><div><h2>Стихії</h2><p>Розподіл карт за стихією</p></div></div>
          <HorizontalBars items={CARD_ELEMENTS.map((element) => ({ fill: `admin-fill--${element}`, key: element, label: elementLabels[element], value: cards.elementCounts[element] }))} />
          {cards.mostPopular ? <p className="admin-note">Найпопулярніша карта: <strong>{cards.mostPopular.displayName}</strong> — {formatNumber(cards.mostPopular.ownedCopies)} копій</p> : null}
        </section>
        <section className="admin-panel">
          <div className="admin-panel__head"><div><h2>Топ гравців</h2><p>За рівнем акаунта</p></div><button className="admin-link" onClick={() => onNavigate("/admin/players")} type="button">Усі →</button></div>
          {topPlayers.length === 0 ? <p className="admin-muted">Гравців ще немає.</p> : (
            <ol className="admin-list">
              {topPlayers.map((player, index) => (
                <li key={player.id}>
                  <button className="admin-list__row" onClick={() => onNavigate(`/admin/players/${player.id}`)} type="button">
                    <span className="admin-rank">{index + 1}</span>
                    <span className="admin-avatar">{initials(player.name)}</span>
                    <span className="admin-list__main"><strong>{player.name}</strong><small>{formatNumber(player.silver)} срібла</small></span>
                    <span className="admin-level">{player.level}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel__head"><div><h2>Останні дії адміністраторів</h2><p>Зміни балансу, рівня та карт</p></div><button className="admin-link" onClick={() => onNavigate("/admin/audit")} type="button">Увесь журнал →</button></div>
        {activity.status === "loading" ? <div className="admin-state admin-state--loading"><span className="admin-spinner" /> Завантажуємо…</div> : null}
        {activity.status === "error" ? <p className="admin-muted">Журнал тимчасово недоступний.</p> : null}
        {activity.status === "ready" && activity.data.logs.length === 0 ? <p className="admin-muted">Адмінських змін поки немає.</p> : null}
        {activity.status === "ready" && activity.data.logs.length > 0 ? (
          <ul className="admin-list">
            {activity.data.logs.map((log) => (
              <li key={log.id}>
                <button className="admin-list__row" onClick={() => onNavigate(log.entityType === "player" ? `/admin/players/${log.entityId}` : "/admin/audit")} type="button">
                  <span className={`admin-badge ${actionTone(log.action)}`}>{formatAction(log.action)}</span>
                  <span className="admin-list__main"><strong>{log.entityType === "player" ? "Гравець" : log.entityType} {log.entityId.slice(0, 8)}…</strong><small>{formatLastSeen(log.createdAt)} · адмін {log.adminTelegramUserId}</small></span>
                  <span aria-hidden="true" className="admin-muted">→</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
