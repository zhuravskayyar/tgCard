import type { CardElement } from "./card.js";
import type { PlayerBalance } from "./shop.js";

export type PlayerMailActionType = "none" | "nickname_change";
export type PlayerMailAction = "change" | "leave";

export interface PlayerMailCardReward {
  artKey: string | null;
  cardId: string;
  code: string;
  displayName: string | null;
  element: CardElement;
  level: number;
}

export interface PlayerMailMessage {
  actionCompletedAt: string | null;
  actionType: PlayerMailActionType;
  body: string;
  claimedAt: string | null;
  createdAt: string;
  gold: number;
  id: string;
  cardReward: PlayerMailCardReward | null;
  silver: number;
  subject: string;
}

export interface PlayerMailResponse {
  messages: PlayerMailMessage[];
  unreadCount: number;
}

export interface PlayerMailClaimResponse {
  claimed: boolean;
  claimedAt: string;
  messageId: string;
  updatedBalance: PlayerBalance;
}

export interface PlayerMailActionResponse {
  action: PlayerMailAction;
  actionCompletedAt: string;
  messageId: string;
}
