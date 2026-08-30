import { EQUIPMENT_SLOTS, type EquippedEquipment, type PlayerEquipmentInventory } from "@cardastika/shared";

export const EMPTY_EQUIPMENT: EquippedEquipment = {
  amulet: null,
  boots: null,
  cloak: null,
  gloves: null,
  head: null,
  relic: null,
  shield: null,
  weapon: null,
  voodoo: null,
};

export type EquipmentInventoryStatus = "loading" | "ready" | "unavailable" | "error";

export function isEmptyEquipment(equipped: EquippedEquipment) {
  return EQUIPMENT_SLOTS.every((slot) => equipped[slot] === null);
}

export function reconcileEquipment(equipped: EquippedEquipment, inventory: readonly PlayerEquipmentInventory[]): EquippedEquipment {
  const ownedItemIds = new Set(inventory.filter((entry) => entry.quantity > 0).map((entry) => entry.itemId));
  const reconciled = { ...EMPTY_EQUIPMENT };
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = equipped[slot];
    reconciled[slot] = itemId && ownedItemIds.has(itemId) ? itemId : null;
  }
  return reconciled;
}
