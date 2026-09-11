import type { AdminPlayerListItem, CardElement, CardRarity } from "@cardastika/shared";

export const rarityLabels: Record<CardRarity, string> = {
  common: "Звичайна",
  uncommon: "Незвичайна",
  rare: "Рідкісна",
  epic: "Епічна",
  legendary: "Легендарна",
  mythic: "Міфічна",
};

export const elementLabels: Record<CardElement, string> = {
  air: "Повітря",
  earth: "Земля",
  fire: "Вогонь",
  water: "Вода",
};

export function playerName(player: Pick<AdminPlayerListItem, "firstName" | "lastName" | "nickname" | "username">) {
  return player.nickname || [player.firstName, player.lastName].filter(Boolean).join(" ") || (player.username ? `@${player.username}` : "Без імені");
}

export function formatNumber(value: number) {
  return value.toLocaleString("uk-UA");
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatAction(action: string) {
  return ({
    PLAYER_ADD_SILVER: "Додано срібло",
    PLAYER_REMOVE_SILVER: "Знято срібло",
    PLAYER_ADD_GOLD: "Додано золото",
    PLAYER_REMOVE_GOLD: "Знято золото",
    PLAYER_LEVEL_CHANGE: "Змінено рівень",
    PLAYER_ADD_CARD: "Додано карту",
    PLAYER_REMOVE_CARD: "Видалено карту",
  } as Record<string, string>)[action] ?? action;
}
