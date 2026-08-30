import type { BattlePassReward } from "@cardastika/shared";

export const BATTLE_PASS_CIRCLES = [
  { circle: 1, thresholds: [50, 100, 150, 200, 250, 300, 400] },
] as const;

const FREE_REWARDS_BY_CIRCLE: readonly (readonly (BattlePassReward | null)[])[] = [
  [
    { durationHours: 24, kind: "boost", label: "×2 срібла та золота · 24 години", multiplier: 2 },
    null,
    { kind: "silver", amount: 3_500_000, label: "3,5 млн срібла" },
    null,
    { kind: "gold", amount: 350, label: "350 золота" },
    null,
    { kind: "card", label: "Випадкова карта", levelSource: "lowest_deck" },
  ],
];

export interface BattlePassMilestoneConfig {
  circle: number;
  id: string;
  reward: BattlePassReward | null;
  threshold: number;
}

export const BATTLE_PASS_MILESTONES: readonly BattlePassMilestoneConfig[] = BATTLE_PASS_CIRCLES.flatMap(({ circle, thresholds }) =>
  thresholds.map((threshold, index) => {
    const rewards = FREE_REWARDS_BY_CIRCLE[circle - 1];
    if (!rewards) throw new Error(`Battle pass rewards for circle ${circle} are missing`);
    return {
      circle,
      id: `circle-${circle}-${threshold}`,
      reward: rewards[index] ? cloneReward(rewards[index]!) : null,
      threshold,
    };
  }));

export const DAILY_TASKS = [
  { eventType: "DUEL_WON", id: "win-duels", rewardDiamonds: 1, target: 20, title: "Виграйте 20 дуелей" },
  { eventType: "DUEL_FINISHED", id: "play-duels", rewardDiamonds: 1, target: 30, title: "Проведіть 30 дуелей" },
  { eventType: "CARD_ACQUIRED", id: "acquire-cards", rewardDiamonds: 1, target: 3, title: "Отримайте 3 карти" },
  { eventType: "CARD_ABSORBED", id: "absorb-cards", rewardDiamonds: 1, target: 10, title: "Поглиніть 10 карт" },
  { eventType: "SHOP_CARD_PURCHASED", id: "buy-cards", rewardDiamonds: 2, target: 5, title: "Придбайте 5 карт" },
  { eventType: "CARD_LEVEL_UP", id: "upgrade-card", rewardDiamonds: 1, target: 1, title: "Покращте бойову карту 1 раз" },
] as const;

function cloneReward(reward: BattlePassReward): BattlePassReward {
  return reward.kind === "card"
    ? { ...reward }
    : { ...reward };
}

export function getBattlePassMilestone(id: string) {
  return BATTLE_PASS_MILESTONES.find((milestone) => milestone.id === id) ?? null;
}

export function getDailyTask(id: string) {
  return DAILY_TASKS.find((task) => task.id === id) ?? null;
}

export function getSeasonWindow(now: Date) {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    endsAt,
    seasonId: `${startsAt.getUTCFullYear()}-${String(startsAt.getUTCMonth() + 1).padStart(2, "0")}`,
    startsAt,
  };
}

export function getDayWindow(now: Date) {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + 1);
  return {
    endsAt,
    taskDate: startsAt.toISOString().slice(0, 10),
    startsAt,
  };
}
