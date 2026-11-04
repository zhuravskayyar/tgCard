import type { CardElement, EquipmentSlot } from "@cardastika/shared";

const EQUIPMENT_ICON_BASE = "/assets/ui/world-tree/game-icons";
const SLOT_ICON_BASE = "/assets/ui/icons";

// Painted slot icons.
export const EQUIPMENT_SLOT_ICON_SOURCES: Readonly<Record<EquipmentSlot, string>> = {
  head: `${SLOT_ICON_BASE}/slot-head-v1.webp`,
  cloak: `${SLOT_ICON_BASE}/slot-cloak-v1.webp`,
  gloves: `${SLOT_ICON_BASE}/slot-gloves-v1.webp`,
  boots: `${SLOT_ICON_BASE}/slot-boots-v1.webp`,
  weapon: `${SLOT_ICON_BASE}/slot-weapon-v1.webp`,
  shield: `${SLOT_ICON_BASE}/slot-shield-v1.webp`,
  amulet: `${SLOT_ICON_BASE}/slot-amulet-v1.webp`,
  relic: `${SLOT_ICON_BASE}/slot-relic-v1.webp`,
  voodoo: `${SLOT_ICON_BASE}/slot-charm-v1.webp`,
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
