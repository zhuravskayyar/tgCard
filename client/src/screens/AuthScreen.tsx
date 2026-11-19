import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { TelegramLoginButton } from "../components/TelegramLoginButton";
import { AuthProviderIcon } from "../components/AuthProviderIcon";
import { ElementAmbientFx } from "../components/ElementAmbientFx";
import { ElementTitleFx } from "../components/ElementTitleFx";
import { setSessionToken } from "../auth/session";
import { getUiLocale, getPickerLocales, LANGUAGE_PICKER_ENABLED, setUiLocale, type UiLocale } from "../i18n";
import { isCrawlerAgent } from "../desktopFrame";

const LOCALE_LABELS: Readonly<Record<UiLocale, string>> = { en: "EN", uk: "UA", ru: "RU", de: "DE" };

/** The public start page for each language; the old in-game start screen is no longer shown to visitors. */
const LANDING_PATHS: Readonly<Record<UiLocale, string>> = { en: "/en/", uk: "/uk/", ru: "/ru/", de: "/de/" };

type EntryMode = "landing" | "start" | "login" | "screen";

/** How a logged-out browser visitor arrived: from the landing's "Start game" or "Player login", or directly (→ landing). */
function getEntryMode(isTelegramMiniApp: boolean): EntryMode {
  if (typeof window === "undefined" || isTelegramMiniApp || isCrawlerAgent()) return "screen";
  const params = new URLSearchParams(window.location.search);
  // Local development behaves like production; ?dev=1 still opens the old screen with the test accounts.
  if (import.meta.env.DEV && params.get("dev") === "1") return "screen";
  if (params.get("start") === "1") return "start";
  if (params.get("login") === "1") return "login";
  return "landing";
}

/** The landing replaces the whole tab, also when the game runs inside the desktop phone frame. */
function goToLanding() {
  const target = LANDING_PATHS[getUiLocale()];
  try {
    (window.top ?? window).location.replace(target);
  } catch {
    window.location.replace(target);
  }
}

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
  const [entryMode] = useState<EntryMode>(() => getEntryMode(isTelegramMiniApp));
  const [showAccountDialog, setShowAccountDialog] = useState(() => entryMode === "login");
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
    if (entryMode === "landing") {
      goToLanding();
      return;
    }
    // One-shot entry flags: a later logout or expired session must not start or open anything again.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("start") && !url.searchParams.has("login")) return;
    url.searchParams.delete("start");
    url.searchParams.delete("login");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [entryMode]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (entryMode !== "start" || autoStarted.current) return;
    autoStarted.current = true;
    void handleGuest();
  }, [entryMode, handleGuest]);

  const dialogWasOpen = useRef(false);
  useEffect(() => {
    if (entryMode !== "login") return;
    if (showAccountDialog) dialogWasOpen.current = true;
    else if (dialogWasOpen.current) goToLanding();
  }, [entryMode, showAccountDialog]);

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

  if (entryMode === "landing") return null;

  return (
    <main className={`auth-screen auth-screen--guest${entryMode === "start" && !error ? " auth-screen--auto-start" : ""}`}>
      <ElementAmbientFx />
      {isTelegramMiniApp || !LANGUAGE_PICKER_ENABLED ? null : (
        <nav aria-label="Language" className="auth-screen__languages">
          {getPickerLocales().map((locale) => (
            <button aria-pressed={locale === getUiLocale()} key={locale} onClick={() => setUiLocale(locale)} type="button">{LOCALE_LABELS[locale]}</button>
          ))}
        </nav>
      )}
      <div className="auth-screen__layout">
        <section className="auth-screen__hero" aria-labelledby="auth-screen-title">
          <div className="auth-screen__crest" aria-hidden="true">
            <img alt="" src="/assets/ui/auth/cardastika-logo.webp" />
          </div>
          <p className="auth-screen__eyebrow">СВІТОВЕ ДЕРЕВО</p>
          <h1 id="auth-screen-title"><ElementTitleFx>КАРДАСТІКА</ElementTitleFx></h1>
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

        {isTelegramMiniApp ? null : (
          <a className="auth-screen__guide-link" href={getUiLocale() === "uk" ? "/uk/guide/" : "/guide/"} target="_top">Про гру →</a>
        )}

        {isTelegramMiniApp ? null : (
          <section className="auth-screen__about" aria-labelledby="auth-about-title">
            <h2 id="auth-about-title">Cardastika — фентезійна карткова онлайн-гра</h2>
            <p>Кардастіка — безкоштовна гра у світі Світового Дерева. Грай у браузері або Telegram без завантаження: почни нову подорож без реєстрації або повернися до збереженого акаунта.</p>
            <p>Збери колоду з дев’яти карт, виставляй по три карти на поле та керуй стихіями вогню, води, повітря й землі. Враховуй переваги стихій і підбирай карти для перемоги в дуелях.</p>
            <p>Відкривай нові карти, поповнюй колекції, проходь пригоди кампанії та приєднуйся до гільдії. Розвивай колоду й досліджуй фентезійний світ у власному темпі.</p>
          </section>
        )}
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
