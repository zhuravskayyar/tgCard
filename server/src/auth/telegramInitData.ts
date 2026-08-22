import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const FUTURE_TOLERANCE_SECONDS = 30;

export type TelegramInitDataErrorCode =
  | "missing_init_data"
  | "invalid_init_data"
  | "invalid_signature"
  | "expired_init_data"
  | "missing_user";

export class TelegramInitDataError extends Error {
  constructor(public readonly code: TelegramInitDataErrorCode) {
    super(code);
    this.name = "TelegramInitDataError";
  }
}

export interface ValidatedTelegramUser {
  firstName: string;
  id: string;
  lastName: string | null;
  photoUrl: string | null;
  username: string | null;
}

interface ValidationOptions {
  maxAgeSeconds?: number;
  nowSeconds?: number;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTelegramUser(rawUser: string | null): ValidatedTelegramUser {
  if (!rawUser) {
    throw new TelegramInitDataError("missing_user");
  }

  let value: unknown;
  try {
    value = JSON.parse(rawUser);
  } catch {
    throw new TelegramInitDataError("missing_user");
  }

  if (!value || typeof value !== "object") {
    throw new TelegramInitDataError("missing_user");
  }

  const user = value as Record<string, unknown>;
  const firstName = getOptionalString(user.first_name);

  if (!Number.isSafeInteger(user.id) || Number(user.id) <= 0 || !firstName) {
    throw new TelegramInitDataError("missing_user");
  }

  return {
    id: String(user.id),
    username: getOptionalString(user.username),
    firstName,
    lastName: getOptionalString(user.last_name),
    photoUrl: getOptionalString(user.photo_url),
  };
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  options: ValidationOptions = {},
): ValidatedTelegramUser {
  if (!initData.trim()) {
    throw new TelegramInitDataError("missing_init_data");
  }

  const parameters = new URLSearchParams(initData);
  const uniqueParameters = new Map<string, string>();

  for (const [key, value] of parameters) {
    if (uniqueParameters.has(key)) {
      throw new TelegramInitDataError("invalid_init_data");
    }
    uniqueParameters.set(key, value);
  }

  const receivedHash = uniqueParameters.get("hash");
  if (!receivedHash || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    throw new TelegramInitDataError("invalid_signature");
  }

  uniqueParameters.delete("hash");
  const dataCheckString = [...uniqueParameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const receivedHashBuffer = Buffer.from(receivedHash, "hex");

  if (receivedHashBuffer.length !== calculatedHash.length || !timingSafeEqual(receivedHashBuffer, calculatedHash)) {
    throw new TelegramInitDataError("invalid_signature");
  }

  const authDate = Number(uniqueParameters.get("auth_date"));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    throw new TelegramInitDataError("invalid_init_data");
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;

  if (authDate > nowSeconds + FUTURE_TOLERANCE_SECONDS || nowSeconds - authDate > maxAgeSeconds) {
    throw new TelegramInitDataError("expired_init_data");
  }

  return parseTelegramUser(uniqueParameters.get("user") ?? null);
}
