import { formatNumber } from "./adminFormat";

interface AdminPaginationProps {
  limit?: number;
  onLimitChange?: (limit: number) => void;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZES = [25, 50, 100];

export function AdminPagination({ limit, onLimitChange, onPageChange, page, total, totalPages }: AdminPaginationProps) {
  const from = limit ? Math.min(total, (page - 1) * limit + 1) : null;
  const to = limit ? Math.min(total, page * limit) : null;
  return (
    <nav aria-label="Пагінація" className="admin-pagination">
      <span>{from && to ? <>{formatNumber(from)}–{formatNumber(to)} з <strong>{formatNumber(total)}</strong></> : <>Усього: <strong>{formatNumber(total)}</strong></>}</span>
      <div className="admin-pagination__controls">
        {limit && onLimitChange ? (
          <label><span className="admin-sr-only">Рядків на сторінці</span>
            <select onChange={(event) => onLimitChange(Number(event.target.value))} value={limit}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / стор.</option>)}
            </select>
          </label>
        ) : null}
        {totalPages > 1 ? <>
          <button aria-label="Попередня сторінка" className="admin-button admin-button--secondary admin-button--sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">←</button>
          <span>{page} / {totalPages}</span>
          <button aria-label="Наступна сторінка" className="admin-button admin-button--secondary admin-button--sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">→</button>
        </> : null}
      </div>
    </nav>
  );
}
