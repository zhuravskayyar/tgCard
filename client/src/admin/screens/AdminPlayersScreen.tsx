import { useEffect, useState, type FormEvent } from "react";
import type { AdminPlayersResponse } from "@cardastika/shared";
import { AdminApiError, loadAdminPlayers } from "../adminApi";
import { AdminCurrencyValue } from "../AdminCurrencyValue";
import { formatDate, formatNumber, playerName } from "../adminFormat";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

interface PlayerFilters {
  createdFrom: string;
  goldMin: string;
  levelMin: string;
  search: string;
  silverMin: string;
  sort: string;
}

const emptyFilters: PlayerFilters = { createdFrom: "", goldMin: "", levelMin: "", search: "", silverMin: "", sort: "createdAt:desc" };

export function AdminPlayersScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [draft, setDraft] = useState<PlayerFilters>(emptyFilters);
  const [filters, setFilters] = useState<PlayerFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminPlayersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { createdFrom, goldMin, levelMin, search, silverMin, sort } = filters;

  useEffect(() => {
    const controller = new AbortController();
    const [sortField, direction] = sort.split(":");
    setLoading(true);
    setError(null);
    void loadAdminPlayers({
      page,
      limit: 25,
      search,
      createdFrom,
      goldMin,
      levelMin,
      silverMin,
      sort: sortField,
      direction,
    }, controller.signal)
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof AdminApiError ? requestError.message : "Невідома помилка");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, createdFrom, goldMin, levelMin, page, search, silverMin, sort]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  };
  const clearFilters = () => {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  };

  return (
    <div className="admin-page">
      <div className="admin-page__heading"><div><p className="admin-eyebrow">КОРИСТУВАЧІ</p><h1>Гравці</h1><p>Пошук, фільтрація та безпечне керування ігровим станом.</p></div></div>
      <form className="admin-filter" onSubmit={applyFilters}>
        <label className="admin-field admin-field--search"><span>Пошук</span><input onChange={(event) => setDraft((value) => ({ ...value, search: event.target.value }))} placeholder="Ім’я, username або Telegram ID" type="search" value={draft.search} /></label>
        <label className="admin-field"><span>Рівень від</span><input min="1" onChange={(event) => setDraft((value) => ({ ...value, levelMin: event.target.value }))} type="number" value={draft.levelMin} /></label>
        <label className="admin-field"><span>Срібло від</span><input min="0" onChange={(event) => setDraft((value) => ({ ...value, silverMin: event.target.value }))} type="number" value={draft.silverMin} /></label>
        <label className="admin-field"><span>Золото від</span><input min="0" onChange={(event) => setDraft((value) => ({ ...value, goldMin: event.target.value }))} type="number" value={draft.goldMin} /></label>
        <label className="admin-field"><span>Реєстрація від</span><input onChange={(event) => setDraft((value) => ({ ...value, createdFrom: event.target.value }))} type="date" value={draft.createdFrom} /></label>
        <label className="admin-field"><span>Сортування</span><select onChange={(event) => setDraft((value) => ({ ...value, sort: event.target.value }))} value={draft.sort}><option value="createdAt:desc">Нові спочатку</option><option value="createdAt:asc">Старі спочатку</option><option value="level:desc">Рівень ↓</option><option value="silver:desc">Срібло ↓</option><option value="gold:desc">Золото ↓</option><option value="name:asc">Ім’я A–Я</option></select></label>
        <div className="admin-filter__actions"><button className="admin-button" type="submit">Застосувати</button><button className="admin-button admin-button--ghost" onClick={clearFilters} type="button">Очистити</button></div>
      </form>

      <section className="admin-panel admin-table-panel">
        <div className="admin-panel__heading"><div><h2>Список гравців</h2><p>{data ? `${formatNumber(data.total)} акаунтів за поточним запитом` : "Завантаження…"}</p></div></div>
        {loading && !data ? <AdminLoading /> : error ? <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} /> : data?.players.length === 0 ? <AdminEmpty message="Змініть пошук або фільтри." /> : data ? (
          <>
            <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}>
              <table className="admin-table">
                <thead><tr><th>Гравець</th><th>Telegram</th><th>Рівень</th><th>Срібло</th><th>Золото</th><th>Реєстрація</th><th><span className="admin-sr-only">Дія</span></th></tr></thead>
                <tbody>{data.players.map((player) => (
                  <tr key={player.id}>
                    <td data-label="Гравець"><strong>{playerName(player)}</strong><small>{player.username ? `@${player.username}` : player.id}</small></td>
                    <td data-label="Telegram">{player.telegramUserId ?? "—"}</td>
                    <td data-label="Рівень"><span className="admin-level-badge">{player.level}</span></td>
                    <td data-label="Срібло"><AdminCurrencyValue kind="silver" value={player.silver} /></td>
                    <td data-label="Золото"><AdminCurrencyValue kind="gold" value={player.gold} /></td>
                    <td data-label="Реєстрація">{formatDate(player.createdAt)}</td>
                    <td><button className="admin-table__open" onClick={() => onNavigate(`/admin/players/${player.id}`)} type="button">Відкрити →</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <AdminPagination onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
          </>
        ) : null}
      </section>
    </div>
  );
}
