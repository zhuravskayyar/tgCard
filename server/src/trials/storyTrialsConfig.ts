import type { StoryTrialNavigationTarget, StoryTrialReward } from "@cardastika/shared";

export const SAVE_PROFILE_TRIAL_ID = "save-profile";
export const SAVE_PROFILE_GOLD_REWARD = 500;

export interface StoryTrialDefinition {
  eventType?: "DUEL_WON" | "DUEL_FINISHED" | "SHOP_CARD_PURCHASED" | "CARD_LEVEL_UP";
  id: string;
  navigation: StoryTrialNavigationTarget;
  reward: StoryTrialReward;
  target: number;
  title: string;
}

const REGULAR_REWARD: StoryTrialReward = { gold: 1, silver: 100 };

export const STORY_TRIALS: readonly StoryTrialDefinition[] = [
  { eventType: "DUEL_WON", id: "first-duel-win", navigation: "duel", reward: REGULAR_REWARD, target: 1, title: "Виграй першу дуель" },
  { eventType: "DUEL_FINISHED", id: "play-duels", navigation: "duel", reward: REGULAR_REWARD, target: 10, title: "Зіграй 10 дуелей" },
  { eventType: "SHOP_CARD_PURCHASED", id: "buy-cards", navigation: "shop", reward: REGULAR_REWARD, target: 4, title: "Купи 4 карти в магазині" },
  { eventType: "CARD_LEVEL_UP", id: "upgrade-cards", navigation: "deck", reward: REGULAR_REWARD, target: 3, title: "Покращ карти 3 рази" },
  { id: SAVE_PROFILE_TRIAL_ID, navigation: "save-profile", reward: { gold: SAVE_PROFILE_GOLD_REWARD, silver: 0 }, target: 1, title: "Збережи ігровий профіль" },
];

export const STORY_TRIALS_INTRO = {
  caveName: "Печери гоблінів",
  text: [
    "Гобліни полонили мою сестру.",
    "Пройди всі випробування, щоб потрапити в Печери гоблінів і визволити її.",
  ],
  title: "Допоможи феям!",
};
