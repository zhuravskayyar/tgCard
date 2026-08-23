export interface TelegramWebApp {
  ready(): void;
  expand?(): void;
  close?(): void;
  openTelegramLink?(url: string): void;
  readonly colorScheme?: "light" | "dark";
  readonly initData: string;
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

  return (window as TelegramWindow).Telegram?.WebApp ?? null;
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
  const initData = webAppInitData || hashInitData;
  return initData || null;
}
