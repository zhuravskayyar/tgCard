import type { CardElement, EquipmentSlot } from "@cardastika/shared";

const EQUIPMENT_ICON_BASE = "/assets/ui/world-tree/game-icons";

export const EQUIPMENT_SLOT_ICON_SOURCES: Readonly<Record<EquipmentSlot, string>> = {
  head: `${EQUIPMENT_ICON_BASE}/equipment-pointy-hat.svg`,
  cloak: `${EQUIPMENT_ICON_BASE}/equipment-robe.svg`,
  gloves: `${EQUIPMENT_ICON_BASE}/equipment-gauntlet.svg`,
  boots: `${EQUIPMENT_ICON_BASE}/equipment-boots.svg`,
  weapon: `${EQUIPMENT_ICON_BASE}/equipment-crossed-swords.svg`,
  shield: `${EQUIPMENT_ICON_BASE}/equipment-shield.svg`,
  amulet: `${EQUIPMENT_ICON_BASE}/equipment-gem-pendant.svg`,
  relic: `${EQUIPMENT_ICON_BASE}/equipment-polar-star.svg`,
  voodoo: `${EQUIPMENT_ICON_BASE}/equipment-voodoo.svg`,
};

export const EQUIPMENT_UI_ICON_SOURCES = {
  all: `${EQUIPMENT_ICON_BASE}/equipment-star-circle.svg`,
  equipment: `${EQUIPMENT_ICON_BASE}/equipment-star-circle.svg`,
  forge: `${EQUIPMENT_ICON_BASE}/equipment-anvil.svg`,
} as const;

export type EquipmentIconName = EquipmentSlot | keyof typeof EQUIPMENT_UI_ICON_SOURCES;

export const EQUIPMENT_ICON_SOURCES: Readonly<Record<EquipmentIconName, string>> = {
  ...EQUIPMENT_SLOT_ICON_SOURCES,
  ...EQUIPMENT_UI_ICON_SOURCES,
};

export const ELEMENT_ICONS: Readonly<Record<CardElement | "all", string>> = {
  fire: "/assets/ui/world-tree/game-icons/element-fire.svg",
  water: "/assets/ui/world-tree/game-icons/element-water.svg",
  air: "/assets/ui/world-tree/game-icons/element-air.svg",
  earth: "/assets/ui/world-tree/game-icons/element-earth.svg",
  all: "/assets/ui/world-tree/game-icons/element-all.svg",
};

export const EQUIPMENT_ELEMENT_ICONS: Readonly<Record<CardElement, string>> = {
  fire: ELEMENT_ICONS.fire,
  water: ELEMENT_ICONS.water,
  air: ELEMENT_ICONS.air,
  earth: ELEMENT_ICONS.earth,
};

export const EQUIPMENT_ELEMENT_ORDER: readonly CardElement[] = ["fire", "water", "air", "earth"];
