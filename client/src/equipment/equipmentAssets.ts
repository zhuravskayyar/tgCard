import type { CardRarity, EquipmentCategory, EquipmentDefinition } from "@cardastika/shared";

export const EQUIPMENT_ASSET_ROOT = "/assets/equipment";
export const EQUIPMENT_SPRITE_EXTENSION = ".webp";

export const EQUIPMENT_RARITY_CLASSES: Readonly<Record<CardRarity, string>> = {
  common: "rarity-common",
  uncommon: "rarity-uncommon",
  rare: "rarity-rare",
  epic: "rarity-epic",
  legendary: "rarity-legendary",
  mythic: "rarity-mythic",
};

export function getEquipmentSpritePath(definition: Pick<EquipmentDefinition, "assetKey" | "category">) {
  const folder = definition.category === "artifacts" ? "artifacts" : "items";
  return `${EQUIPMENT_ASSET_ROOT}/${folder}/${definition.assetKey}${EQUIPMENT_SPRITE_EXTENSION}`;
}

export function getEquipmentRarityClass(rarity: CardRarity) {
  return EQUIPMENT_RARITY_CLASSES[rarity];
}

export function getEquipmentSpriteFolder(category: EquipmentCategory) {
  return category === "artifacts" ? "artifacts" : "items";
}
