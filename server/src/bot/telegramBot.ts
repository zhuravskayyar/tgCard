import type { PlayerRepository } from "../users/playerRepository.js";
import {
  ONBOARDING_CALLBACK,
  ONBOARDING_FINAL,
  ONBOARDING_FALLBACK,
  ONBOARDING_RETURNING,
  ONBOARDING_WELCOME,
  findAvailableOnboardingSlides,
  isStartCommand,
} from "./onboarding.js";
import type { InlineKeyboardMarkup, TelegramApiClient, TelegramMediaFile, TelegramUpdate } from "./telegramApi.js";

const INTRO_BUTTON: InlineKeyboardMarkup = {
  inline_keyboard: [[{ text: "Почати знайомство", callback_data: ONBOARDING_CALLBACK }]],
};

function gameKeyboard(miniAppUrl: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "ГРАТИ", web_app: { url: miniAppUrl } }],
      [{ text: "Про гру", callback_data: ONBOARDING_CALLBACK }],
    ],
  };
}

export interface TelegramBotDependencies {
  api: Pick<TelegramApiClient, "answerCallbackQuery" | "sendMediaGroup" | "sendMessage" | "sendPhoto">;
  miniAppUrl: string;
  players: Pick<PlayerRepository, "hasTelegramPlayer">;
  onboardingAssetDirectory?: string;
}

async function sendPresentation(chatId: number, dependencies: TelegramBotDependencies) {
  const slides = await findAvailableOnboardingSlides(dependencies.onboardingAssetDirectory);
  const mediaFiles: TelegramMediaFile[] = slides.map(({ path, caption }) => ({ path, caption }));

  if (mediaFiles.length >= 2) {
    await dependencies.api.sendMediaGroup(chatId, mediaFiles);
  } else if (mediaFiles.length === 1) {
    const [singleFile] = mediaFiles;
    if (singleFile) await dependencies.api.sendPhoto(chatId, singleFile);
  } else {
    console.warn("Cardastika onboarding assets are not configured; using text fallback.");
    await dependencies.api.sendMessage(chatId, ONBOARDING_FALLBACK);
  }

  await dependencies.api.sendMessage(chatId, ONBOARDING_FINAL, gameKeyboard(dependencies.miniAppUrl));
}

async function handleStart(chatId: number, telegramUserId: number, dependencies: TelegramBotDependencies) {
  const existingPlayer = await dependencies.players.hasTelegramPlayer(String(telegramUserId));
  await dependencies.api.sendMessage(
    chatId,
    existingPlayer ? ONBOARDING_RETURNING : ONBOARDING_WELCOME,
    existingPlayer ? gameKeyboard(dependencies.miniAppUrl) : INTRO_BUTTON,
  );
}

export async function handleTelegramUpdate(update: TelegramUpdate, dependencies: TelegramBotDependencies) {
  const message = update.message;
  if (message?.chat.type === "private" && message.from && isStartCommand(message.text)) {
    await handleStart(message.chat.id, message.from.id, dependencies);
    return;
  }

  const callbackQuery = update.callback_query;
  if (!callbackQuery || callbackQuery.data !== ONBOARDING_CALLBACK) return;

  await dependencies.api.answerCallbackQuery(callbackQuery.id);
  const chatId = callbackQuery.message?.chat.id;
  if (callbackQuery.message?.chat.type === "private" && chatId !== undefined) {
    await sendPresentation(chatId, dependencies);
  }
}
