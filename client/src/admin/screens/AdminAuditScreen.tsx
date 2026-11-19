import { useEffect, useState, type FormEvent } from "react";
import type { AdminAuditResponse } from "@cardastika/shared";
import { AdminApiError, loadAdminAudit } from "../adminApi";
import { AdminAuditDiff } from "../AdminAuditDiff";
import { formatAction, formatDate, formatNumber } from "../adminFormat";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

interface AuditFilters { action: string; admin: string; dateFrom: string; dateTo: string; entityId: string }
const emptyFilters: AuditFilters = { action: "", admin: "", dateFrom: "", dateTo: "", entityId: "" };
const actions = ["PLAYER_ADD_SILVER", "PLAYER_REMOVE_SILVER", "PLAYER_ADD_GOLD", "PLAYER_REMOVE_GOLD", "PLAYER_LEVEL_CHANGE", "PLAYER_ADD_CARD", "PLAYER_REMOVE_CARD"];

function actionTone(action: string) {
  if (action.includes("REMOVE")) return "admin-badge--bad";
  if (action.includes("ADD")) return "admin-badge--good";
  return "admin-badge--info";
}

export function AdminAuditScreen({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { action, admin, dateFrom, dateTo, entityId } = filters;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadAdminAudit({ page, limit, action, admin, entityId, dateFrom, dateTo }, controller.signal)
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof AdminApiError ? requestError.message : "Невідома помилка");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [action, admin, attempt, dateFrom, dateTo, entityId, limit, page]);

  const apply = (next: AuditFilters) => { setPage(1); setDraft(next); setFilters(next); };
  const submit = (event: FormEvent) => { event.preventDefault(); apply(draft); };

  return (
    <div className="admin-page">
      <div className="admin-page__head">
        <div><h1>Журнал дій</h1><p>{data ? `${formatNumber(data.total)} записів` : "Історія змін, зроблених через адмін-панель"}</p></div>
        <div className="admin-page__tools"><button className="admin-button admin-button--secondary" disabled={loading} onClick={() => setAttempt((value) => value + 1)} type="button">↻ Оновити</button></div>
      </div>

      <div aria-label="Тип дії" className="admin-chips" role="group">
        <button aria-pressed={!action} className="admin-chip" onClick={() => apply({ ...filters, action: "" })} type="button">Усі</button>
        {actions.map((value) => <button aria-pressed={action === value} className="admin-chip" key={value} onClick={() => apply({ ...filters, action: action === value ? "" : value })} type="button">{formatAction(value)}</button>)}
      </div>

      <form className={`admin-panel admin-filter${filtersOpen ? " admin-filter--expanded" : ""}`} onSubmit={submit}>
        <label className="admin-field admin-filter__search"><span>Гравець або об’єкт</span><input onChange={(event) => setDraft((value) => ({ ...value, entityId: event.target.value }))} placeholder="ID гравця (можна частину)" type="search" value={draft.entityId} /></label>
        <label className="admin-field admin-filter__extra"><span>Адміністратор</span><input onChange={(event) => setDraft((value) => ({ ...value, admin: event.target.value }))} placeholder="Telegram ID" type="search" value={draft.admin} /></label>
        <label className="admin-field admin-filter__extra"><span>Від</span><input onChange={(event) => setDraft((value) => ({ ...value, dateFrom: event.target.value }))} type="date" value={draft.dateFrom} /></label>
        <label className="admin-field admin-filter__extra"><span>До</span><input onChange={(event) => setDraft((value) => ({ ...value, dateTo: event.target.value }))} type="date" value={draft.dateTo} /></label>
        <div className="admin-filter__actions">
          <button className="admin-button" type="submit">Знайти</button>
          <button className="admin-button admin-button--secondary admin-filter-toggle" onClick={() => setFiltersOpen((value) => !value)} type="button">{filtersOpen ? "Менше" : "Фільтри"}</button>
          <button className="admin-button admin-button--ghost" onClick={() => apply(emptyFilters)} type="button">Скинути</button>
        </div>
      </form>

      <section className="admin-panel admin-panel--flush">
        {loading && !data ? <AdminLoading /> : error && !data ? <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} /> : data?.logs.length === 0 ? <AdminEmpty message="За цими фільтрами змін не було." /> : data ? <>
          <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}>
            <table className="admin-table">
              <thead><tr><th>Час</th><th>Дія</th><th>Об’єкт</th><th>Зміни</th><th>Адмін</th></tr></thead>
              <tbody>{data.logs.map((log) => (
                <tr className="admin-audit-row" key={log.id}>
                  <td className="admin-td-title"><span className="admin-muted">{formatDate(log.createdAt)}</span></td>
                  <td data-label="Дія"><span className={`admin-badge ${actionTone(log.action)}`}>{formatAction(log.action)}</span></td>
                  <td data-label="Об’єкт">{log.entityType === "player" ? <button className="admin-link" onClick={() => onNavigate(`/admin/players/${log.entityId}`)} title={log.entityId} type="button">Гравець {log.entityId.slice(0, 8)}… →</button> : <span className="admin-cell-main"><strong>{log.entityType}</strong><small>{log.entityId}</small></span>}</td>
                  <td data-label="Зміни"><AdminAuditDiff log={log} /></td>
                  <td data-label="Адмін"><span className="admin-muted">{log.adminTelegramUserId}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <AdminPagination limit={limit} onLimitChange={(value) => { setLimit(value); setPage(1); }} onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
        </> : null}
      </section>
    </div>
  );
}
