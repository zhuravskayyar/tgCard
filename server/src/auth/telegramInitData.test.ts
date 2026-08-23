import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { TelegramInitDataError, validateTelegramInitData, validateTelegramInitDataPayload } from "./telegramInitData.js";

const botToken = "123456:test-token";
const nowSeconds = 1_800_000_000;

function createSignedInitData(authDate = nowSeconds, startParam?: string) {
  const parameters = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "test-query",
    user: JSON.stringify({
      id: 7_654_321_012,
      first_name: "Test",
      username: "test_user",
    }),
  });
  if (startParam) parameters.set("start_param", startParam);
  const dataCheckString = [...parameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  parameters.set("hash", hash);
  return parameters.toString();
}

test("accepts valid Telegram initData and extracts its signed user", () => {
  const user = validateTelegramInitData(createSignedInitData(), botToken, { nowSeconds });

  assert.deepEqual(user, {
    id: "7654321012",
    username: "test_user",
    firstName: "Test",
    lastName: null,
    photoUrl: null,
  });
});

test("extracts only the signed Telegram start_param for referral acceptance", () => {
  const validated = validateTelegramInitDataPayload(
    createSignedInitData(nowSeconds, "ref_abcd1234"),
    botToken,
    { nowSeconds },
  );
  assert.equal(validated.startParam, "ref_abcd1234");
  assert.equal(validated.user.id, "7654321012");
});

test("rejects initData modified after signing", () => {
  const parameters = new URLSearchParams(createSignedInitData());
  parameters.set("user", JSON.stringify({ id: 1, first_name: "Modified" }));

  assert.throws(
    () => validateTelegramInitData(parameters.toString(), botToken, { nowSeconds }),
    (error) => error instanceof TelegramInitDataError && error.code === "invalid_signature",
  );
});

test("rejects expired signed initData", () => {
  const expiredAuthDate = nowSeconds - 86_401;

  assert.throws(
    () => validateTelegramInitData(createSignedInitData(expiredAuthDate), botToken, { nowSeconds }),
    (error) => error instanceof TelegramInitDataError && error.code === "expired_init_data",
  );
});
