import { isDeckPowerInMatchmakingRange, type MatchmakingRange, type RandomSource } from "@cardastika/game-core";

export interface MatchmakingCandidate {
  effectiveDeckPower: number;
  playerId: string;
  validDeck: boolean;
}

export function selectMatchmakingCandidate<T extends MatchmakingCandidate>(
  challengerId: string,
  range: MatchmakingRange,
  candidates: readonly T[],
  random: RandomSource,
): T | null {
  const eligible = candidates.filter((candidate) => (
    candidate.playerId !== challengerId
    && candidate.validDeck
    && isDeckPowerInMatchmakingRange(candidate.effectiveDeckPower, range)
  ));
  if (eligible.length === 0) return null;
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError("Random source must return a value from 0 inclusive to 1 exclusive");
  }
  return eligible[Math.floor(randomValue * eligible.length)]!;
}
