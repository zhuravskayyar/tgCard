export const NICKNAME_SKIN_IDS = ["blood_moon", "starforged", "broken_signal"] as const;

export type NicknameSkinId = (typeof NICKNAME_SKIN_IDS)[number];

export interface NicknameSkinDefinition {
  className: "blood-moon" | "starforged" | "broken-signal";
  effect: "blood" | "celestial" | "glitch";
  id: NicknameSkinId;
  name: "Blood Moon" | "Starforged" | "Broken Signal";
  rarity: "mythic";
}

export const NICKNAME_SKINS: Readonly<Record<NicknameSkinId, NicknameSkinDefinition>> = Object.freeze({
  blood_moon: Object.freeze({
    className: "blood-moon",
    effect: "blood",
    id: "blood_moon",
    name: "Blood Moon",
    rarity: "mythic",
  }),
  starforged: Object.freeze({
    className: "starforged",
    effect: "celestial",
    id: "starforged",
    name: "Starforged",
    rarity: "mythic",
  }),
  broken_signal: Object.freeze({
    className: "broken-signal",
    effect: "glitch",
    id: "broken_signal",
    name: "Broken Signal",
    rarity: "mythic",
  }),
});

export const NICKNAME_SKIN_PACK_ID = "nickname_skin_pack_01" as const;

export interface NicknameSkinShopOffer {
  canAfford: boolean;
  choices: NicknameSkinDefinition[];
  currency: "arena_tokens";
  equippedSkinId: NicknameSkinId | null;
  id: typeof NICKNAME_SKIN_PACK_ID;
  name: "Міфічне оформлення I";
  ownedSkinIds: NicknameSkinId[];
  price: 250;
  progress: {
    owned: number;
    total: 3;
  };
  subtitle: "Обери один: Blood Moon / Starforged / Broken Signal";
  tokenBalance: number;
  type: "nickname_skin_choice";
}

export interface NicknameSkinCatalogResponse {
  offer: NicknameSkinShopOffer;
}

export interface PlayerInventoryCosmetic {
  cosmeticType: "nickname_skin";
  equipped: boolean;
  id: NicknameSkinId;
  name: NicknameSkinDefinition["name"];
  rarity: "mythic";
}

export interface PlayerInventoryItem {
  id: string;
  name: string;
  quantity: number;
  type: string;
}

export interface PlayerInventoryResponse {
  cosmetics: PlayerInventoryCosmetic[];
  equippedNicknameSkin: NicknameSkinId | null;
  items: PlayerInventoryItem[];
}

export interface NicknameSkinPurchaseRequest {
  choiceId: NicknameSkinId;
}

export interface NicknameSkinPurchaseResponse {
  acquiredSkin: NicknameSkinId;
  inventory: PlayerInventoryResponse;
  offer: NicknameSkinShopOffer;
  updatedBalance: {
    arenaTokens: number;
  };
}

export interface EquipNicknameSkinRequest {
  skinId: NicknameSkinId | null;
}

export interface EquipNicknameSkinResponse {
  inventory: PlayerInventoryResponse;
}
