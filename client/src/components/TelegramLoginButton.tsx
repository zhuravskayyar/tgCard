import { useEffect, useRef, useState } from "react";
import { useAuthConfig } from "../auth/useAuthConfig";
import { AuthProviderIcon } from "./AuthProviderIcon";

interface TelegramWidgetUser {
  [key: string]: unknown;
  auth_date: number;
  first_name: string;
  hash: string;
  id: number;
  last_name?: string;
  photo_url?: string;
  username?: string;
}

interface TelegramLoginButtonProps {
  appearance?: "default" | "landing";
  botUsername?: string | null;
  disabled?: boolean;
  onAuth: (authData: Record<string, string>) => void;
}

type ProviderState = "error" | "loading" | "ready";

function buttonClass(appearance: "default" | "landing") {
  return `auth-provider-button${appearance === "landing" ? " auth-provider-button--landing auth-provider-button--telegram" : ""}`;
}

export function TelegramLoginButton({ appearance = "default", botUsername: configuredBotUsername, disabled, onAuth }: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  const [attempt, setAttempt] = useState(0);
  const [providerState, setProviderState] = useState<ProviderState>("loading");
  const authConfig = useAuthConfig();
  const botUsername = configuredBotUsername?.trim() || authConfig.config?.telegramBotUsername?.trim() || import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim() || "";

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    if (!botUsername || disabled || !containerRef.current || typeof document === "undefined") return;
    const container = containerRef.current;
    const callbackName = `cardastikaTelegramAuth_${Math.random().toString(36).slice(2)}`;
    const windowWithCallback = window as unknown as Window & Record<string, unknown>;
    let settled = false;
    const finish = (state: ProviderState) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      setProviderState(state);
    };

    setProviderState("loading");
    windowWithCallback[callbackName] = (user: TelegramWidgetUser) => {
      const authData: Record<string, string> = {};
      for (const [key, value] of Object.entries(user)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          authData[key] = String(value);
        }
      }
      onAuthRef.current(authData);
    };

    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => finish("error"), 10_000);
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.dataset.telegramLogin = botUsername;
    script.dataset.size = "large";
    script.dataset.onauth = `${callbackName}(user)`;
    script.addEventListener("load", () => finish("ready"), { once: true });
    script.addEventListener("error", () => finish("error"), { once: true });
    container.replaceChildren(script);

    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
      delete windowWithCallback[callbackName];
      container.replaceChildren();
    };
  }, [attempt, botUsername, disabled]);

  if (disabled) {
    return <button className={buttonClass(appearance)} disabled type="button">Вхід виконується…</button>;
  }
  if (!botUsername && authConfig.loading) {
    return <button className={buttonClass(appearance)} disabled type="button">Завантаження Telegram…</button>;
  }
  if (!botUsername) {
    return <button className={buttonClass(appearance)} disabled type="button">Telegram-вхід не налаштовано</button>;
  }
  if (providerState === "error") {
    return (
      <button
        className={buttonClass(appearance)}
        onClick={() => {
          setProviderState("loading");
          setAttempt((current) => current + 1);
        }}
        type="button"
      >
        Повторити Telegram-вхід
      </button>
    );
  }
  if (appearance === "landing") {
    return (
      <div aria-busy={providerState !== "ready"} className="auth-provider-shell auth-provider-shell--telegram">
        <span className="auth-provider-visual">
          <AuthProviderIcon provider="telegram" />
          <span>{providerState === "ready" ? "Продовжити через Telegram" : "Завантаження Telegram…"}</span>
        </span>
        <div className="telegram-login telegram-login--landing" ref={containerRef} />
      </div>
    );
  }
  return <div aria-busy={providerState !== "ready"} className="telegram-login" ref={containerRef} />;
}
