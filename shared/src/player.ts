import type { CardElement, CardRarity, PlayerCardInstance } from "./card.js";
import type { PlayerCollectionBonus } from "./collection.js";
import type { NicknameSkinId } from "./cosmetics.js";
import type { PublicPlayerEquipment } from "./equipment.js";

export const PLAYER_NICKNAME_MAX_LENGTH = 10;

/** Finishing the tutorial grants its reward card once; later calls return rewardCard: null. */
export interface TutorialCompletionResponse {
  player: PlayerSummary;
  rewardCard: PlayerCardInstance | null;
}

export function getDefaultPlayerNickname(username: string | null | undefined, firstName: string) {
  const source = username?.trim() || firstName.trim() || "Гравець";
  return Array.from(source).slice(0, PLAYER_NICKNAME_MAX_LENGTH).join("");
}

export function getPlayerDisplayName(player: Pick<PlayerSummary, "firstName" | "nickname" | "username">) {
  return player.nickname?.trim() || player.username?.trim() || player.firstName;
}

/** Cardastika's own portraits; a chosen one is stored as "avatar:NN". */
export const PLAYER_AVATAR_COUNT = 20;

export function toPlayerAvatarId(index: number) {
  return `avatar:${String(index).padStart(2, "0")}`;
}

/** Returns the portrait number of a stored "avatar:NN" value, or null. */
export function parsePlayerAvatarId(value: string | null | undefined) {
  const match = value?.match(/^avatar:(\d{2})$/);
  const index = match ? Number(match[1]) : 0;
  return index >= 1 && index <= PLAYER_AVATAR_COUNT ? index : null;
}

export interface PlayerAvatarUpdateResponse {
  photoUrl: string;
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
  arenaTop3Count?: number;
  arenaWins?: number;
  cardShards?: number;
  collectionBonuses?: PlayerCollectionBonus[];
  daysInGame?: number;
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
  /** Completed collection ids; the profile uses them for collection bonuses such as «Вибір …» on equipment. */
  completedCollectionIds?: string[];
  deckPower: number;
  displayName: string;
  duelHighestLeagueIndex?: number;
  duelRating: number;
  duelWins: number;
  id: string;
  equipment?: PublicPlayerEquipment;
  level: number;
  mageElement: CardElement;
  photoUrl: string | null;
  strongestCards: PublicPlayerCard[];
}

export interface TelegramAuthRequest {
  initData: string;
}
