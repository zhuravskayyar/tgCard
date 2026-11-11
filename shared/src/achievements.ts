export const ACHIEVEMENT_STATISTIC_KEYS = [
  "duelWins",
  "duelTop100",
  "duelChampion",
  "arenaWins",
  "arenaMageWins",
  "arenaTop100",
  "arenaChampion",
  "tournamentChampion",
  "urfinBossDamage",
  "urfinSuperStrikes",
  "urfinCardRewards",
  "urfinDamageRank",
  "guildGold",
  "guildElementDonations",
  "guildDragonHunts",
  "guildWarKeys",
  "guildWarParticipation",
  "guildExperience",
  "witchVictories",
  "deckPower",
  "completedCollections",
  "completedChestShops",
  "marathonWins",
  "giftsSent",
  "giftsReceived",
  "forgedItems",
  "forgedArtifacts",
] as const;

export type AchievementStatisticKey = (typeof ACHIEVEMENT_STATISTIC_KEYS)[number];

/** A null value means the game mode does not record that statistic yet. */
export interface PlayerAchievementProgressResponse {
  statistics: Record<AchievementStatisticKey, number | null>;
}
