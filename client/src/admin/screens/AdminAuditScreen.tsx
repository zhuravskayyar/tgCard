import { useEffect, useState, type FormEvent } from "react";
import type { AdminAuditResponse } from "@cardastika/shared";
import { AdminApiError, loadAdminAudit } from "../adminApi";
import { formatAction, formatDate, formatNumber } from "../adminFormat";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

interface AuditFilters { action: string; admin: string; dateFrom: string; dateTo: string; entityId: string }
const emptyFilters: AuditFilters = { action: "", admin: "", dateFrom: "", dateTo: "", entityId: "" };

function jsonPreview(value: unknown) {
  return value === null || value === undefined ? "—" : JSON.stringify(value, null, 2);
}

export function AdminAuditScreen() {
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { action, admin, dateFrom, dateTo, entityId } = filters;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadAdminAudit({ page, limit: 25, action, admin, entityId, dateFrom, dateTo }, controller.signal)
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof AdminApiError ? requestError.message : "Невідома помилка");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [action, admin, attempt, dateFrom, dateTo, entityId, page]);
  const apply = (event: FormEvent) => { event.preventDefault(); setPage(1); setFilters(draft); };
  const clear = () => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); };

  return (
    <div className="admin-page">
      <div className="admin-page__heading"><div><p className="admin-eyebrow">БЕЗПЕКА</p><h1>Журнал дій</h1><p>Незалежна історія усіх змін, зроблених через адмін-панель.</p></div></div>
      <form className="admin-filter admin-filter--audit" onSubmit={apply}>
        <label className="admin-field"><span>Дія</span><select onChange={(event) => setDraft((value) => ({ ...value, action: event.target.value }))} value={draft.action}><option value="">Усі дії</option><option value="PLAYER_ADD_SILVER">Додано срібло</option><option value="PLAYER_REMOVE_SILVER">Знято срібло</option><option value="PLAYER_ADD_GOLD">Додано золото</option><option value="PLAYER_REMOVE_GOLD">Знято золото</option><option value="PLAYER_LEVEL_CHANGE">Змінено рівень</option><option value="PLAYER_ADD_CARD">Додано карту</option><option value="PLAYER_REMOVE_CARD">Видалено карту</option></select></label>
        <label className="admin-field admin-field--search"><span>Адміністратор</span><input onChange={(event) => setDraft((value) => ({ ...value, admin: event.target.value }))} placeholder="Telegram ID або player ID" type="search" value={draft.admin} /></label>
        <label className="admin-field admin-field--search"><span>Об’єкт</span><input onChange={(event) => setDraft((value) => ({ ...value, entityId: event.target.value }))} placeholder="ID гравця або карти" type="search" value={draft.entityId} /></label>
        <label className="admin-field"><span>Від</span><input onChange={(event) => setDraft((value) => ({ ...value, dateFrom: event.target.value }))} type="date" value={draft.dateFrom} /></label>
        <label className="admin-field"><span>До</span><input onChange={(event) => setDraft((value) => ({ ...value, dateTo: event.target.value }))} type="date" value={draft.dateTo} /></label>
        <div className="admin-filter__actions"><button className="admin-button" type="submit">Застосувати</button><button className="admin-button admin-button--ghost" onClick={clear} type="button">Очистити</button></div>
      </form>
      <section className="admin-panel admin-table-panel">
        <div className="admin-panel__heading"><div><h2>Події аудиту</h2><p>{data ? `${formatNumber(data.total)} записів` : "Завантаження…"}</p></div></div>
        {loading && !data ? <AdminLoading /> : error ? <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} /> : data?.logs.length === 0 ? <AdminEmpty message="Адмінських змін за цими фільтрами ще не було." /> : data ? <>
          <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}><table className="admin-table admin-table--audit"><thead><tr><th>Час</th><th>Адміністратор</th><th>Дія</th><th>Об’єкт</th><th>Зміни</th></tr></thead><tbody>{data.logs.map((log) => <tr key={log.id}><td data-label="Час">{formatDate(log.createdAt)}</td><td data-label="Адміністратор"><strong>{log.adminTelegramUserId}</strong><small>{log.adminPlayerId ?? "Акаунт видалено"}</small></td><td data-label="Дія"><span className="admin-audit-action">{formatAction(log.action)}</span></td><td data-label="Об’єкт"><strong>{log.entityType}</strong><small>{log.entityId}</small></td><td data-label="Зміни"><details className="admin-audit-details"><summary>Переглянути</summary><div><span>Було</span><pre>{jsonPreview(log.before)}</pre><span>Стало</span><pre>{jsonPreview(log.after)}</pre></div></details></td></tr>)}</tbody></table></div>
          <AdminPagination onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
        </> : null}
      </section>
    </div>
  );
}
