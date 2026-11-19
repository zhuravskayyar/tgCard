import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

interface Toast { id: number; kind: "error" | "success"; text: string }
interface ConfirmRequest {
  confirmLabel: string;
  danger: boolean;
  message: string;
  resolve: (confirmed: boolean) => void;
  title: string;
}
export interface ConfirmOptions { confirmLabel?: string; danger?: boolean; message: string; title: string }

interface FeedbackContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (kind: Toast["kind"], text: string) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function AdminFeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((items) => [...items.slice(-2), { id, kind, text }]);
    window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
  }, [dismiss]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setRequest({ confirmLabel: options.confirmLabel ?? "Підтвердити", danger: options.danger ?? false, message: options.message, resolve, title: options.title });
  }), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!request || !dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      // Very old WebViews without <dialog>: fall back to the native confirm.
      const confirmed = window.confirm(`${request.title}\n\n${request.message}`);
      request.resolve(confirmed);
      setRequest(null);
    }
  }, [request]);

  const close = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
    dialogRef.current?.close();
  };

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="admin-toasts">
        {toasts.map((item) => (
          <div className={`admin-toast admin-toast--${item.kind}`} key={item.id} role={item.kind === "error" ? "alert" : "status"}>
            <span>{item.text}</span>
            <button aria-label="Закрити" onClick={() => dismiss(item.id)} type="button">×</button>
          </div>
        ))}
      </div>
      <dialog className="admin-dialog" onCancel={(event) => { event.preventDefault(); close(false); }} ref={dialogRef}>
        {request ? (
          <form method="dialog" onSubmit={(event) => { event.preventDefault(); close(true); }}>
            <h2>{request.title}</h2>
            <p>{request.message}</p>
            <div className="admin-dialog__actions">
              <button className="admin-button admin-button--secondary" onClick={() => close(false)} type="button">Скасувати</button>
              <button autoFocus className={`admin-button${request.danger ? " admin-button--danger" : ""}`} type="submit">{request.confirmLabel}</button>
            </div>
          </form>
        ) : null}
      </dialog>
    </FeedbackContext.Provider>
  );
}

export function useAdminFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useAdminFeedback must be used inside AdminFeedbackProvider");
  return value;
}
