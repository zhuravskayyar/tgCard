export interface BattlePassThreshold {
  circle: number;
  threshold: number;
}

export function getNextBattlePassThreshold(progress: number, thresholds: readonly BattlePassThreshold[]) {
  return thresholds.find(({ threshold }) => threshold > progress)?.threshold ?? null;
}

export function isBattlePassMilestoneClaimable(
  progress: number,
  threshold: number,
  claimed: boolean,
) {
  return !claimed && progress >= threshold;
}

export function isBattlePassCircleComplete(
  milestones: readonly { claimed: boolean; reward: unknown }[],
) {
  return milestones.every(({ claimed, reward }) => reward === null || claimed);
}
