import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationTexts } from "../bot/notificationTexts.js";
import { TelegramApiError } from "../bot/telegramApi.js";
import { isSweepAuthorized } from "./notificationRoute.js";
import { createTelegramSender, NotificationRateLimitError } from "./notificationService.js";

function apiFailing(status: number, description: string) {
  return { sendMessage: async () => { throw new TelegramApiError("sendMessage", status, description); } };
}

test("the Telegram sender attaches a Play button only for an HTTPS Mini App", async () => {
  const calls: unknown[][] = [];
  const api = { sendMessage: async (...args: unknown[]) => { calls.push(args); return {} as never; } };
  assert.equal(await createTelegramSender(api, "https://cardastika.example").send("42", "hi", "PLAY"), "sent");
  assert.equal(await createTelegramSender(api, "http://localhost:5173").send("42", "hi", "PLAY"), "sent");
  assert.deepEqual(calls[0], [42, "hi", { inline_keyboard: [[{ text: "PLAY", web_app: { url: "https://cardastika.example" } }]] }]);
  assert.deepEqual(calls[1], [42, "hi", undefined]);
});

test("a blocked or never-started bot is reported as blocked, not as a failure", async () => {
  assert.equal(await createTelegramSender(apiFailing(403, "Forbidden: bot was blocked by the user"), null).send("1", "x", "P"), "blocked");
  assert.equal(await createTelegramSender(apiFailing(400, "Bad Request: chat not found"), null).send("1", "x", "P"), "blocked");
});

test("rate limits stop the sweep and other errors propagate", async () => {
  await assert.rejects(createTelegramSender(apiFailing(429, "Too Many Requests"), null).send("1", "x", "P"), NotificationRateLimitError);
  await assert.rejects(createTelegramSender(apiFailing(400, "Bad Request: message is too long"), null).send("1", "x", "P"), TelegramApiError);
});

test("the sweep route needs the exact bearer secret and stays closed without one", () => {
  assert.equal(isSweepAuthorized("Bearer s3cret", "s3cret"), true);
  assert.equal(isSweepAuthorized("Bearer wrong!", "s3cret"), false);
  assert.equal(isSweepAuthorized(undefined, "s3cret"), false);
  assert.equal(isSweepAuthorized("Bearer ", undefined), false);
});

test("notification texts fall back to Ukrainian for an unknown locale", () => {
  assert.equal(getNotificationTexts("xx").duelReady, getNotificationTexts("uk").duelReady);
  assert.match(getNotificationTexts("en").mail(3), /3/u);
});
