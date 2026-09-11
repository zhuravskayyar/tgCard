function requireEnvironmentValue(name: "DATABASE_URL" | "TELEGRAM_BOT_TOKEN") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const OWNER_TELEGRAM_USER_ID = "521834372";

export interface ServerEnvironment {
  adminTelegramUserIds: readonly string[];
  clientOrigin: string | null;
  databaseUrl: string;
  googleClientId: string | null;
  port: number;
  telegramBotToken: string;
  telegramBotUsername: string | null;
}

function readAdminTelegramUserIds() {
  const raw = process.env.ADMIN_TELEGRAM_USER_IDS?.trim();
  if (!raw) return [OWNER_TELEGRAM_USER_ID];
  const ids = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (ids.some((value) => !/^\d+$/.test(value))) {
    throw new Error("ADMIN_TELEGRAM_USER_IDS must contain comma-separated Telegram user IDs");
  }
  return ids.includes(OWNER_TELEGRAM_USER_ID) ? [OWNER_TELEGRAM_USER_ID] : [];
}

export function getServerEnvironment(): ServerEnvironment {
  const rawPort = process.env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 3000;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }

  const rawClientOrigin = process.env.CLIENT_ORIGIN?.trim();
  let clientOrigin: string | null = null;

  if (rawClientOrigin) {
    const parsedOrigin = new URL(rawClientOrigin);
    if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== rawClientOrigin.replace(/\/$/, "")) {
      throw new Error("CLIENT_ORIGIN must be an HTTP(S) origin without a path");
    }
    clientOrigin = parsedOrigin.origin;
  }

  return {
    adminTelegramUserIds: readAdminTelegramUserIds(),
    clientOrigin,
    databaseUrl: requireEnvironmentValue("DATABASE_URL"),
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    port,
    telegramBotToken: requireEnvironmentValue("TELEGRAM_BOT_TOKEN"),
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME?.trim()
      || process.env.VITE_TELEGRAM_BOT_USERNAME?.trim()
      || null,
  };
}
