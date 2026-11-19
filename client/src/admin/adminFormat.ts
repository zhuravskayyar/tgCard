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

export function formatLastSeen(value: string | null) {
  if (!value) return "Не зафіксовано";
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "—";
  if (elapsed < 60_000) return "щойно";
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)} хв тому`;
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))} год тому`;
  return formatDate(value);
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

export function initials(name: string) {
  const parts = name.replace(/^@/, "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "??";
}

export function formatDayLabel(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${Number(day)}.${month}`;
}

export function formatTime(value: Date) {
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(value);
}

export function formatPercent(part: number, total: number) {
  if (total <= 0) return "0%";
  const value = part / total * 100;
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

export const providerLabels: Record<string, string> = {
  google: "Google",
  guest: "Гість",
  telegram: "Telegram",
};

export const guildRoleLabels: Record<string, string> = {
  leader: "Лідер",
  member: "Учасник",
  newbie: "Новачок",
  officer: "Офіцер",
  veteran: "Ветеран",
};

export const auditFieldLabels: Record<string, string> = {
  accountXp: "Досвід",
  cardCode: "Код карти",
  cardId: "Карта",
  currency: "Валюта",
  delta: "Зміна",
  instanceId: "Екземпляр",
  instanceIds: "Екземпляри",
  removedInstanceId: "Видалений екземпляр",
  gold: "Золото",
  level: "Рівень",
  quantity: "Кількість",
  silver: "Срібло",
};

/** Builds a CSV file (UTF-8 BOM so Excel opens Cyrillic correctly) and downloads it. */
export function downloadCsv(fileName: string, header: string[], rows: Array<Array<string | number | null>>) {
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
