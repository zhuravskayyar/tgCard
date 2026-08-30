import type { AuthConfigResponse } from "@cardastika/shared";
import { getApiEndpoint } from "../api/config";

let authConfigPromise: Promise<AuthConfigResponse> | null = null;

function isAuthConfig(value: unknown): value is AuthConfigResponse {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return (config.googleClientId === null || typeof config.googleClientId === "string")
    && (config.telegramBotUsername === null || typeof config.telegramBotUsername === "string");
}

export function loadAuthConfig() {
  authConfigPromise ??= fetch(getApiEndpoint("/api/auth/config"), {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("auth_config_failed");
      const value: unknown = await response.json();
      if (!isAuthConfig(value)) throw new Error("invalid_auth_config");
      return value;
    })
    .catch((error: unknown) => {
      authConfigPromise = null;
      throw error;
    });
  return authConfigPromise;
}
