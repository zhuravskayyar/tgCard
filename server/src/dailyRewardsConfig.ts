import type { CardRarity } from "@cardastika/shared";

export type LariskaDailyRewardDefinition =
  | {
      description: string;
      kind: "card";
      label: string;
      level: number;
      legendaryChancePct?: number;
      rarity: CardRarity;
    }
  | {
      description: string;
      kind: "equipment";
      label: string;
      rarity: CardRarity;
    }
  | {
      description: string;
      kind: "gold";
      label: string;
      maxAmount: number;
      minAmount: number;
    }
  | {
      description: string;
      kind: "arena_tokens_xp";
      label: string;
      arenaTokens: number;
      xp: number;
    }
  | {
      description: string;
      kind: "choice";
      label: string;
      optionKind: "card" | "big_trophy";
      rarity: CardRarity;
    };

export const LARISKA_STREAK_REWARDS = [
  { label: "Додаткова звичайна карта", threshold: 7 as const },
  { label: "+5 золота", threshold: 14 as const },
  { label: "Титул Лариски", threshold: 30 as const },
] as const;

const WEEKLY_REWARDS: Record<1 | 2 | 3 | 4, LariskaDailyRewardDefinition> = {
  1: {
    description: "Гарантована Epic-карта та невеликий шанс на Legendary.",
    kind: "card",
    label: "Скриня Лариски · Epic гарантовано",
    legendaryChancePct: 5,
    level: 20,
    rarity: "epic",
  },
  2: {
    description: "Epic-карта, шанс на Legendary і ще 15 золота.",
    kind: "card",
    label: "Скриня Лариски · Epic + 15 золота",
    legendaryChancePct: 5,
    level: 20,
    rarity: "epic",
  },
  3: {
    description: "Гарантований Epic-предмет для спорядження.",
    kind: "equipment",
    label: "Скриня Лариски · Epic спорядження",
    rarity: "epic",
  },
  4: {
    description: "Обери один великий трофей: Legendary, Epic спорядження або 30 золота.",
    kind: "choice",
    label: "Великий трофей Лариски",
    optionKind: "big_trophy",
    rarity: "legendary",
  },
};

export function getLariskaDailyReward(cycle: number, day: number): LariskaDailyRewardDefinition {
  if (!Number.isSafeInteger(cycle) || cycle < 1 || !Number.isSafeInteger(day) || day < 1 || day > 7) {
    throw new RangeError("Lariska daily reward position is invalid");
  }
  if (day === 1) return { description: "Безкоштовна звичайна карта для колоди.", kind: "card", label: "Безкоштовна звичайна карта", level: 1, rarity: "common" };
  if (day === 2) return { description: "Випадковий предмет спорядження, не нижче Uncommon.", kind: "equipment", label: "Скринька спорядження · Uncommon+", rarity: "uncommon" };
  if (day === 3) return { description: "Випадкова карта не нижче Rare.", kind: "card", label: "Випадкова карта · Rare+", level: 10, rarity: "rare" };
  if (day === 4) return { description: "Преміальна валюта без зайвих умов.", kind: "gold", label: "5–10 золота", maxAmount: 10, minAmount: 5 };
  if (day === 5) return { arenaTokens: 10, description: "Жетони Арени та трохи досвіду для наступного рівня.", kind: "arena_tokens_xp", label: "10 жетонів Арени + 250 XP", xp: 250 };
  if (day === 6) return { description: "Покажи смак: обери одну з трьох випадкових Rare-карт.", kind: "choice", label: "Вибери 1 з 3 · Rare+", optionKind: "card", rarity: "rare" };
  return WEEKLY_REWARDS[Math.min(cycle, 4) as 1 | 2 | 3 | 4]!;
}

export function getStreakReward(threshold: 7 | 14 | 30) {
  return LARISKA_STREAK_REWARDS.find((reward) => reward.threshold === threshold)!;
}
