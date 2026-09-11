interface AdminPaginationProps {
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}

export function AdminPagination({ onPageChange, page, total, totalPages }: AdminPaginationProps) {
  if (totalPages <= 1) return <p className="admin-pagination__summary">Усього: {total.toLocaleString("uk-UA")}</p>;
  return (
    <nav aria-label="Пагінація" className="admin-pagination">
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">← Назад</button>
      <span>Сторінка <strong>{page}</strong> з {totalPages} · {total.toLocaleString("uk-UA")} записів</span>
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">Далі →</button>
    </nav>
  );
}
