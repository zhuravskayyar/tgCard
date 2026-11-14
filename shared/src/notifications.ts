/** Notification types a player can switch on or off (docs/notifications.md). */
export const NOTIFICATION_KINDS = ["duelReady", "mail", "guild", "announcements", "winback"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_LOCALES = ["uk", "en", "de", "ru"] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

export type NotificationPreferences = Record<NotificationKind, boolean>;

export interface NotificationSettingsResponse {
  preferences: NotificationPreferences;
  /** The bot can only write to players with a linked Telegram account. */
  telegramLinked: boolean;
  /** Telegram refused delivery (the bot was blocked or never started). */
  telegramBlocked: boolean;
}

export interface NotificationSettingsUpdate {
  preferences?: Partial<NotificationPreferences>;
  locale?: NotificationLocale;
}
