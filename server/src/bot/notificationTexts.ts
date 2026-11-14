import type { NotificationLocale } from "@cardastika/shared";

/** Bot messages for the notification sweep. Kept with the bot texts, which are not part of the UI translator. */
export interface NotificationTexts {
  play: string;
  duelReady: string;
  mail: (count: number) => string;
  guild: (author: string, guildName: string) => string;
  winback: string;
}

const TEXTS: Readonly<Record<NotificationLocale, NotificationTexts>> = {
  uk: {
    play: "ГРАТИ",
    duelReady: "⚔️ Перерва закінчилась — дуелі знову доступні!",
    mail: (count) => `✉️ Нова пошта: ${count}. Забери її в грі.`,
    guild: (author, guildName) => `🛡 ${author} пише в чаті гільдії «${guildName}».`,
    winback: "🌳 Світове Дерево сумує без тебе. Твоя колода чекає на бій!",
  },
  en: {
    play: "PLAY",
    duelReady: "⚔️ The break is over — duels are available again!",
    mail: (count) => `✉️ New mail: ${count}. Collect it in the game.`,
    guild: (author, guildName) => `🛡 ${author} wrote in the «${guildName}» guild chat.`,
    winback: "🌳 The World Tree misses you. Your deck is waiting for battle!",
  },
  de: {
    play: "SPIELEN",
    duelReady: "⚔️ Die Pause ist vorbei — Duelle sind wieder verfügbar!",
    mail: (count) => `✉️ Neue Post: ${count}. Hol sie dir im Spiel ab.`,
    guild: (author, guildName) => `🛡 ${author} schreibt im Gildenchat «${guildName}».`,
    winback: "🌳 Der Weltenbaum vermisst dich. Dein Deck wartet auf den Kampf!",
  },
  ru: {
    play: "ИГРАТЬ",
    duelReady: "⚔️ Перерыв закончился — дуэли снова доступны!",
    mail: (count) => `✉️ Новая почта: ${count}. Забери её в игре.`,
    guild: (author, guildName) => `🛡 ${author} пишет в чате гильдии «${guildName}».`,
    winback: "🌳 Мировое Древо скучает без тебя. Твоя колода ждёт боя!",
  },
};

export function getNotificationTexts(locale: string | null | undefined): NotificationTexts {
  return TEXTS[(locale ?? "uk") as NotificationLocale] ?? TEXTS.uk;
}
