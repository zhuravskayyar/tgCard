import type { CardElement, CardRarity } from "./card.js";
import type { PlayerCollectionBonus } from "./collection.js";
import type { NicknameSkinId } from "./cosmetics.js";
import type { PublicPlayerEquipment } from "./equipment.js";

export const PLAYER_NICKNAME_MAX_LENGTH = 10;

export function getDefaultPlayerNickname(username: string | null | undefined, firstName: string) {
  const source = username?.trim() || firstName.trim() || "Гравець";
  return Array.from(source).slice(0, PLAYER_NICKNAME_MAX_LENGTH).join("");
}

export function getPlayerDisplayName(player: Pick<PlayerSummary, "firstName" | "nickname" | "username">) {
  return player.nickname?.trim() || player.username?.trim() || player.firstName;
}

export interface PlayerNicknameUpdateRequest {
  nickname: string;
}

export interface PlayerNicknameUpdateResponse {
  nickname: string;
}

export interface PlayerSummary {
  accountXp?: number;
  accountXpRequired?: number;
  arenaLeagueIndex?: number;
  arenaRating?: number;
  arenaTokens?: number;
  arenaTop3Count?: number;
  arenaWins?: number;
  cardShards?: number;
  collectionBonuses?: PlayerCollectionBonus[];
  experienceRewardPct?: number;
  firstName: string;
  gold: number;
  id: string;
  tutorialEligible?: boolean;
  duelWins?: number;
  equipment?: PublicPlayerEquipment;
  equippedNicknameSkin?: NicknameSkinId | null;
  duelHighestLeagueIndex?: number;
  duelRating?: number;
  level: number;
  nickname?: string | null;
  photoUrl: string | null;
  rating?: number;
  silver: number;
  username: string | null;
}

export interface PublicPlayerCard {
  artKey: string | null;
  cardId: string;
  displayName: string | null;
  element: CardElement;
  finalPower: number;
  instanceId: string;
  level: number;
  rarity: CardRarity;
}

export interface PublicPlayerProfile {
  deckPower: number;
  displayName: string;
  duelHighestLeagueIndex?: number;
  duelRating: number;
  duelWins: number;
  id: string;
  equipment?: PublicPlayerEquipment;
  level: number;
  photoUrl: string | null;
  strongestCards: PublicPlayerCard[];
}

export interface TelegramAuthRequest {
  initData: string;
}
