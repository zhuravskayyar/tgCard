import { useEffect, useRef, useState } from "react";
import { useAuthConfig } from "../auth/useAuthConfig";
import { AuthProviderIcon } from "./AuthProviderIcon";
import { getUiLocale } from "../i18n";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
          renderButton(element: HTMLElement, options: Record<string, string | number>): void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  appearance?: "default" | "landing";
  clientId?: string | null;
  disabled?: boolean;
  onCredential: (credential: string) => void;
}

type ProviderState = "error" | "loading" | "ready";

let googleScriptPromise: Promise<boolean> | null = null;

function loadGoogleScript() {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (googleScriptPromise) return googleScriptPromise;

  document.querySelector<HTMLScriptElement>('script[data-cardastika-google="true"]')?.remove();
  googleScriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(loaded && Boolean(window.google?.accounts?.id));
    };
    const timeoutId = window.setTimeout(() => finish(false), 10_000);
    script.async = true;
    script.defer = true;
    script.dataset.cardastikaGoogle = "true";
    script.src = "https://accounts.google.com/gsi/client";
    script.addEventListener("load", () => finish(true), { once: true });
    script.addEventListener("error", () => finish(false), { once: true });
    document.head.appendChild(script);
  }).then((loaded) => {
    if (!loaded) googleScriptPromise = null;
    return loaded;
  });
  return googleScriptPromise;
}

function buttonClass(appearance: "default" | "landing") {
  return `auth-provider-button${appearance === "landing" ? " auth-provider-button--landing auth-provider-button--google" : ""}`;
}

export function GoogleSignInButton({ appearance = "default", clientId: configuredClientId, disabled, onCredential }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const [attempt, setAttempt] = useState(0);
  const [providerState, setProviderState] = useState<ProviderState>("loading");
  const authConfig = useAuthConfig();
  const clientId = configuredClientId?.trim() || authConfig.config?.googleClientId?.trim() || import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!clientId || disabled) return;
    let active = true;
    let resizeObserver: ResizeObserver | null = null;
    setProviderState("loading");
    void loadGoogleScript().then((loaded) => {
      const googleIdentity = window.google?.accounts?.id;
      if (!active) return;
      if (!loaded || !containerRef.current || !googleIdentity) {
        setProviderState("error");
        return;
      }
      try {
        googleIdentity.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            const normalized = credential?.trim();
            if (normalized) onCredentialRef.current(normalized);
          },
        });
        const container = containerRef.current;
        let renderedWidth = 0;
        const renderButton = () => {
          // Google draws its own button inside an iframe: render it at the real container width
          // (Google allows 200–400 px) so it is never stretched or cropped.
          const width = Math.max(200, Math.min(400, Math.floor(container.clientWidth)));
          if (width <= 0 || width === renderedWidth) return;
          renderedWidth = width;
          container.replaceChildren();
          googleIdentity.renderButton(container, {
            locale: getUiLocale(),
            theme: "filled_black",
            size: "large",
            width,
            shape: "rectangular",
          });
        };
        renderButton();
        resizeObserver = new ResizeObserver(renderButton);
        resizeObserver.observe(container);
        setProviderState("ready");
      } catch {
        setProviderState("error");
      }
    });
    return () => {
      active = false;
      resizeObserver?.disconnect();
    };
  }, [appearance, attempt, clientId, disabled]);

  if (disabled) {
    return <button className={buttonClass(appearance)} disabled type="button">Вхід виконується…</button>;
  }
  if (!clientId && authConfig.loading) {
    return <button className={buttonClass(appearance)} disabled type="button">Завантаження Google…</button>;
  }
  if (!clientId) {
    return <button className={buttonClass(appearance)} disabled type="button">Google-вхід не налаштовано</button>;
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
        Повторити Google-вхід
      </button>
    );
  }
  if (appearance === "landing") {
    return (
      <div aria-busy={providerState !== "ready"} className="auth-provider-shell auth-provider-shell--google">
        <span className="auth-provider-visual">
          <AuthProviderIcon provider="google" />
          <span>{providerState === "ready" ? "Продовжити через Google" : "Завантаження Google…"}</span>
        </span>
        <div className="google-sign-in google-sign-in--landing" ref={containerRef} />
      </div>
    );
  }
  return <div aria-busy={providerState !== "ready"} className="google-sign-in" ref={containerRef} />;
}
