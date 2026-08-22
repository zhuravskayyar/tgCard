function requireEnvironmentValue(name: "DATABASE_URL" | "TELEGRAM_BOT_TOKEN") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export interface ServerEnvironment {
  clientOrigin: string | null;
  databaseUrl: string;
  port: number;
  telegramBotToken: string;
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
    clientOrigin,
    databaseUrl: requireEnvironmentValue("DATABASE_URL"),
    port,
    telegramBotToken: requireEnvironmentValue("TELEGRAM_BOT_TOKEN"),
  };
}
