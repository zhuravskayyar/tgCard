export const NICKNAME_SKIN_IDS = ["blood_moon", "starforged", "broken_signal"] as const;

export type NicknameSkinId = (typeof NICKNAME_SKIN_IDS)[number];

/** Medieval manuscript styles. Ids stay the original ones so owned skins keep working. */
export interface NicknameSkinDefinition {
  className: "nickname-skin--cinnabar" | "nickname-skin--gilded" | "nickname-skin--runic";
  effect: "cinnabar" | "gilded" | "runic";
  id: NicknameSkinId;
  name: "Кіновар" | "Сусальне золото" | "Рунне срібло";
  rarity: "mythic";
}

export const NICKNAME_SKINS: Readonly<Record<NicknameSkinId, NicknameSkinDefinition>> = Object.freeze({
  blood_moon: Object.freeze({
    className: "nickname-skin--cinnabar",
    effect: "cinnabar",
    id: "blood_moon",
    name: "Кіновар",
    rarity: "mythic",
  }),
  starforged: Object.freeze({
    className: "nickname-skin--gilded",
    effect: "gilded",
    id: "starforged",
    name: "Сусальне золото",
    rarity: "mythic",
  }),
  broken_signal: Object.freeze({
    className: "nickname-skin--runic",
    effect: "runic",
    id: "broken_signal",
    name: "Рунне срібло",
    rarity: "mythic",
  }),
});

export const NICKNAME_SKIN_PACK_ID = "nickname_skin_pack_01" as const;

export interface NicknameSkinShopOffer {
  canAfford: boolean;
  choices: NicknameSkinDefinition[];
  currency: "gold";
  equippedSkinId: NicknameSkinId | null;
  id: typeof NICKNAME_SKIN_PACK_ID;
  name: "Міфічне оформлення I";
  ownedSkinIds: NicknameSkinId[];
  price: 250;
  progress: {
    owned: number;
    total: 3;
  };
  subtitle: "Обери один: Кіновар / Сусальне золото / Рунне срібло";
  goldBalance: number;
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
    gold: number;
  };
}

export interface EquipNicknameSkinRequest {
  skinId: NicknameSkinId | null;
}

export interface EquipNicknameSkinResponse {
  inventory: PlayerInventoryResponse;
}
