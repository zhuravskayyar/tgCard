interface PaginationProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages: number;
}

type PaginationItem = number | "ellipsis-left" | "ellipsis-right";

function getItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: PaginationItem[] = [];
  ordered.forEach((page, index) => {
    const previous = ordered[index - 1];
    if (previous && page - previous > 1) result.push(index === 1 ? "ellipsis-left" : "ellipsis-right");
    result.push(page);
  });
  return result;
}

export function Pagination({ currentPage, onPageChange, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Сторінки карт" className="card-pagination">
      <button aria-label="Попередня сторінка" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} type="button">‹</button>
      {getItems(currentPage, totalPages).map((item) => typeof item === "number" ? (
        <button
          aria-current={item === currentPage ? "page" : undefined}
          key={item}
          onClick={() => onPageChange(item)}
          type="button"
        >{item}</button>
      ) : <span aria-hidden="true" key={item}>…</span>)}
      <button aria-label="Наступна сторінка" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} type="button">›</button>
    </nav>
  );
}
