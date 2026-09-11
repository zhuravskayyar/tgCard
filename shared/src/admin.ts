import type { CardElement, CardRarity, CardSource } from "./card.js";

export type AdminCurrency = "silver" | "gold";

export type AdminAuditAction =
  | "PLAYER_ADD_SILVER"
  | "PLAYER_REMOVE_SILVER"
  | "PLAYER_ADD_GOLD"
  | "PLAYER_REMOVE_GOLD"
  | "PLAYER_LEVEL_CHANGE"
  | "PLAYER_ADD_CARD"
  | "PLAYER_REMOVE_CARD";

export interface AdminIdentity {
  displayName: string;
  playerId: string;
  telegramUserId: string;
}

export interface AdminSessionResponse {
  admin: AdminIdentity;
}

export interface AdminDashboardResponse {
  cards: {
    definitions: number;
    mostPopular: null | {
      cardId: string;
      displayName: string;
      ownedCopies: number;
    };
    ownedInstances: number;
    rarityCounts: Record<CardRarity, number>;
  };
  economy: {
    averageGold: number;
    averageSilver: number;
    totalGold: number;
    totalSilver: number;
  };
  gameData: {
    duelLosses: number;
    duelWins: number;
    duels: number;
    limitedPromoRedemptions: number;
    shopActivityConnected: false;
  };
  players: {
    activeLast24Hours: null;
    newLast7Days: number;
    newToday: number;
    total: number;
  };
}

export interface AdminPagination {
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export interface AdminPlayerListItem {
  createdAt: string;
  firstName: string;
  gold: number;
  id: string;
  lastName: string | null;
  level: number;
  nickname: string | null;
  silver: number;
  telegramUserId: string | null;
  updatedAt: string;
  username: string | null;
}

export interface AdminPlayersResponse extends AdminPagination {
  players: AdminPlayerListItem[];
}

export interface AdminOwnedCard {
  basePower: number;
  bonusPower: number;
  cardId: string;
  code: string;
  collectionId: string | null;
  displayName: string | null;
  element: CardElement;
  finalPower: number;
  inDeck: boolean;
  instanceId: string;
  level: number;
  rarity: CardRarity;
  slot: number | null;
}

export interface AdminPlayerDetailResponse {
  cards: AdminOwnedCard[];
  cardsPagination: AdminPagination;
  deck: AdminOwnedCard[];
  player: AdminPlayerListItem;
}

export interface AdminCardDefinitionItem {
  artKey: string | null;
  code: string;
  collectionId: string | null;
  collectionName: string | null;
  description: string;
  displayName: string | null;
  element: CardElement;
  id: string;
  limited: boolean;
  minRarity: CardRarity;
  ownedCopies: number;
  shopEligible: boolean;
  source: CardSource;
}

export interface AdminCardsResponse extends AdminPagination {
  cards: AdminCardDefinitionItem[];
}

export interface AdminAuditLogItem {
  action: AdminAuditAction | string;
  adminPlayerId: string | null;
  adminTelegramUserId: string;
  after: unknown;
  before: unknown;
  createdAt: string;
  entityId: string;
  entityType: string;
  id: string;
  metadata: unknown;
}

export interface AdminAuditResponse extends AdminPagination {
  logs: AdminAuditLogItem[];
}

export interface AdminPlayerMutationResponse {
  message: string;
  player: AdminPlayerListItem;
}

export interface AdminCardGrantResponse {
  createdCards: AdminOwnedCard[];
  deckChanged: boolean;
  deckPower: number | null;
  message: string;
}

export interface AdminCardRemoveResponse {
  deckChanged: boolean;
  deckPower: number | null;
  message: string;
  removedInstanceId: string;
}
