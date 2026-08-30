import {
  getBasePowerForLevel,
  getCardPower,
  getRarityForLevel,
} from "@cardastika/game-core";
import type { PlayerCardInstance } from "@cardastika/shared";

export interface CardInstanceProjectionRow {
  art_key: string | null;
  bonus_power: string | number;
  card_id: string;
  code: string;
  collection_id: string | null;
  display_name: string | null;
  element: PlayerCardInstance["element"];
  instance_id: string;
  level: string | number;
  level_progress_elements: string | number;
  limited?: boolean;
  protected_from_absorption?: boolean;
  stored_elements: string | number;
}

function toInteger(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field} returned by database`);
  return parsed;
}

function toProgressNumber(value: string | number, field: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  const rounded = Math.round(parsed * 100);
  if (
    !Number.isFinite(parsed)
    || parsed < 0
    || !Number.isSafeInteger(rounded)
    || Math.abs(parsed - rounded / 100) > 1e-9
  ) {
    throw new Error(`Invalid ${field} returned by database`);
  }
  return parsed;
}

export function mapCardInstanceRow(row: CardInstanceProjectionRow): PlayerCardInstance {
  const level = toInteger(row.level, "card level");
  const bonusPower = toInteger(row.bonus_power, "card bonus power");
  const levelProgressElements = toProgressNumber(row.level_progress_elements, "card level progress");
  const storedElements = toProgressNumber(row.stored_elements, "stored card elements");
  const basePower = getBasePowerForLevel(level);
  return {
    instanceId: row.instance_id,
    cardId: row.card_id,
    code: row.code,
    displayName: row.display_name,
    artKey: row.art_key,
    element: row.element,
    level,
    levelProgressElements,
    limited: row.limited ?? false,
    protectedFromAbsorption: row.protected_from_absorption ?? false,
    basePower,
    bonusPower,
    finalPower: getCardPower({ level, bonusPower }),
    rarity: getRarityForLevel(level),
    storedElements,
    collectionId: row.collection_id,
  };
}
