export const CARD_ELEMENTS = ["fire", "water", "air", "earth"] as const;

export type CardElement = (typeof CARD_ELEMENTS)[number];

export const CARD_SOURCES = ["standard", "raid"] as const;

export type CardSource = (typeof CARD_SOURCES)[number];

export const CARD_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;

export type CardRarity = (typeof CARD_RARITIES)[number];

export interface CardHoloConfig {
  enabled: boolean;
  interactive: boolean;
  intensity: number;
  mask: "green-chroma";
  palette: "cool" | "magic" | "warm";
  preset: "holo" | "magic";
  speed: number;
  threshold: number;
}

const CARD_HOLO_CONFIGS: Readonly<Record<string, CardHoloConfig>> = Object.freeze({
  plague_alchemy_03: Object.freeze({
    enabled: true,
    interactive: true,
    intensity: 1,
    mask: "green-chroma",
    palette: "magic",
    preset: "magic",
    speed: 0.18,
    threshold: 40,
  }),
  plague_alchemy_08: Object.freeze({
    enabled: true,
    interactive: true,
    intensity: 1,
    mask: "green-chroma",
    palette: "warm",
    preset: "holo",
    speed: 0.18,
    threshold: 40,
  }),
  plague_alchemy_07: Object.freeze({
    enabled: true,
    interactive: true,
    intensity: 1,
    mask: "green-chroma",
    palette: "cool",
    preset: "holo",
    speed: 0.18,
    threshold: 40,
  }),
  plague_alchemy_09: Object.freeze({
    enabled: true,
    interactive: true,
    intensity: 1,
    mask: "green-chroma",
    palette: "magic",
    preset: "magic",
    speed: 0.18,
    threshold: 40,
  }),
});

export function getCardHoloConfig(cardId: string | null | undefined): CardHoloConfig | undefined {
  if (!cardId) return undefined;
  return CARD_HOLO_CONFIGS[cardId];
}

export interface CardDefinition {
  artKey: string | null;
  code: string;
  collectionId: string | null;
  description: string;
  displayName: string | null;
  element: CardElement;
  id: string;
  limited?: boolean;
  minRarity: CardRarity;
  holo?: CardHoloConfig;
  shopEligible: boolean;
  source?: CardSource;
}

export interface PlayerCardInstance {
  artKey: string | null;
  basePower: number;
  bonusPower: number;
  cardId: string;
  code: string;
  collectionId: string | null;
  displayName: string | null;
  element: CardElement;
  finalPower: number;
  instanceId: string;
  level: number;
  levelProgressElements: number;
  limited?: boolean;
  protectedFromAbsorption: boolean;
  rarity: CardRarity;
  storedElements: number;
}

export type PlayerCard = PlayerCardInstance;

export interface PlayerCardsResponse {
  cards: PlayerCardInstance[];
}

export interface WeakPlayerCardsResponse {
  cards: PlayerCardInstance[];
  page: number;
  pageSize: 9;
  totalCards: number;
  totalPages: number;
}

export type CardUpgradeAvailability =
  | "ready"
  | "insufficient_elements"
  | "insufficient_gold"
  | "maximum_level"
  | "unsupported_level_data";

export interface CardProgressionView {
  availability: CardUpgradeAvailability;
  filledElements: number;
  isGoldLevel: boolean;
  minimumGoldCost: number | null;
  percent: number;
  powerAfterLevel: number | null;
  powerIncrease: number | null;
  requiredElements: number;
  requiredGold: number | null;
  storedOverflowElements: number;
  targetLevel: number | null;
}

export interface PlayerCardDetailResponse {
  card: PlayerCardInstance;
  inActiveDeck: boolean;
  progression: CardProgressionView;
}

export interface AbsorptionCandidatesResponse extends WeakPlayerCardsResponse {}

export interface AbsorbCardsRequest {
  fodderInstanceIds: string[];
}

export interface AbsorptionPreviewResponse {
  addedElements: number;
  afterPercent: number;
  afterElements: number;
  beforePercent: number;
  beforeElements: number;
  requiredElements: number;
  resultingStoredElements: number;
  selectedCards: number;
}

export interface CardProgressionActionResponse extends PlayerCardDetailResponse {
  consumedInstanceIds: string[];
  deckPower?: number;
  playerGold: number;
}
