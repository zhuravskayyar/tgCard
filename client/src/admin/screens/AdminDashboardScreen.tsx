import { useEffect, useState } from "react";
import type { AdminAuditResponse, AdminDashboardResponse, CardRarity } from "@cardastika/shared";
import { AdminApiError, loadAdminAudit, loadAdminDashboard } from "../adminApi";
import { AdminCurrencyValue } from "../AdminCurrencyValue";
import { formatAction, formatDate, formatNumber, rarityLabels } from "../adminFormat";
import { AdminError, AdminLoading } from "../AdminStates";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; data: AdminDashboardResponse }
  | { status: "error"; message: string };

type ActivityState =
  | { status: "loading" }
  | { status: "ready"; data: AdminAuditResponse }
  | { status: "error" };

const rarityOrder: CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export function AdminDashboardScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [activity, setActivity] = useState<ActivityState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadAdminDashboard(controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof AdminApiError ? error.message : "Невідома помилка" });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAdminAudit({ page: 1, limit: 5 }, controller.signal)
      .then((data) => setActivity({ status: "ready", data }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setActivity({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  if (state.status === "loading") return <AdminLoading label="Збираємо статистику…" />;
  if (state.status === "error") return <AdminError message={state.message} onRetry={() => setAttempt((value) => value + 1)} />;
  const { cards, economy, gameData, players } = state.data;
  const maximumRarity = Math.max(...rarityOrder.map((rarity) => cards.rarityCounts[rarity]), 1);

  return (
    <div className="admin-page">
      <div className="admin-page__heading"><div><p className="admin-eyebrow">ОГЛЯД СИСТЕМИ</p><h1>Дашборд</h1><p>Коротко про гравців, карти й активність Cardastika.</p></div><span className="admin-live"><i /> Дані оновлено</span></div>
      <section className="admin-kpis" aria-label="Ключові показники">
        <article className="admin-kpi admin-kpi--blue"><span className="admin-kpi__icon" aria-hidden="true">♙</span><span>Усього гравців</span><strong>{formatNumber(players.total)}</strong><small>+{formatNumber(players.newLast7Days)} за 7 днів</small></article>
        <article className="admin-kpi admin-kpi--yellow"><span className="admin-kpi__icon" aria-hidden="true">✦</span><span>Нові сьогодні</span><strong>{formatNumber(players.newToday)}</strong><small>за UTC-добу</small></article>
        <article className="admin-kpi admin-kpi--mint"><span className="admin-kpi__icon" aria-hidden="true">▱</span><span>Карт у гравців</span><strong>{formatNumber(cards.ownedInstances)}</strong><small>{formatNumber(cards.definitions)} у каталозі</small></article>
        <article className="admin-kpi admin-kpi--coral"><span className="admin-kpi__icon" aria-hidden="true">⚔</span><span>Зіграно дуелей</span><strong>{formatNumber(gameData.duels)}</strong><small>{formatNumber(gameData.duelWins)} перемог · {formatNumber(gameData.duelLosses)} поразок</small></article>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-panel--economy">
          <div className="admin-panel__heading"><div><span className="admin-panel__eyebrow">РЕСУРСИ</span><h2>Економіка гри</h2><p>Загальні суми та середній баланс акаунта</p></div><span className="admin-panel__symbol" aria-hidden="true">◉</span></div>
          <div className="admin-economy">
            <article><div><small>Усього срібла</small><AdminCurrencyValue kind="silver" size={30} value={economy.totalSilver} /><span>Середнє на гравця: {formatNumber(economy.averageSilver)}</span></div></article>
            <article><div><small>Усього золота</small><AdminCurrencyValue kind="gold" size={30} value={economy.totalGold} /><span>Середнє на гравця: {formatNumber(economy.averageGold)}</span></div></article>
          </div>
        </section>
        <section className="admin-panel admin-panel--chart">
          <div className="admin-panel__heading"><div><span className="admin-panel__eyebrow">КОЛЕКЦІЯ</span><h2>Рідкість карт</h2><p>Копії карт, якими володіють гравці</p></div><span className="admin-panel__symbol" aria-hidden="true">▥</span></div>
          <div className="admin-chart" role="img" aria-label="Розподіл карт за рідкістю">
            {rarityOrder.map((rarity) => (
              <div className="admin-chart__column" key={rarity}>
                <strong>{formatNumber(cards.rarityCounts[rarity])}</strong>
                <div className="admin-chart__track"><i className={`admin-chart__bar admin-rarity--${rarity}`} style={{ height: `${Math.max(5, cards.rarityCounts[rarity] / maximumRarity * 100)}%` }} /></div>
                <span>{rarityLabels[rarity]}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel admin-panel--wide admin-table-panel admin-dashboard-activity">
          <div className="admin-panel__heading"><div><span className="admin-panel__eyebrow">ОСТАННЄ</span><h2>Недавні дії</h2><p>Останні зміни, записані в журналі адміністратора</p></div><button className="admin-link-button" onClick={() => onNavigate("/admin/audit")} type="button">Увесь журнал <span aria-hidden="true">→</span></button></div>
          {activity.status === "loading" ? <div className="admin-inline-state"><span className="admin-spinner" /> Завантажую записи журналу…</div> : null}
          {activity.status === "error" ? <div className="admin-inline-state">Журнал тимчасово недоступний. <button className="admin-link-button" onClick={() => onNavigate("/admin/audit")} type="button">Відкрити розділ</button></div> : null}
          {activity.status === "ready" && activity.data.logs.length === 0 ? <div className="admin-inline-state">Адміністративних змін поки немає.</div> : null}
          {activity.status === "ready" && activity.data.logs.length > 0 ? <div className="admin-table-wrap"><table className="admin-table admin-table--recent"><thead><tr><th>Час</th><th>Хто</th><th>Дія</th><th>Об’єкт</th></tr></thead><tbody>{activity.data.logs.map((log) => <tr key={log.id}><td data-label="Час">{formatDate(log.createdAt)}</td><td data-label="Хто"><strong>{log.adminTelegramUserId}</strong></td><td data-label="Дія"><span className="admin-audit-action">{formatAction(log.action)}</span></td><td data-label="Об’єкт"><strong>{log.entityType}</strong><small>{log.entityId}</small></td></tr>)}</tbody></table></div> : null}
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><span className="admin-panel__eyebrow">СТАН ПРОЄКТУ</span><h2>Ігрова активність</h2><p>Показники зі збережених даних сервера</p></div></div>
          <dl className="admin-facts">
            <div><dt>Популярна карта</dt><dd>{cards.mostPopular?.displayName ?? "Немає даних"}{cards.mostPopular ? <small>{formatNumber(cards.mostPopular.ownedCopies)} копій</small> : null}</dd></div>
            <div><dt>Активації лімітованих карт</dt><dd>{formatNumber(gameData.limitedPromoRedemptions)}</dd></div>
            <div><dt>Активні за 24 години</dt><dd className="admin-muted">Немає даних входу</dd></div>
            <div><dt>Історія покупок</dt><dd className="admin-muted">Ще не записується</dd></div>
          </dl>
        </section>
        <section className="admin-panel admin-panel--accent">
          <div className="admin-panel__heading"><div><span className="admin-panel__eyebrow">НАВІГАЦІЯ</span><h2>Швидкі дії</h2><p>Перейти до потрібного інструмента</p></div></div>
          <div className="admin-quick-actions">
            <button onClick={() => onNavigate("/admin/players")} type="button"><span aria-hidden="true">♙</span><strong>Знайти гравця</strong><small>Баланс, рівень і карти</small><b aria-hidden="true">→</b></button>
            <button onClick={() => onNavigate("/admin/cards")} type="button"><span aria-hidden="true">▱</span><strong>Переглянути карти</strong><small>Каталог і статистика</small><b aria-hidden="true">→</b></button>
            <button onClick={() => onNavigate("/admin/audit")} type="button"><span aria-hidden="true">≡</span><strong>Відкрити журнал</strong><small>Історія змін</small><b aria-hidden="true">→</b></button>
          </div>
        </section>
      </div>
    </div>
  );
}
