export function AdminLoading({ label = "Завантажуємо дані…" }: { label?: string }) {
  return <div aria-live="polite" className="admin-state admin-state--loading"><span className="admin-spinner" />{label}</div>;
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="admin-state admin-state--error" role="alert">
      <strong>Не вдалося завантажити дані</strong>
      <span>{message}</span>
      {onRetry ? <button className="admin-button admin-button--secondary" onClick={onRetry} type="button">Спробувати ще</button> : null}
    </div>
  );
}

export function AdminEmpty({ message }: { message: string }) {
  return <div className="admin-state"><strong>Поки порожньо</strong><span>{message}</span></div>;
}
