import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { VerifiedIdentity } from "./identity.js";

let botUsernamePromise: Promise<string | null> | null = null;

const MAX_AGE_SECONDS = 24 * 60 * 60;

export class TelegramWidgetAuthError extends Error {
  constructor(public readonly code: "invalid_telegram_login" | "expired_telegram_login") {
    super(code);
    this.name = "TelegramWidgetAuthError";
  }
}

export async function resolveTelegramBotUsername(botToken: string, configuredUsername: string | null = null) {
  const configured = configuredUsername?.trim();
  if (configured) return configured;
  if (!botToken.trim()) return null;
  botUsernamePromise ??= fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as { ok?: boolean; result?: { username?: string } };
      return payload.ok && payload.result?.username?.trim() ? payload.result.username.trim() : null;
    })
    .catch(() => null);
  return botUsernamePromise;
}

export function validateTelegramLoginWidget(
  authData: Record<string, string>,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedIdentity {
  const hash = authData.hash?.trim();
  const authDate = Number(authData.auth_date);
  const id = authData.id?.trim();
  const firstName = authData.first_name?.trim();
  if (!hash || !/^[a-f\d]{64}$/i.test(hash) || !id || !/^\d+$/.test(id) || !firstName || !Number.isSafeInteger(authDate)) {
    throw new TelegramWidgetAuthError("invalid_telegram_login");
  }
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > MAX_AGE_SECONDS) {
    throw new TelegramWidgetAuthError("expired_telegram_login");
  }

  const dataCheckString = Object.entries(authData)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(hash, "hex");
  if (receivedHash.length !== calculatedHash.length || !timingSafeEqual(receivedHash, calculatedHash)) {
    throw new TelegramWidgetAuthError("invalid_telegram_login");
  }

  return {
    provider: "telegram",
    providerUserId: id,
    email: null,
    firstName,
    lastName: authData.last_name?.trim() || null,
    photoUrl: authData.photo_url?.trim() || null,
  };
}
