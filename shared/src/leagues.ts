export type LeagueDivision = "III" | "II" | "I";
export type LeagueMatchResult = "win" | "loss";

export interface LeagueDefinition {
  accentColor: string;
  baseSilver: number;
  division: LeagueDivision;
  iconKey: string;
  index: number;
  key: string;
  maxRating: number | null;
  minRating: number;
  name: string;
  promotionReward: number;
}

export interface LeagueConfig {
  divisionRatingStep: number;
  lossRating: number;
  leagues: readonly LeagueDefinition[];
  winRating: number;
}

export interface LeagueProgressionResult {
  highestLeagueIndexAfter: number;
  isNewLeagueReached: boolean;
  leagueAfter: LeagueDefinition;
  leagueBefore: LeagueDefinition;
  promotionReward: number;
  ratingAfter: number;
  ratingBefore: number;
  ratingChange: number;
  silverReward: number;
  totalSilverEarned: number;
}

const LEAGUE_SEEDS = [
  { iconKey: "traveler", key: "traveler", name: "Мандрівник", accentColor: "#8f9aa6", baseSilver: [100, 120, 150], promotionReward: [0, 1_000, 2_000] },
  { iconKey: "seeker", key: "seeker", name: "Шукач", accentColor: "#67b783", baseSilver: [200, 250, 300], promotionReward: [3_000, 4_000, 5_000] },
  { iconKey: "guardian", key: "guardian", name: "Вартовий", accentColor: "#5d9ed1", baseSilver: [400, 450, 500], promotionReward: [6_000, 7_000, 8_000] },
  { iconKey: "conqueror", key: "conqueror", name: "Підкорювач", accentColor: "#9a72c7", baseSilver: [600, 650, 700], promotionReward: [10_000, 15_000, 20_000] },
  { iconKey: "champion", key: "champion", name: "Чемпіон", accentColor: "#d6ae4f", baseSilver: [800, 850, 900], promotionReward: [30_000, 40_000, 50_000] },
  { iconKey: "master", key: "master", name: "Майстер", accentColor: "#c7655b", baseSilver: [1_000, 1_200, 1_500], promotionReward: [70_000, 80_000, 100_000] },
  { iconKey: "ruler", key: "ruler", name: "Володар", accentColor: "#c64d54", baseSilver: [2_000, 2_200, 2_500], promotionReward: [120_000, 150_000, 200_000] },
] as const;

const DIVISIONS: readonly LeagueDivision[] = ["III", "II", "I"];

export const DUEL_LEAGUE_CONFIG: LeagueConfig = Object.freeze({
  divisionRatingStep: 100,
  winRating: 25,
  lossRating: -15,
  leagues: Object.freeze(LEAGUE_SEEDS.flatMap((league, leagueIndex) => (
    DIVISIONS.map((division, divisionIndex) => ({
      accentColor: league.accentColor,
      baseSilver: league.baseSilver[divisionIndex]!,
      division,
      iconKey: league.iconKey,
      index: leagueIndex * DIVISIONS.length + divisionIndex,
      key: `${league.key}_${divisionIndex === 0 ? "3" : divisionIndex === 1 ? "2" : "1"}`,
      maxRating: leagueIndex === LEAGUE_SEEDS.length - 1 && divisionIndex === DIVISIONS.length - 1
        ? null
        : (leagueIndex * DIVISIONS.length + divisionIndex + 1) * 100 - 1,
      minRating: (leagueIndex * DIVISIONS.length + divisionIndex) * 100,
      name: `${league.name} ${division}`,
      promotionReward: league.promotionReward[divisionIndex]!,
    }))
  ))),
});

function assertRating(rating: number, field = "Rating") {
  if (!Number.isSafeInteger(rating) || rating < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
}

function assertLeagueIndex(index: number, config: LeagueConfig) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= config.leagues.length) {
    throw new RangeError("League index is outside the configured range");
  }
}

export function getLeagueByRating(rating: number, config: LeagueConfig = DUEL_LEAGUE_CONFIG) {
  assertRating(rating);
  const league = [...config.leagues].reverse().find(({ minRating }) => rating >= minRating);
  if (!league) throw new RangeError("League config must contain a league starting at rating 0");
  return league;
}

export function getLeagueIndexByRating(rating: number, config: LeagueConfig = DUEL_LEAGUE_CONFIG) {
  return getLeagueByRating(rating, config).index;
}

export function getBaseSilverForLeague(index: number, config: LeagueConfig = DUEL_LEAGUE_CONFIG) {
  assertLeagueIndex(index, config);
  return config.leagues[index]!.baseSilver;
}

export function getPromotionReward(index: number, config: LeagueConfig = DUEL_LEAGUE_CONFIG) {
  assertLeagueIndex(index, config);
  return config.leagues[index]!.promotionReward;
}

export function calcDuelRatingChange(result: LeagueMatchResult, config: LeagueConfig = DUEL_LEAGUE_CONFIG) {
  return result === "win" ? config.winRating : config.lossRating;
}

export function calcDuelSilverReward(input: {
  currentLeagueIndex: number;
  result: LeagueMatchResult;
  rewardMultiplier?: number;
  silverBonus?: number;
}, config: LeagueConfig = DUEL_LEAGUE_CONFIG) {
  const silverBonus = input.silverBonus ?? 0;
  const rewardMultiplier = input.rewardMultiplier ?? 1;
  if (!Number.isFinite(silverBonus) || silverBonus < 0) throw new RangeError("Silver bonus must be non-negative");
  if (!Number.isFinite(rewardMultiplier) || rewardMultiplier < 0) throw new RangeError("Reward multiplier must be non-negative");
  const baseSilver = getBaseSilverForLeague(input.currentLeagueIndex, config);
  const outcomeMultiplier = input.result === "win" ? 1 : 0.5;
  return Math.round(baseSilver * outcomeMultiplier * (1 + silverBonus) * rewardMultiplier);
}

export function applyLeagueProgression(input: {
  highestLeagueIndex: number;
  ratingBefore: number;
  result: LeagueMatchResult;
  rewardMultiplier?: number;
  silverBonus?: number;
}, config: LeagueConfig = DUEL_LEAGUE_CONFIG): LeagueProgressionResult {
  assertRating(input.ratingBefore, "Rating before");
  assertLeagueIndex(input.highestLeagueIndex, config);
  const ratingChange = calcDuelRatingChange(input.result, config);
  const ratingAfter = Math.max(0, input.ratingBefore + ratingChange);
  const leagueBefore = getLeagueByRating(input.ratingBefore, config);
  const leagueAfter = getLeagueByRating(ratingAfter, config);
  const isNewLeagueReached = leagueAfter.index > input.highestLeagueIndex;
  const promotionReward = isNewLeagueReached ? getPromotionReward(leagueAfter.index, config) : 0;
  const silverReward = calcDuelSilverReward({
    currentLeagueIndex: leagueBefore.index,
    result: input.result,
    rewardMultiplier: input.rewardMultiplier,
    silverBonus: input.silverBonus,
  }, config);

  return {
    highestLeagueIndexAfter: Math.max(input.highestLeagueIndex, leagueAfter.index),
    isNewLeagueReached,
    leagueAfter,
    leagueBefore,
    promotionReward,
    ratingAfter,
    ratingBefore: input.ratingBefore,
    ratingChange,
    silverReward,
    totalSilverEarned: silverReward + promotionReward,
  };
}
