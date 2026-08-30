import { getSessionToken } from "../auth/session";

export interface TelegramWebApp {
  ready(): void;
  expand?(): void;
  close?(): void;
  openTelegramLink?(url: string): void;
  readonly colorScheme?: "light" | "dark";
  readonly initData: string;
  readonly initDataUnsafe?: {
    readonly user?: {
      readonly language_code?: string;
    };
  };
}

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") {
    return null;
  }

  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  return webApp?.initData?.trim() ? webApp : null;
}

function normalizeLanguageCode(languageCode: string | undefined) {
  return languageCode?.trim().toLowerCase().replace("_", "-").split("-")[0] ?? "";
}

/**
 * Russian is intentionally automatic and Telegram-only. The device/browser
 * language is checked first; Telegram's user language is a fallback for
 * clients that do not expose navigator language information.
 */
export function isRussianTelegramLanguage() {
  const webApp = getTelegramWebApp();
  if (!webApp) return false;

  if (typeof navigator !== "undefined") {
    const browserLanguage = navigator.languages?.[0] || navigator.language;
    const normalizedBrowserLanguage = normalizeLanguageCode(browserLanguage);
    if (normalizedBrowserLanguage) return normalizedBrowserLanguage === "ru";
  }

  return normalizeLanguageCode(webApp.initDataUnsafe?.user?.language_code) === "ru";
}

export function initializeTelegram(): TelegramWebApp | null {
  const webApp = getTelegramWebApp();
  webApp?.ready();
  return webApp;
}

export function getTelegramInitData(): string | null {
  const webAppInitData = getTelegramWebApp()?.initData.trim();
  const hashInitData = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.hash.replace(/^#/, "")).get("tgWebAppData")?.trim();
  const initData = getSessionToken() || webAppInitData || hashInitData;
  return initData || null;
}

export function getRawTelegramInitData(): string | null {
  const webAppInitData = getTelegramWebApp()?.initData.trim();
  const hashInitData = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.hash.replace(/^#/, "")).get("tgWebAppData")?.trim();
  return webAppInitData || hashInitData || null;
}

export function getPlayerAuthHeader(credential: string) {
  return getSessionToken() === credential ? `Bearer ${credential}` : `tma ${credential}`;
}
