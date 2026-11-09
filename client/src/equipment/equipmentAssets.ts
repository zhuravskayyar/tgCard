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

/** One sprite per type: things are tinted by element in CSS, artifacts have no element. */
export function getEquipmentSpritePath(definition: Pick<EquipmentDefinition, "assetKey" | "category" | "slot">) {
  return definition.category === "artifacts"
    ? `${EQUIPMENT_ASSET_ROOT}/artifacts-v3/${definition.assetKey}${EQUIPMENT_SPRITE_EXTENSION}`
    : `${EQUIPMENT_ASSET_ROOT}/items-v3/${definition.slot}${EQUIPMENT_SPRITE_EXTENSION}`;
}

export function getEquipmentRarityClass(rarity: CardRarity) {
  return EQUIPMENT_RARITY_CLASSES[rarity];
}

export function getEquipmentSpriteFolder(category: EquipmentCategory) {
  return category === "artifacts" ? "artifacts" : "items";
}
