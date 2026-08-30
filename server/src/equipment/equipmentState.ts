import { STARTER_EQUIPMENT_DEFINITIONS } from "@cardastika/game-core";
import {
  EQUIPMENT_SLOTS,
  type EquippedEquipment,
  type PlayerEquipment,
  type PublicPlayerEquipment,
} from "@cardastika/shared";

export class EquipmentValidationError extends Error {
  constructor(message = "Equipment state is invalid") {
    super(message);
    this.name = "EquipmentValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function emptyEquipment(playerId: string): PlayerEquipment {
  const equipped = {} as EquippedEquipment;
  for (const slot of EQUIPMENT_SLOTS) equipped[slot] = null;
  return {
    playerId,
    equipped,
  };
}

export function parseStoredEquipment(playerId: string, value: unknown): PlayerEquipment {
  const equipment = emptyEquipment(playerId);
  const storedEquipped = isRecord(value) && isRecord(value.equipped) ? value.equipped : null;
  if (!storedEquipped) return equipment;

  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = storedEquipped[slot];
    if (itemId === null) {
      equipment.equipped[slot] = null;
      continue;
    }
    if (typeof itemId !== "string") continue;
    const definition = STARTER_EQUIPMENT_DEFINITIONS.find((candidate) => candidate.id === itemId && candidate.slot === slot && candidate.isEnabled);
    if (definition) equipment.equipped[slot] = definition.id;
  }
  return equipment;
}

export function validateEquipmentUpdate(value: unknown): EquippedEquipment {
  if (!isRecord(value) || Object.keys(value).length !== EQUIPMENT_SLOTS.length) {
    throw new EquipmentValidationError("Every equipment slot must be provided");
  }

  const equipped = {} as EquippedEquipment;
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = value[slot];
    if (itemId === null) {
      equipped[slot] = null;
      continue;
    }
    if (typeof itemId !== "string") throw new EquipmentValidationError(`Invalid item in ${slot}`);
    const definition = STARTER_EQUIPMENT_DEFINITIONS.find((candidate) => candidate.id === itemId && candidate.slot === slot && candidate.isEnabled);
    if (!definition) throw new EquipmentValidationError(`Item does not fit ${slot}`);
    equipped[slot] = definition.id;
  }
  return equipped;
}

export function toPublicPlayerEquipment(playerId: string, value: unknown): PublicPlayerEquipment {
  return { equipped: parseStoredEquipment(playerId, value).equipped };
}

export function serializeEquipment(equipped: EquippedEquipment) {
  return JSON.stringify({ equipped });
}
