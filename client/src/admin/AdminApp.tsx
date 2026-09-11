import { useCallback, useEffect, useState } from "react";
import type { AdminIdentity } from "@cardastika/shared";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { TelegramLoginButton } from "../components/TelegramLoginButton";
import { setSessionToken } from "../auth/session";
import { usePlayerSummary } from "../hooks/usePlayerSummary";
import { initializeTelegram } from "../telegram";
import { authenticateGooglePlayer, authenticateTelegramWebPlayer, logoutPlayer } from "../telegram/authenticatePlayer";
import { AdminApiError, loadAdminSession } from "./adminApi";
import { AdminLayout, type AdminSection } from "./AdminLayout";
import { AdminAuditScreen } from "./screens/AdminAuditScreen";
import { AdminCardsScreen } from "./screens/AdminCardsScreen";
import { AdminDashboardScreen } from "./screens/AdminDashboardScreen";
import { AdminPlayerScreen } from "./screens/AdminPlayerScreen";
import { AdminPlayersScreen } from "./screens/AdminPlayersScreen";
import { AdminPlaceholderScreen } from "./screens/AdminPlaceholderScreen";
import "./admin.css";

type AdminRoute =
  | { section: "dashboard" }
  | { section: "players" }
  | { section: "player"; playerId: string }
  | { section: "cards" | "audit" | "shop" | "promos" | "events" | "settings" };

type SessionState =
  | { status: "idle" | "loading" }
  | { status: "ready"; admin: AdminIdentity }
  | { status: "denied" }
  | { status: "error"; message: string };

function readRoute(pathname: string): AdminRoute {
  const playerMatch = pathname.match(/^\/admin\/players\/([0-9a-f-]+)\/?$/i);
  if (playerMatch?.[1]) return { section: "player", playerId: playerMatch[1] };
  if (pathname === "/admin/players" || pathname === "/admin/players/") return { section: "players" };
  if (pathname === "/admin/cards" || pathname === "/admin/cards/") return { section: "cards" };
  if (pathname === "/admin/audit" || pathname === "/admin/audit/") return { section: "audit" };
  if (pathname === "/admin/shop" || pathname === "/admin/shop/") return { section: "shop" };
  if (pathname === "/admin/promos" || pathname === "/admin/promos/") return { section: "promos" };
  if (pathname === "/admin/events" || pathname === "/admin/events/") return { section: "events" };
  if (pathname === "/admin/settings" || pathname === "/admin/settings/") return { section: "settings" };
  return { section: "dashboard" };
}

function AdminLogin({ error, loading, onGoogle, onTelegram }: {
  error: string | null;
  loading: boolean;
  onGoogle: (credential: string) => void;
  onTelegram: (authData: Record<string, string>) => void;
}) {
  const [devAccounts, setDevAccounts] = useState<Array<{ key: string; label: string }>>([]);
  const [devError, setDevError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/dev/accounts", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ accounts: Array<{ key: string; label: string }> }> : null)
      .then((result) => { if (result) setDevAccounts(result.accounts); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const loginDevAccount = async (accountKey: string) => {
    const response = await fetch("/api/dev/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountKey }),
    });
    if (!response.ok) throw new Error("dev_login_failed");
    const result = await response.json() as { sessionToken?: string };
    if (!result.sessionToken) throw new Error("dev_login_failed");
    setSessionToken(result.sessionToken);
    window.location.reload();
  };
  return (
    <main className="admin-gate">
      <section className="admin-gate__card">
        <span className="admin-brand__mark admin-gate__mark">C</span>
        <p className="admin-eyebrow">CARDASTIKA CONTROL CENTER</p>
        <h1>Вхід для адміністратора</h1>
        <p>Увійдіть через прив’язаний Telegram-акаунт. Доступ перевіряє серверний whitelist — приховати кнопку в інтерфейсі недостатньо.</p>
        <div className="admin-gate__providers" aria-busy={loading}>
          <TelegramLoginButton disabled={loading} onAuth={onTelegram} />
          <GoogleSignInButton disabled={loading} onCredential={onGoogle} />
        </div>
        {devAccounts.length > 0 ? <label className="admin-field admin-gate__dev"><span>LOCAL DEV · тестовий акаунт</span><select defaultValue="" disabled={loading} onChange={(event) => { if (event.target.value) void loginDevAccount(event.target.value).catch(() => setDevError("Не вдалося увійти в локальний demo-акаунт.")); }}><option value="">Обрати demo-акаунт…</option>{devAccounts.map((account) => <option key={account.key} value={account.key}>{account.label}</option>)}</select></label> : null}
        {loading ? <span className="admin-gate__status"><span className="admin-spinner" /> Перевіряємо доступ…</span> : null}
        {error || devError ? <p className="admin-gate__error" role="alert">{error ?? devError}</p> : null}
        <a href="/">← Повернутися до гри</a>
      </section>
    </main>
  );
}

function AdminFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="admin-gate">
      <section className="admin-gate__card admin-gate__card--denied">
        <span className="admin-gate__lock">!</span>
        <p className="admin-eyebrow">ТИМЧАСОВА ПОМИЛКА</p>
        <h1>Адмін-панель недоступна</h1>
        <p>{message}</p>
        <button className="admin-button" onClick={onRetry} type="button">Спробувати ще</button>
        <a href="/">Повернутися до гри</a>
      </section>
    </main>
  );
}

export default function AdminApp() {
  const { retry, state: playerState } = usePlayerSummary();
  const [route, setRoute] = useState<AdminRoute>(() => readRoute(window.location.pathname));
  const [session, setSession] = useState<SessionState>({ status: "idle" });
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    initializeTelegram();
    document.documentElement.classList.add("admin-document");
    return () => document.documentElement.classList.remove("admin-document");
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoute(readRoute(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (playerState.status !== "ready") {
      setSession({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setSession({ status: "loading" });
    void loadAdminSession(controller.signal)
      .then(({ admin }) => setSession({ status: "ready", admin }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof AdminApiError && error.status === 403) setSession({ status: "denied" });
        else setSession({ status: "error", message: error instanceof Error ? error.message : "Не вдалося перевірити доступ" });
      });
    return () => controller.abort();
  }, [playerState.status]);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setRoute(readRoute(path));
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleLogin = useCallback(async (authenticate: () => Promise<unknown>) => {
    setLoginPending(true);
    setLoginError(null);
    try {
      await authenticate();
      retry();
    } catch {
      setLoginError("Не вдалося увійти. Перевірте акаунт і повторіть спробу.");
    } finally {
      setLoginPending(false);
    }
  }, [retry]);

  const handleLogout = useCallback(() => {
    void logoutPlayer().finally(() => window.location.reload());
  }, []);

  if (playerState.status === "loading" || session.status === "loading") {
    return <main className="admin-gate"><div className="admin-state admin-state--loading"><span className="admin-spinner" />Перевіряємо сесію…</div></main>;
  }
  if (playerState.status === "unauthenticated") {
    return <AdminLogin
      error={loginError}
      loading={loginPending}
      onGoogle={(credential) => { void handleLogin(() => authenticateGooglePlayer(credential, new AbortController().signal)); }}
      onTelegram={(authData) => { void handleLogin(() => authenticateTelegramWebPlayer(authData, new AbortController().signal)); }}
    />;
  }
  if (playerState.status === "error") {
    return <AdminFailure message={playerState.message ?? "Не вдалося завантажити профіль"} onRetry={retry} />;
  }
  if (playerState.status === "unavailable") {
    return <AdminFailure message="Сервер Cardastika тимчасово недоступний" onRetry={retry} />;
  }
  if (session.status === "denied") {
    return (
      <main className="admin-gate">
        <section className="admin-gate__card admin-gate__card--denied">
          <span className="admin-gate__lock">⌁</span><p className="admin-eyebrow">ДОСТУП ОБМЕЖЕНО</p>
          <h1>Цей акаунт не є адміністратором</h1>
          <p>Сервер не знайшов прив’язаний Telegram ID у змінній <code>ADMIN_TELEGRAM_USER_IDS</code>.</p>
          <button className="admin-button" onClick={handleLogout} type="button">Увійти іншим акаунтом</button>
          <a href="/">Повернутися до гри</a>
        </section>
      </main>
    );
  }
  if (session.status === "error") {
    return <AdminFailure message={session.message} onRetry={() => window.location.reload()} />;
  }
  if (session.status !== "ready") return null;

  let screen;
  switch (route.section) {
    case "dashboard": screen = <AdminDashboardScreen onNavigate={navigate} />; break;
    case "players": screen = <AdminPlayersScreen onNavigate={navigate} />; break;
    case "player": screen = <AdminPlayerScreen onNavigate={navigate} playerId={route.playerId} />; break;
    case "cards": screen = <AdminCardsScreen />; break;
    case "audit": screen = <AdminAuditScreen />; break;
    default: screen = <AdminPlaceholderScreen section={route.section} />;
  }

  return (
    <AdminLayout
      admin={session.admin}
      currentSection={route.section as AdminSection}
      mobileMenuOpen={mobileMenuOpen}
      onLogout={handleLogout}
      onMenuToggle={() => setMobileMenuOpen((open) => !open)}
      onNavigate={navigate}
    >
      {screen}
    </AdminLayout>
  );
}
