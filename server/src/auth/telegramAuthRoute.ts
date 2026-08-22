import type { IncomingMessage, ServerResponse } from "node:http";
import type { TelegramAuthRequest } from "@cardastika/shared";
import { HttpRequestError, readJsonBody, sendJson } from "../http/json.js";
import { PlayerPersistenceError, type PlayerRepository } from "../users/playerRepository.js";
import { TelegramInitDataError, validateTelegramInitData } from "./telegramInitData.js";

interface TelegramAuthDependencies {
  botToken: string;
  players: PlayerRepository;
}

function isTelegramAuthRequest(value: unknown): value is TelegramAuthRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const initData = (value as Record<string, unknown>).initData;
  return typeof initData === "string" && Boolean(initData.trim());
}

export async function handleTelegramAuth(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TelegramAuthDependencies,
) {
  try {
    const body = await readJsonBody(request);
    if (!isTelegramAuthRequest(body)) {
      throw new HttpRequestError(400, "missing_init_data", "initData is required");
    }

    const telegramUser = validateTelegramInitData(body.initData, dependencies.botToken);
    const player = await dependencies.players.findOrCreateFromTelegram(telegramUser);
    sendJson(response, 200, player);
  } catch (error) {
    if (error instanceof HttpRequestError) {
      sendJson(response, error.status, { error: { code: error.code, message: error.message } });
      return;
    }

    if (error instanceof TelegramInitDataError) {
      const status = error.code === "missing_init_data" ? 400 : 401;
      sendJson(response, status, {
        error: { code: error.code, message: "Telegram authentication failed" },
      });
      return;
    }

    if (error instanceof PlayerPersistenceError) {
      console.error("Database unavailable during Telegram player bootstrap");
      sendJson(response, 503, {
        error: { code: "database_unavailable", message: "Player service is unavailable" },
      });
      return;
    }

    console.error("Unexpected Telegram player bootstrap failure");
    sendJson(response, 500, {
      error: { code: "internal_error", message: "Unexpected server failure" },
    });
  }
}
