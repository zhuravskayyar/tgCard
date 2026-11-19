import { useEffect, useState, type FormEvent } from "react";
import type { AdminCardsResponse } from "@cardastika/shared";
import { AdminApiError, loadAdminCards } from "../adminApi";
import { downloadCsv, elementLabels, formatNumber, rarityLabels } from "../adminFormat";
import { AdminPagination } from "../AdminPagination";
import { AdminEmpty, AdminError, AdminLoading } from "../AdminStates";

interface CardFilters { element: string; limited: string; minRarity: string; search: string; sort: string }
const emptyFilters: CardFilters = { element: "", limited: "", minRarity: "", search: "", sort: "name:asc" };
const elementChips = [{ label: "Усі", value: "" }, { label: "Вогонь", value: "fire" }, { label: "Вода", value: "water" }, { label: "Повітря", value: "air" }, { label: "Земля", value: "earth" }];

export function AdminCardsScreen() {
  const [draft, setDraft] = useState<CardFilters>(emptyFilters);
  const [filters, setFilters] = useState<CardFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AdminCardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { element, limited, minRarity, search, sort } = filters;

  useEffect(() => {
    const controller = new AbortController();
    const [sortField, direction] = sort.split(":");
    setLoading(true);
    setError(null);
    void loadAdminCards({ page, limit, search, element, minRarity, limited, sort: sortField, direction }, controller.signal)
      .then(setData)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof AdminApiError ? requestError.message : "Невідома помилка");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, element, limit, limited, minRarity, page, search, sort]);

  const apply = (next: CardFilters) => { setPage(1); setDraft(next); setFilters(next); };
  const submit = (event: FormEvent) => { event.preventDefault(); apply(draft); };
  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`cardastika-cards-p${data.page}.csv`, ["ID", "Код", "Назва", "Стихія", "Мін. рідкість", "Колекція", "Джерело", "Лімітована", "У магазині", "У гравців"], data.cards.map((card) => [
      card.id, card.code, card.displayName, elementLabels[card.element], rarityLabels[card.minRarity], card.collectionName, card.source,
      card.limited ? "так" : "ні", card.shopEligible ? "так" : "ні", card.ownedCopies,
    ]));
  };

  return (
    <div className="admin-page">
      <div className="admin-page__head">
        <div><h1>Карти</h1><p>{data ? `${formatNumber(data.total)} карт у каталозі · лише перегляд` : "Каталог карт і їх поширеність"}</p></div>
        <div className="admin-page__tools">
          <button className="admin-button admin-button--secondary" disabled={!data || data.cards.length === 0} onClick={exportCsv} type="button">⇩ CSV</button>
          <button className="admin-button admin-button--secondary" disabled={loading} onClick={() => setAttempt((value) => value + 1)} type="button">↻ Оновити</button>
        </div>
      </div>

      <div className="admin-callout"><strong>Редагування вимкнене.</strong><span>Каталог зараз задають seed-скрипти — зміни з адмінки перезаписались би при деплої.</span></div>

      <div aria-label="Стихія" className="admin-chips" role="group">
        {elementChips.map((chip) => <button aria-pressed={element === chip.value} className="admin-chip" key={chip.label} onClick={() => apply({ ...filters, element: chip.value })} type="button">{chip.value ? <i className={`admin-dot admin-fill--${chip.value}`} /> : null}{chip.label}</button>)}
      </div>

      <form className={`admin-panel admin-filter${filtersOpen ? " admin-filter--expanded" : ""}`} onSubmit={submit}>
        <label className="admin-field admin-filter__search"><span>Пошук</span><input onChange={(event) => setDraft((value) => ({ ...value, search: event.target.value }))} placeholder="Назва або код карти" type="search" value={draft.search} /></label>
        <label className="admin-field admin-filter__extra"><span>Мін. рідкість</span><select onChange={(event) => setDraft((value) => ({ ...value, minRarity: event.target.value }))} value={draft.minRarity}><option value="">Усі</option>{Object.entries(rarityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="admin-field admin-filter__extra"><span>Лімітована</span><select onChange={(event) => setDraft((value) => ({ ...value, limited: event.target.value }))} value={draft.limited}><option value="">Усі</option><option value="true">Так</option><option value="false">Ні</option></select></label>
        <label className="admin-field admin-filter__extra"><span>Сортування</span><select onChange={(event) => setDraft((value) => ({ ...value, sort: event.target.value }))} value={draft.sort}><option value="name:asc">Назва А–Я</option><option value="code:asc">Код А–Я</option><option value="ownedCopies:desc">Найпопулярніші</option><option value="ownedCopies:asc">Найрідші в гравців</option><option value="element:asc">Стихія</option></select></label>
        <div className="admin-filter__actions">
          <button className="admin-button" type="submit">Знайти</button>
          <button className="admin-button admin-button--secondary admin-filter-toggle" onClick={() => setFiltersOpen((value) => !value)} type="button">{filtersOpen ? "Менше" : "Фільтри"}</button>
          <button className="admin-button admin-button--ghost" onClick={() => apply(emptyFilters)} type="button">Скинути</button>
        </div>
      </form>

      <section className="admin-panel admin-panel--flush">
        {loading && !data ? <AdminLoading /> : error && !data ? <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} /> : data?.cards.length === 0 ? <AdminEmpty message="За цими фільтрами карт немає." /> : data ? <>
          <div className={`admin-table-wrap${loading ? " admin-table-wrap--updating" : ""}`}>
            <table className="admin-table">
              <thead><tr><th>Карта</th><th>Стихія</th><th>Мін. рідкість</th><th>Колекція</th><th>Статус</th><th className="is-num">У гравців</th></tr></thead>
              <tbody>{data.cards.map((card) => (
                <tr key={card.id}>
                  <td className="admin-td-title"><span className="admin-cell-main"><strong>{card.displayName ?? card.code}</strong><small title={card.description}>{card.code}{card.description ? ` · ${card.description}` : ""}</small></span></td>
                  <td data-label="Стихія"><span className="admin-element"><i className={`admin-fill--${card.element}`} />{elementLabels[card.element]}</span></td>
                  <td data-label="Мін. рідкість"><span className={`admin-rarity admin-rarity--${card.minRarity}`}>{rarityLabels[card.minRarity]}</span></td>
                  <td data-label="Колекція">{card.collectionName ?? <span className="admin-muted">—</span>}</td>
                  <td data-label="Статус"><span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>{card.limited ? <span className="admin-badge admin-badge--warn">Лімітована</span> : null}{card.shopEligible ? <span className="admin-badge admin-badge--info">Магазин</span> : null}<span className="admin-badge">{card.source}</span></span></td>
                  <td className="is-num" data-label="У гравців"><strong>{formatNumber(card.ownedCopies)}</strong></td>
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
