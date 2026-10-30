import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { TelegramLoginButton } from "../components/TelegramLoginButton";
import { AuthProviderIcon } from "../components/AuthProviderIcon";
import { ElementAmbientFx } from "../components/ElementAmbientFx";
import { setSessionToken } from "../auth/session";

interface AuthScreenProps {
  error: string | null;
  isTelegramMiniApp: boolean;
  loading: boolean;
  onGuest: () => Promise<void>;
  onGoogle: (credential: string) => Promise<void>;
  onTelegram: (authData: Record<string, string>) => Promise<void>;
  onTelegramMiniApp: () => Promise<void> | undefined;
}

export function AuthScreen({
  error,
  isTelegramMiniApp,
  loading,
  onGuest,
  onGoogle,
  onTelegram,
  onTelegramMiniApp,
}: AuthScreenProps) {
  const [pending, setPending] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [devAccounts, setDevAccounts] = useState<Array<{ key: string; label: string }>>([]);
  const dialogRef = useRef<HTMLElement>(null);
  const busy = loading || pending;

  const runAuth = useCallback(async (action: () => Promise<unknown> | undefined) => {
    if (busy) return;
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }, [busy]);

  const handleGuest = useCallback(() => runAuth(onGuest), [onGuest, runAuth]);
  const handleGoogle = useCallback((credential: string) => runAuth(() => onGoogle(credential)), [onGoogle, runAuth]);
  const handleTelegram = useCallback((authData: Record<string, string>) => runAuth(() => onTelegram(authData)), [onTelegram, runAuth]);
  const handleMiniAppTelegram = useCallback(() => runAuth(onTelegramMiniApp), [onTelegramMiniApp, runAuth]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void fetch("/api/dev/accounts")
      .then((response) => response.ok ? response.json() as Promise<{ accounts: Array<{ key: string; label: string }> }> : null)
      .then((result) => { if (result) setDevAccounts(result.accounts); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!showAccountDialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialTarget = dialogRef.current?.querySelector<HTMLElement>("button:not(:disabled), iframe, [tabindex='0']");
    (initialTarget ?? dialogRef.current)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        setShowAccountDialog(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), iframe, [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])",
      )].filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [busy, showAccountDialog]);

  const closeAccountDialog = useCallback(() => {
    if (busy) return;
    setShowAccountDialog(false);
  }, [busy]);

  const handleDevLogin = useCallback(async (accountKey: string) => {
    if (!accountKey || busy) return;
    setPending(true);
    try {
      const response = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey }),
      });
      if (!response.ok) return;
      const result = await response.json() as { sessionToken?: string };
      if (result.sessionToken) {
        setSessionToken(result.sessionToken);
        window.location.reload();
      }
    } finally {
      setPending(false);
    }
  }, [busy]);

  return (
    <main className="auth-screen auth-screen--guest">
      <ElementAmbientFx />
      <div className="auth-screen__layout">
        <section className="auth-screen__hero" aria-labelledby="auth-screen-title">
          <div className="auth-screen__crest" aria-hidden="true">
            <img alt="" src="/assets/ui/auth/cardastika-logo.webp" />
          </div>
          <p className="auth-screen__eyebrow">СВІТОВЕ ДЕРЕВО</p>
          <h1 id="auth-screen-title">КАРДАСТІКА</h1>
          <p className="auth-screen__subtitle">Світ чотирьох стихій чекає на тебе. Збери свою колоду. Відкрий світ.</p>
        </section>

        <section className="auth-screen__login-panel" aria-label="Початок гри">
          <button className="auth-screen__start-button" disabled={busy} onClick={() => void handleGuest()} type="button">
            {busy ? "Створюємо твою подорож…" : "Почати нову гру"}
          </button>
          <button
            className="auth-screen__return-button"
            disabled={busy}
            onClick={() => setShowAccountDialog(true)}
            type="button"
          >
            У мене вже є акаунт
          </button>
          {busy ? <p className="auth-screen__status" role="status">Зберігаємо профіль на сервері…</p> : null}
          {error ? <p className="auth-screen__error" role="alert">{error}</p> : null}
          {devAccounts.length > 0 ? <label className="auth-screen__dev-login">LOCAL DEV · тестовий акаунт<select aria-label="Тестовий локальний акаунт" disabled={busy} defaultValue="" onChange={(event) => { void handleDevLogin(event.target.value); }}><option value="">Обрати demo-акаунт…</option>{devAccounts.map((account) => <option key={account.key} value={account.key}>{account.label}</option>)}</select></label> : null}
          <p className="auth-screen__note">Можна грати без реєстрації. Прогрес неприв’язаного профілю можна втратити після очищення браузера або переходу на інший пристрій.</p>
        </section>
      </div>
      <p className="auth-screen__footer">CARDASTIKA · СВІТ ЧОТИРЬОХ СТИХІЙ</p>

      {showAccountDialog ? (
        <div className="auth-screen__dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeAccountDialog(); }} role="presentation">
          <section
            aria-labelledby="auth-return-title"
            aria-modal="true"
            className="auth-screen__account-dialog"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <button aria-label="Закрити" className="auth-screen__dialog-close" disabled={busy} onClick={closeAccountDialog} type="button">×</button>
            <p className="auth-screen__eyebrow">ПОВЕРНЕННЯ ДО ГРИ</p>
            <h2 id="auth-return-title">Увійти в акаунт</h2>
            <p className="auth-screen__dialog-copy">Віднови збережений прогрес через спосіб входу, який прив’язаний до твого профілю.</p>
            <div aria-busy={busy} className="auth-screen__providers">
              {isTelegramMiniApp
                ? <button className="auth-provider-button auth-provider-button--landing auth-provider-button--telegram" disabled={busy} onClick={() => void handleMiniAppTelegram()} type="button"><AuthProviderIcon provider="telegram" />{busy ? "Вхід виконується…" : "Продовжити через Telegram"}</button>
                : <TelegramLoginButton appearance="landing" disabled={busy} onAuth={handleTelegram} />}
              <GoogleSignInButton appearance="landing" disabled={busy} onCredential={handleGoogle} />
            </div>
            {busy ? <p className="auth-screen__status" role="status">Перевіряємо акаунт…</p> : null}
            <button className="auth-screen__dialog-cancel" disabled={busy} onClick={closeAccountDialog} type="button">Скасувати</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
