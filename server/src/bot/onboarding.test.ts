import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ONBOARDING_CALLBACK, ONBOARDING_SLIDES, isStartCommand } from "./onboarding.js";
import { handleTelegramUpdate } from "./telegramBot.js";

test("onboarding keeps the configured five-slide order", () => {
  assert.deepEqual(
    ONBOARDING_SLIDES.map(({ fileName }) => fileName),
    ["01-main.jpg", "02-cards.jpg", "03-battle.jpg", "04-guild.jpg", "05-profile.jpg"],
  );
  assert.equal(ONBOARDING_CALLBACK, "onboarding:intro");
});

test("start command accepts Telegram payloads and bot mentions", () => {
  assert.equal(isStartCommand("/start"), true);
  assert.equal(isStartCommand("/start ref_123"), true);
  assert.equal(isStartCommand("/start@cardastikabot"), true);
  assert.equal(isStartCommand("start"), false);
  assert.equal(isStartCommand("/profile"), false);
});

test("new players receive the presentation CTA", async () => {
  const messages: string[] = [];
  const api = {
    answerCallbackQuery: async () => true,
    sendMediaGroup: async () => [],
    sendMessage: async (_chatId: number, text: string) => {
      messages.push(text);
      return { chat: { id: 42, type: "private" } };
    },
    sendPhoto: async () => ({ chat: { id: 42, type: "private" } }),
  };

  await handleTelegramUpdate(
    { update_id: 1, message: { chat: { id: 42, type: "private" }, from: { id: 99 }, text: "/start" } },
    {
      api,
      miniAppUrl: "https://app.cardastika.org",
      onboardingAssetDirectory: "C:\\does-not-exist\\cardastika-onboarding",
      players: { hasTelegramPlayer: async () => false },
    },
  );

  assert.match(messages[0] ?? "", /Колекційна fantasy-гра/iu);
  assert.equal(messages.length, 1);
});

test("existing players receive the launch CTA without onboarding", async () => {
  const messages: string[] = [];
  const api = {
    answerCallbackQuery: async () => true,
    sendMediaGroup: async () => [],
    sendMessage: async (_chatId: number, text: string) => {
      messages.push(text);
      return { chat: { id: 42, type: "private" } };
    },
    sendPhoto: async () => ({ chat: { id: 42, type: "private" } }),
  };

  await handleTelegramUpdate(
    { update_id: 2, message: { chat: { id: 42, type: "private" }, from: { id: 99 }, text: "/start" } },
    {
      api,
      miniAppUrl: "https://app.cardastika.org",
      players: { hasTelegramPlayer: async () => true },
    },
  );

  assert.match(messages[0] ?? "", /З поверненням у Cardastika/iu);
  assert.equal(messages.length, 1);
});

test("available screenshots are sent as one media group before the launch CTA", async () => {
  const assetDirectory = await mkdtemp(join(tmpdir(), "cardastika-onboarding-"));
  const mediaGroups: string[][] = [];
  const messages: string[] = [];
  const api = {
    answerCallbackQuery: async () => true,
    sendMediaGroup: async (_chatId: number, files: Array<{ path: string }>) => {
      mediaGroups.push(files.map(({ path }) => path));
      return [];
    },
    sendMessage: async (_chatId: number, text: string) => {
      messages.push(text);
      return { chat: { id: 42, type: "private" } };
    },
    sendPhoto: async () => ({ chat: { id: 42, type: "private" } }),
  };

  try {
    await writeFile(join(assetDirectory, "01-main.jpg"), "real screenshot placeholder");
    await writeFile(join(assetDirectory, "02-cards.jpg"), "real screenshot placeholder");

    await handleTelegramUpdate(
      {
        update_id: 3,
        callback_query: {
          id: "callback-3",
          from: { id: 99 },
          data: ONBOARDING_CALLBACK,
          message: { chat: { id: 42, type: "private" } },
        },
      },
      {
        api,
        miniAppUrl: "https://app.cardastika.org",
        onboardingAssetDirectory: assetDirectory,
        players: { hasTelegramPlayer: async () => false },
      },
    );
  } finally {
    await rm(assetDirectory, { recursive: true, force: true });
  }

  assert.equal(mediaGroups.length, 1);
  assert.equal(mediaGroups[0]?.length, 2);
  assert.match(messages[0] ?? "", /Готовий увійти/iu);
});
