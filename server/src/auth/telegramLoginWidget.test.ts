import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { TelegramWidgetAuthError, validateTelegramLoginWidget } from "./telegramLoginWidget.js";

const botToken = "123456:test-token";
const now = 1_800_000_000;

function signedWidgetData() {
  const authData: Record<string, string> = {
    allows_write_to_pm: "true",
    auth_date: String(now),
    first_name: "Telegram Player",
    id: "105",
    username: "tg_player",
  };
  const dataCheckString = Object.entries(authData)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const signed: Record<string, string> = {
    ...authData,
    hash: createHmac("sha256", secretKey).update(dataCheckString).digest("hex"),
  };
  return signed;
}

test("Telegram web login verifies the widget signature", () => {
  const identity = validateTelegramLoginWidget(signedWidgetData(), botToken, now);
  assert.equal(identity.provider, "telegram");
  assert.equal(identity.providerUserId, "105");
});

test("Telegram web login includes every provider-signed field in HMAC verification", () => {
  const data = signedWidgetData();
  delete data.allows_write_to_pm;
  assert.throws(
    () => validateTelegramLoginWidget(data, botToken, now),
    (error) => error instanceof TelegramWidgetAuthError && error.code === "invalid_telegram_login",
  );
});

test("Telegram web login rejects tampered widget data", () => {
  const data = signedWidgetData();
  data.first_name = "Someone else";
  assert.throws(
    () => validateTelegramLoginWidget(data, botToken, now),
    (error) => error instanceof TelegramWidgetAuthError && error.code === "invalid_telegram_login",
  );
});
