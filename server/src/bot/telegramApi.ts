import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface TelegramUser {
  id: number;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramMediaFile {
  path: string;
  caption: string;
}

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly status: number,
    description: string,
  ) {
    super(`Telegram API ${method} failed: ${description}`);
    this.name = "TelegramApiError";
  }
}

export class TelegramApiClient {
  private readonly baseUrl: string;

  constructor(token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, body: Record<string, unknown> | FormData = {}): Promise<T> {
    const isMultipart = body instanceof FormData;
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: isMultipart ? undefined : { "Content-Type": "application/json" },
      body: isMultipart ? body : JSON.stringify(body),
    });

    let payload: TelegramApiResponse<T> | null = null;
    try {
      payload = await response.json() as TelegramApiResponse<T>;
    } catch {
      throw new TelegramApiError(method, response.status, "invalid response");
    }

    if (!response.ok || !payload.ok || payload.result === undefined) {
      throw new TelegramApiError(method, response.status, payload.description ?? "unknown error");
    }

    return payload.result;
  }

  getMe() {
    return this.call<{ id: number; username?: string }>("getMe");
  }

  getUpdates(offset: number | undefined, timeoutSeconds: number) {
    return this.call<TelegramUpdate[]>("getUpdates", {
      ...(offset === undefined ? {} : { offset }),
      timeout: timeoutSeconds,
      allowed_updates: ["message", "callback_query"],
    });
  }

  answerCallbackQuery(callbackQueryId: string) {
    return this.call<boolean>("answerCallbackQuery", { callback_query_id: callbackQueryId });
  }

  sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup) {
    return this.call<TelegramMessage>("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async sendPhoto(chatId: number, file: TelegramMediaFile) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", file.caption);
    form.set("photo", new Blob([await readFile(file.path)]), basename(file.path));
    return this.call<TelegramMessage>("sendPhoto", form);
  }

  async sendMediaGroup(chatId: number, files: TelegramMediaFile[]) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    const media = files.map((file, index) => ({
      type: "photo",
      media: `attach://photo_${index}`,
      caption: file.caption,
    }));
    form.set("media", JSON.stringify(media));

    for (const [index, file] of files.entries()) {
      form.set(`photo_${index}`, new Blob([await readFile(file.path)]), basename(file.path));
    }

    return this.call<TelegramMessage[]>("sendMediaGroup", form);
  }
}
