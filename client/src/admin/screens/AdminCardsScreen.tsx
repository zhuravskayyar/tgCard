import { useEffect, useState, type FormEvent } from "react";
import type { AdminCardsResponse } from "@cardastika/shared";
import { AdminApiError, loadAdminCards } from "../adminApi";
import { elementLabels, formatNumber, rarityLabels } from "../adminFormat";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

interface CardFilters { element: string; limited: string; minRarity: string; search: string; sort: string }
const emptyFilters: CardFilters = { element: "", limited: "", minRarity: "", search: "", sort: "name:asc" };

export function AdminCardsScreen() {
  const [draft, setDraft] = useState<CardFilters>(emptyFilters);
  const [filters, setFilters] = useState<CardFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminCardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { element, limited, minRarity, search, sort } = filters;
  useEffect(() => {
    const controller = new AbortController();
    const [sortField, direction] = sort.split(":");
    setLoading(true);
    setError(null);
    void loadAdminCards({ page, limit: 25, search, element, minRarity, limited, sort: sortField, direction }, controller.signal)
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof AdminApiError ? requestError.message : "Невідома помилка");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, element, limited, minRarity, page, search, sort]);
  const apply = (event: FormEvent) => { event.preventDefault(); setPage(1); setFilters(draft); };
  const clear = () => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); };

  return (
    <div className="admin-page">
      <div className="admin-page__heading"><div><p className="admin-eyebrow">КАТАЛОГ</p><h1>Карти</h1><p>Реальні визначення карт і кількість екземплярів у гравців.</p></div><span className="admin-readonly-badge">Лише перегляд</span></div>
      <div className="admin-callout"><strong>Чому без редагування?</strong><span>Seed-скрипти зараз є джерелом правди й можуть перезаписати каталог. Редактор стане безпечним після перенесення конфігурації в БД.</span></div>
      <form className="admin-filter admin-filter--cards" onSubmit={apply}>
        <label className="admin-field admin-field--search"><span>Пошук</span><input onChange={(event) => setDraft((value) => ({ ...value, search: event.target.value }))} placeholder="Назва або код" type="search" value={draft.search} /></label>
        <label className="admin-field"><span>Стихія</span><select onChange={(event) => setDraft((value) => ({ ...value, element: event.target.value }))} value={draft.element}><option value="">Усі</option><option value="fire">Вогонь</option><option value="water">Вода</option><option value="air">Повітря</option><option value="earth">Земля</option></select></label>
        <label className="admin-field"><span>Мін. рідкість</span><select onChange={(event) => setDraft((value) => ({ ...value, minRarity: event.target.value }))} value={draft.minRarity}><option value="">Усі</option><option value="common">Звичайна</option><option value="uncommon">Незвичайна</option><option value="rare">Рідкісна</option><option value="epic">Епічна</option><option value="legendary">Легендарна</option><option value="mythic">Міфічна</option></select></label>
        <label className="admin-field"><span>Лімітована</span><select onChange={(event) => setDraft((value) => ({ ...value, limited: event.target.value }))} value={draft.limited}><option value="">Усі</option><option value="true">Так</option><option value="false">Ні</option></select></label>
        <label className="admin-field"><span>Сортування</span><select onChange={(event) => setDraft((value) => ({ ...value, sort: event.target.value }))} value={draft.sort}><option value="name:asc">Назва A–Я</option><option value="code:asc">Код A–Я</option><option value="ownedCopies:desc">Найпопулярніші</option><option value="element:asc">Стихія</option></select></label>
        <div className="admin-filter__actions"><button className="admin-button" type="submit">Застосувати</button><button className="admin-button admin-button--ghost" onClick={clear} type="button">Очистити</button></div>
      </form>
      <section className="admin-panel admin-table-panel">
        <div className="admin-panel__heading"><div><h2>Каталог карт</h2><p>{data ? `${formatNumber(data.total)} визначень` : "Завантаження…"}</p></div></div>
        {loading && !data ? <AdminLoading /> : error ? <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} /> : data?.cards.length === 0 ? <AdminEmpty message="За цими фільтрами карт не знайдено." /> : data ? <>
          <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}><table className="admin-table"><thead><tr><th>Карта</th><th>Стихія</th><th>Мін. рідкість</th><th>Колекція</th><th>Джерело</th><th>Статус</th><th>У гравців</th></tr></thead><tbody>{data.cards.map((card) => <tr key={card.id}><td data-label="Карта"><strong>{card.displayName ?? card.code}</strong><small>{card.code}</small></td><td data-label="Стихія">{elementLabels[card.element]}</td><td data-label="Мін. рідкість"><span className={`admin-rarity admin-rarity--${card.minRarity}`}>{rarityLabels[card.minRarity]}</span></td><td data-label="Колекція">{card.collectionName ?? "—"}</td><td data-label="Джерело"><code>{card.source}</code></td><td data-label="Статус"><span className={card.limited ? "admin-status admin-status--warning" : "admin-status admin-status--active"}>{card.limited ? "Лімітована" : "Звичайна"}</span>{card.shopEligible ? <small>Доступна в магазині</small> : null}</td><td data-label="У гравців"><strong>{formatNumber(card.ownedCopies)}</strong></td></tr>)}</tbody></table></div>
          <AdminPagination onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
        </> : null}
      </section>
    </div>
  );
}
