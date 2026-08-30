import type { PlayerBalance } from "./shop.js";

export type PlayerMailActionType = "none" | "nickname_change";
export type PlayerMailAction = "change" | "leave";

export interface PlayerMailMessage {
  actionCompletedAt: string | null;
  actionType: PlayerMailActionType;
  body: string;
  claimedAt: string | null;
  createdAt: string;
  gold: number;
  id: string;
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
