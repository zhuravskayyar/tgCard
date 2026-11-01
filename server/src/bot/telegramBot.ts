import type { PlayerRepository } from "../users/playerRepository.js";
import { getBotTexts, type BotTexts } from "./botTexts.js";
import {
  ONBOARDING_CALLBACK,
  findAvailableOnboardingSlides,
  isStartCommand,
} from "./onboarding.js";
import type { InlineKeyboardMarkup, TelegramApiClient, TelegramMediaFile, TelegramUpdate } from "./telegramApi.js";

function introButton(texts: BotTexts): InlineKeyboardMarkup {
  return { inline_keyboard: [[{ text: texts.intro, callback_data: ONBOARDING_CALLBACK }]] };
}

function gameKeyboard(miniAppUrl: string, texts: BotTexts): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: texts.play, web_app: { url: miniAppUrl } }],
      [{ text: texts.about, callback_data: ONBOARDING_CALLBACK }],
    ],
  };
}

export interface TelegramBotDependencies {
  api: Pick<TelegramApiClient, "answerCallbackQuery" | "sendMediaGroup" | "sendMessage" | "sendPhoto">;
  miniAppUrl: string;
  players: Pick<PlayerRepository, "hasTelegramPlayer">;
  onboardingAssetDirectory?: string;
}

async function sendPresentation(chatId: number, texts: BotTexts, dependencies: TelegramBotDependencies) {
  const slides = await findAvailableOnboardingSlides(dependencies.onboardingAssetDirectory);
  const mediaFiles: TelegramMediaFile[] = slides.map(({ path, fileName, caption }) => ({ path, caption: texts.captions[fileName] ?? caption }));

  if (mediaFiles.length >= 2) {
    await dependencies.api.sendMediaGroup(chatId, mediaFiles);
  } else if (mediaFiles.length === 1) {
    const [singleFile] = mediaFiles;
    if (singleFile) await dependencies.api.sendPhoto(chatId, singleFile);
  } else {
    console.warn("Cardastika onboarding assets are not configured; using text fallback.");
    await dependencies.api.sendMessage(chatId, texts.fallback);
  }

  await dependencies.api.sendMessage(chatId, texts.final, gameKeyboard(dependencies.miniAppUrl, texts));
}

async function handleStart(chatId: number, telegramUserId: number, texts: BotTexts, dependencies: TelegramBotDependencies) {
  const existingPlayer = await dependencies.players.hasTelegramPlayer(String(telegramUserId));
  await dependencies.api.sendMessage(
    chatId,
    existingPlayer ? texts.returning : texts.welcome,
    existingPlayer ? gameKeyboard(dependencies.miniAppUrl, texts) : introButton(texts),
  );
}

export async function handleTelegramUpdate(update: TelegramUpdate, dependencies: TelegramBotDependencies) {
  const message = update.message;
  if (message?.chat.type === "private" && message.from && isStartCommand(message.text)) {
    await handleStart(message.chat.id, message.from.id, getBotTexts(message.from.language_code), dependencies);
    return;
  }

  const callbackQuery = update.callback_query;
  if (!callbackQuery || callbackQuery.data !== ONBOARDING_CALLBACK) return;

  await dependencies.api.answerCallbackQuery(callbackQuery.id);
  const chatId = callbackQuery.message?.chat.id;
  if (callbackQuery.message?.chat.type === "private" && chatId !== undefined) {
    await sendPresentation(chatId, getBotTexts(callbackQuery.from.language_code), dependencies);
  }
}
