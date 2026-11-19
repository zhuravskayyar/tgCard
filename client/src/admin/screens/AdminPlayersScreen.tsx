import { useEffect, useState, type FormEvent } from "react";
import type { AdminPlayersResponse } from "@cardastika/shared";
import { AdminApiError, loadAdminPlayers } from "../adminApi";
import { AdminCurrencyValue } from "../AdminCurrencyValue";
import { downloadCsv, formatDate, formatLastSeen, formatNumber, initials, playerName } from "../adminFormat";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

interface PlayerFilters {
  createdFrom: string;
  goldMin: string;
  levelMax: string;
  levelMin: string;
  online: boolean;
  search: string;
  silverMin: string;
  sort: string;
}

const emptyFilters: PlayerFilters = { createdFrom: "", goldMin: "", levelMax: "", levelMin: "", online: false, search: "", silverMin: "", sort: "createdAt:desc" };

function daysAgo(days: number) {
  const date = new Date(Date.now() - days * 24 * 60 * 60_000);
  return date.toISOString().slice(0, 10);
}

export function AdminPlayersScreen({ initialSearch, onNavigate }: { initialSearch: string; onNavigate: (path: string) => void }) {
  const initial = { ...emptyFilters, search: initialSearch };
  const [draft, setDraft] = useState<PlayerFilters>(initial);
  const [filters, setFilters] = useState<PlayerFilters>(initial);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminPlayersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { createdFrom, goldMin, levelMax, levelMin, online, search, silverMin, sort } = filters;

  useEffect(() => {
    const controller = new AbortController();
    const [sortField, direction] = sort.split(":");
    setLoading(true);
    setError(null);
    void loadAdminPlayers({
      page,
      limit,
      search,
      createdFrom,
      goldMin,
      levelMax,
      levelMin,
      online: online ? "true" : undefined,
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
  }, [attempt, createdFrom, goldMin, levelMax, levelMin, limit, online, page, search, silverMin, sort]);

  const apply = (next: PlayerFilters) => { setPage(1); setDraft(next); setFilters(next); };
  const submit = (event: FormEvent) => { event.preventDefault(); apply(draft); };
  const weekAgo = daysAgo(7);
  const quick = [
    { active: !online && !createdFrom && !levelMin && !levelMax && !goldMin && !silverMin && !search, label: "Усі", next: { ...emptyFilters, sort } },
    { active: online, label: "● Онлайн", next: { ...filters, online: !online } },
    { active: createdFrom === weekAgo, label: "Нові за 7 днів", next: { ...filters, createdFrom: createdFrom === weekAgo ? "" : weekAgo } },
    { active: sort === "level:desc", label: "Найвищий рівень", next: { ...filters, sort: sort === "level:desc" ? "createdAt:desc" : "level:desc" } },
    { active: sort === "gold:desc", label: "Найбагатші", next: { ...filters, sort: sort === "gold:desc" ? "createdAt:desc" : "gold:desc" } },
  ];

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`cardastika-players-p${data.page}.csv`, ["ID", "Ім’я", "Username", "Telegram ID", "Рівень", "Срібло", "Золото", "Онлайн", "Останній захід", "Реєстрація"], data.players.map((player) => [
      player.id, playerName(player), player.username, player.telegramUserId, player.level, player.silver, player.gold,
      player.isOnline ? "так" : "ні", player.lastSeenAt, player.createdAt,
    ]));
  };

  return (
    <div className="admin-page">
      <div className="admin-page__head">
        <div><h1>Гравці</h1><p>{data ? `${formatNumber(data.total)} акаунтів за поточним фільтром` : "Пошук і керування акаунтами"}</p></div>
        <div className="admin-page__tools">
          <button className="admin-button admin-button--secondary" disabled={!data || data.players.length === 0} onClick={exportCsv} type="button">⇩ CSV</button>
          <button className="admin-button admin-button--secondary" disabled={loading} onClick={() => setAttempt((value) => value + 1)} type="button">↻ Оновити</button>
        </div>
      </div>

      <div className="admin-chips" role="group" aria-label="Швидкі фільтри">
        {quick.map((chip) => <button aria-pressed={chip.active} className="admin-chip" key={chip.label} onClick={() => apply(chip.next)} type="button">{chip.label}</button>)}
      </div>

      <form className={`admin-panel admin-filter${filtersOpen ? " admin-filter--expanded" : ""}`} onSubmit={submit}>
        <label className="admin-field admin-filter__search"><span>Пошук</span><input onChange={(event) => setDraft((value) => ({ ...value, search: event.target.value }))} placeholder="Ім’я, @username, Telegram ID або ID гравця" type="search" value={draft.search} /></label>
        <label className="admin-field admin-filter__extra"><span>Рівень від</span><input inputMode="numeric" min="1" onChange={(event) => setDraft((value) => ({ ...value, levelMin: event.target.value }))} type="number" value={draft.levelMin} /></label>
        <label className="admin-field admin-filter__extra"><span>Рівень до</span><input inputMode="numeric" min="1" onChange={(event) => setDraft((value) => ({ ...value, levelMax: event.target.value }))} type="number" value={draft.levelMax} /></label>
        <label className="admin-field admin-filter__extra"><span>Срібло від</span><input inputMode="numeric" min="0" onChange={(event) => setDraft((value) => ({ ...value, silverMin: event.target.value }))} type="number" value={draft.silverMin} /></label>
        <label className="admin-field admin-filter__extra"><span>Золото від</span><input inputMode="numeric" min="0" onChange={(event) => setDraft((value) => ({ ...value, goldMin: event.target.value }))} type="number" value={draft.goldMin} /></label>
        <label className="admin-field admin-filter__extra"><span>Реєстрація від</span><input onChange={(event) => setDraft((value) => ({ ...value, createdFrom: event.target.value }))} type="date" value={draft.createdFrom} /></label>
        <label className="admin-field admin-filter__extra"><span>Сортування</span><select onChange={(event) => setDraft((value) => ({ ...value, sort: event.target.value }))} value={draft.sort}><option value="createdAt:desc">Нові спочатку</option><option value="createdAt:asc">Старі спочатку</option><option value="level:desc">Рівень ↓</option><option value="level:asc">Рівень ↑</option><option value="silver:desc">Срібло ↓</option><option value="gold:desc">Золото ↓</option><option value="name:asc">Ім’я А–Я</option></select></label>
        <div className="admin-filter__actions">
          <button className="admin-button" type="submit">Знайти</button>
          <button className="admin-button admin-button--secondary admin-filter-toggle" onClick={() => setFiltersOpen((value) => !value)} type="button">{filtersOpen ? "Менше" : "Фільтри"}</button>
          <button className="admin-button admin-button--ghost" onClick={() => apply(emptyFilters)} type="button">Скинути</button>
        </div>
      </form>

      <section className="admin-panel admin-panel--flush">
        {loading && !data ? <AdminLoading /> : error && !data ? <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} /> : data?.players.length === 0 ? <AdminEmpty message="Змініть пошук або фільтри." /> : data ? (
          <>
            <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}>
              <table className="admin-table">
                <thead><tr><th>Гравець</th><th className="is-num">Рівень</th><th className="is-num">Срібло</th><th className="is-num">Золото</th><th>Активність</th><th>Реєстрація</th><th><span className="admin-sr-only">Дія</span></th></tr></thead>
                <tbody>{data.players.map((player) => {
                  const name = playerName(player);
                  const open = () => onNavigate(`/admin/players/${player.id}`);
                  return (
                    <tr className="is-clickable" key={player.id} onClick={open}>
                      <td className="admin-td-title"><div className="admin-cell-person"><span className="admin-avatar">{initials(name)}</span><span className="admin-cell-main"><strong>{name}</strong><small>{[player.username ? `@${player.username}` : null, player.telegramUserId ? `TG ${player.telegramUserId}` : null].filter(Boolean).join(" · ") || player.id}</small></span></div></td>
                      <td className="is-num" data-label="Рівень"><span className="admin-level">{player.level}</span></td>
                      <td className="is-num" data-label="Срібло"><AdminCurrencyValue kind="silver" value={player.silver} /></td>
                      <td className="is-num" data-label="Золото"><AdminCurrencyValue kind="gold" value={player.gold} /></td>
                      <td data-label="Активність">{player.isOnline ? <span className="admin-badge admin-badge--good"><i className="admin-dot admin-dot--online" />Онлайн</span> : <span className="admin-muted">{formatLastSeen(player.lastSeenAt)}</span>}</td>
                      <td className="admin-hide-phone" data-label="Реєстрація"><span className="admin-muted">{formatDate(player.createdAt)}</span></td>
                      <td className="admin-td-actions admin-hide-phone"><button className="admin-button admin-button--secondary admin-button--sm" onClick={(event) => { event.stopPropagation(); open(); }} type="button">Профіль →</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <AdminPagination limit={limit} onLimitChange={(value) => { setLimit(value); setPage(1); }} onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
          </>
        ) : null}
      </section>
    </div>
  );
}
