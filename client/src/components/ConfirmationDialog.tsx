import { useEffect, useId, useRef, type ReactNode } from "react";

interface ConfirmationDialogProps {
  busy?: boolean;
  busyLabel?: string;
  cancelLabel?: string;
  confirmLabel: string;
  description: ReactNode;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  restoreFocusTargetRef?: { current: HTMLElement | null };
  title: string;
  variant?: "danger" | "primary";
}

export function ConfirmationDialog({
  busy = false,
  busyLabel,
  cancelLabel = "Скасувати",
  confirmLabel,
  description,
  error = null,
  onCancel,
  onConfirm,
  restoreFocusTargetRef,
  title,
  variant = "danger",
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!busyRef.current) {
          event.preventDefault();
          onCancelRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected && !previousFocus.matches(":disabled, [aria-disabled='true']") && previousFocus.getClientRects().length > 0) previousFocus.focus();
      else restoreFocusTargetRef?.current?.focus();
    };
  }, [restoreFocusTargetRef]);

  return (
    <div
      className="confirmation-backdrop"
      onMouseDown={(event) => {
        if (!busy && event.currentTarget === event.target) onCancel();
      }}
    >
      <div
        aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`confirmation-modal${variant === "primary" ? " confirmation-modal--primary" : ""}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="confirmation-modal__description" id={descriptionId}>{description}</div>
        {error ? <p className="confirmation-modal__error" id={errorId} role="alert">{error}</p> : null}
        <div className="confirmation-modal__actions">
          <button disabled={busy} onClick={onCancel} ref={cancelRef} type="button">{cancelLabel}</button>
          <button disabled={busy} onClick={onConfirm} type="button">{busy ? busyLabel ?? "Виконуємо…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
