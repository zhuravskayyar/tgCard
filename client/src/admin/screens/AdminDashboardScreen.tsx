import { useEffect, useState } from "react";
import type { AdminDashboardResponse, CardRarity } from "@cardastika/shared";
import { AdminApiError, loadAdminDashboard } from "../adminApi";
import { AdminCurrencyValue } from "../AdminCurrencyValue";
import { formatNumber, rarityLabels } from "../adminFormat";
import { AdminError, AdminLoading } from "../AdminStates";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; data: AdminDashboardResponse }
  | { status: "error"; message: string };

const rarityOrder: CardRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export function AdminDashboardScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DashboardState>({ status: "loading" });
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

  if (state.status === "loading") return <AdminLoading label="Збираємо статистику…" />;
  if (state.status === "error") return <AdminError message={state.message} onRetry={() => setAttempt((value) => value + 1)} />;
  const { cards, economy, gameData, players } = state.data;
  const maximumRarity = Math.max(...rarityOrder.map((rarity) => cards.rarityCounts[rarity]), 1);

  return (
    <div className="admin-page">
      <div className="admin-page__heading"><div><p className="admin-eyebrow">ОГЛЯД СИСТЕМИ</p><h1>Дашборд</h1><p>Актуальний зріз локальної бази Cardastika.</p></div><span className="admin-live"><i /> Дані наживо</span></div>
      <section className="admin-kpis" aria-label="Ключові показники">
        <article><span>Усього гравців</span><strong>{formatNumber(players.total)}</strong><small>+{formatNumber(players.newLast7Days)} за 7 днів</small></article>
        <article><span>Нові сьогодні</span><strong>{formatNumber(players.newToday)}</strong><small>за UTC-добу</small></article>
        <article><span>Карт у гравців</span><strong>{formatNumber(cards.ownedInstances)}</strong><small>{formatNumber(cards.definitions)} карт у каталозі</small></article>
        <article><span>Зіграно дуелей</span><strong>{formatNumber(gameData.duels)}</strong><small>{formatNumber(gameData.duelWins)} перемог · {formatNumber(gameData.duelLosses)} поразок</small></article>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><h2>Економіка</h2><p>Суми та середній баланс на акаунт</p></div></div>
          <div className="admin-economy">
            <article><div><small>Усього срібла</small><AdminCurrencyValue kind="silver" size={30} value={economy.totalSilver} /><span>Середнє на гравця: {formatNumber(economy.averageSilver)}</span></div></article>
            <article><div><small>Усього золота</small><AdminCurrencyValue kind="gold" size={30} value={economy.totalGold} /><span>Середнє на гравця: {formatNumber(economy.averageGold)}</span></div></article>
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><h2>Рідкість карт</h2><p>Розподіл усіх екземплярів</p></div></div>
          <div className="admin-bars">
            {rarityOrder.map((rarity) => (
              <div key={rarity}><span>{rarityLabels[rarity]}</span><i><b className={`admin-rarity--${rarity}`} style={{ width: `${Math.max(3, cards.rarityCounts[rarity] / maximumRarity * 100)}%` }} /></i><strong>{formatNumber(cards.rarityCounts[rarity])}</strong></div>
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><h2>Ігрова активність</h2><p>Дані, які вже надійно зберігаються сервером</p></div></div>
          <dl className="admin-facts">
            <div><dt>Популярна карта</dt><dd>{cards.mostPopular?.displayName ?? "Немає даних"}{cards.mostPopular ? <small>{formatNumber(cards.mostPopular.ownedCopies)} копій</small> : null}</dd></div>
            <div><dt>Активації лімітованих карт</dt><dd>{formatNumber(gameData.limitedPromoRedemptions)}</dd></div>
            <div><dt>Активні за 24 години</dt><dd className="admin-muted">Немає last_seen</dd></div>
            <div><dt>Історія покупок</dt><dd className="admin-muted">Ще не зберігається</dd></div>
          </dl>
        </section>
        <section className="admin-panel admin-panel--accent">
          <div className="admin-panel__heading"><div><h2>Швидкі дії</h2><p>Перейти до основних робочих розділів</p></div></div>
          <div className="admin-quick-actions">
            <button onClick={() => onNavigate("/admin/players")} type="button"><span>♙</span><strong>Знайти гравця</strong><small>Баланс, рівень і карти</small></button>
            <button onClick={() => onNavigate("/admin/cards")} type="button"><span>▱</span><strong>Переглянути карти</strong><small>Каталог і статистика</small></button>
            <button onClick={() => onNavigate("/admin/audit")} type="button"><span>≡</span><strong>Відкрити журнал</strong><small>Історія змін</small></button>
          </div>
        </section>
      </div>
    </div>
  );
}
