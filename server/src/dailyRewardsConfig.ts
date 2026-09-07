import type { LariskaDailyRewardSummary } from "@cardastika/shared";

export const DAILY_REWARD_MAX_STREAK = 30;

/** Currency amounts are server-owned; a missed UTC day resets the reward tier. */
export function getLariskaDailyReward(cycle: number, day: number): LariskaDailyRewardSummary & {
  kind: "currencies"; silver: number; gold: number; diamonds: number;
} {
  if (!Number.isSafeInteger(cycle) || cycle < 1 || !Number.isSafeInteger(day) || day < 1 || day > 7) {
    throw new RangeError("Lariska daily reward position is invalid");
  }
  const tier = Math.min(DAILY_REWARD_MAX_STREAK, (cycle - 1) * 7 + day);
  const silver = 500 * tier;
  const gold = tier + 1;
  const diamonds = Math.ceil(tier / 3);
  return {
    kind: "currencies", silver, gold, diamonds,
    label: `${silver} срібла · ${gold} золота · ${diamonds} ${diamonds === 1 ? "алмаз" : diamonds < 5 ? "алмази" : "алмазів"}`,
    description: tier === DAILY_REWARD_MAX_STREAK
      ? "Максимальна нагорода серії. Заходь щодня, щоб зберегти її."
      : "Кожен день поспіль збільшує нагороду. Пропуск дня починає серію заново.",
  };
}
