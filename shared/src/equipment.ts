import type { CardElement, CardRarity } from "./card.js";

export const EQUIPMENT_SLOTS = [
  "head",
  "cloak",
  "gloves",
  "boots",
  "weapon",
  "shield",
  "amulet",
  "relic",
  "voodoo",
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type EquipmentElement = CardElement | null;
export type EquipmentCategory = "things" | "artifacts";
export type EquipmentBonusType =
  | "element_power"
  | "outgoing_damage"
  | "incoming_damage_reduction"
  | "damage_reflection"
  | "health_reduction"
  | "save_once"
  | "passive";

export interface EquipmentDefinition {
  id: string;
  code: string;
  name: string;
  slot: EquipmentSlot;
  category: EquipmentCategory;
  element: EquipmentElement;
  rarity: CardRarity;
  /** Stable base sprite key. It must not contain rarity. */
  assetKey: string;
  /** CSS rarity token, for example `rarity-epic`; not an image path. */
  frameKey: string;
  /** Stable generic fallback icon key, normally the equipment slot. */
  iconKey: string;
  bonusType: EquipmentBonusType;
  bonusValue: number;
  secondaryBonusType?: EquipmentBonusType;
  secondaryBonusValue?: number;
  description: string;
  /** Optional non-rarity effect asset. Rarity VFX are CSS-only. */
  effectKey?: string;
  flavorText: string;
  isEnabled: boolean;
}

export type EquippedEquipment = Record<EquipmentSlot, string | null>;

export interface PlayerEquipment {
  playerId: string;
  equipped: EquippedEquipment;
}

export interface PublicPlayerEquipment {
  equipped: EquippedEquipment;
}

export interface PlayerEquipmentUpdateRequest {
  equipped: EquippedEquipment;
}

export interface PlayerEquipmentResponse {
  equipment: PublicPlayerEquipment;
  inventory: PlayerEquipmentInventory[];
}

export interface EquipmentBattleModifiers {
  damageReflectionPct: number;
  incomingDamageReductionPct: number;
  outgoingDamagePct: number;
  reviveHpPct: number;
  voodooHpReductionPct: number;
}

export interface EquipmentBattleState {
  reviveUsed: boolean;
  voodooUsed: boolean;
}

export interface PlayerEquipmentInventory {
  playerId: string;
  itemId: string;
  quantity: number;
}
