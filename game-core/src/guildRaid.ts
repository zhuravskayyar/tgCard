export const GUILD_RAID_BASE_GOLD_REWARD = 50;
export const GUILD_RAID_BASE_SILVER_REWARD = 50_000;
export const GUILD_RAID_REWARD_CARD_LEVEL_OFFSET = 80;

/**
 * Currency rewards are intentionally flat for places 4–10. From place 11
 * onward the reward falls by ten percentage points, with place 11 starting at
 * 50% as agreed for the first raid reward pass.
 */
export function getGuildRaidCurrencyRewardPercentage(placement: number) {
  if (!Number.isSafeInteger(placement) || placement < 1) {
    throw new RangeError("Guild raid placement must be a positive integer");
  }
  if (placement <= 3) return 0;
  if (placement <= 10) return 100;
  return Math.max(0, 60 - (placement - 10) * 10);
}

export function calculateGuildRaidCurrencyReward(placement: number, raidLevel: number) {
  if (!Number.isSafeInteger(raidLevel) || raidLevel < 1 || raidLevel > 25) {
    throw new RangeError("Guild raid level must be between 1 and 25");
  }
  const percentage = getGuildRaidCurrencyRewardPercentage(placement);
  return {
    gold: Math.round(GUILD_RAID_BASE_GOLD_REWARD * raidLevel * percentage / 100),
    percentage,
    silver: Math.round(GUILD_RAID_BASE_SILVER_REWARD * raidLevel * percentage / 100),
  };
}
